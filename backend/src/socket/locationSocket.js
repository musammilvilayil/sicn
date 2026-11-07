const { Server } = require('socket.io');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Node = require('../models/Node');
const User = require('../models/User');

const rooms = new Map();
const socketToRoom = new Map();
const ROOM_TTL_MS = 60 * 60 * 1000;
const MAX_ROOM_MEMBERS = 12;
const LOCATION_UPDATE_INTERVAL_MS = 1200;

function pruneExpiredRooms(io) {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.expiresAt <= now) {
      rooms.delete(code);
      for (const [socketId, activeCode] of socketToRoom.entries()) {
        if (activeCode === code) {
          socketToRoom.delete(socketId);
          io?.sockets?.sockets?.get(socketId)?.leave(code);
        }
      }
    }
  }
}

function generateSixDigitCode(io) {
  pruneExpiredRooms(io);
  let code;
  do {
    code = String(crypto.randomInt(100000, 1000000));
  } while (rooms.has(code));
  return code;
}

function memberIdentity(socket, payload, fallbackName) {
  const account = socket.data.user;
  const requestedName = typeof payload.userName === 'string'
    ? payload.userName.trim().slice(0, 40)
    : '';
  return {
    userName: account?.name || requestedName || fallbackName,
    role: account?.role || 'Normal_User',
    avatarColor: account?.avatarColor || '#2563eb',
  };
}

async function resolveNodeDetails(nodeIdOrQr) {
  const query = String(nodeIdOrQr || 'GF-MAIN-ENTRANCE').trim();
  const node = await Node.findOne({
    $or: [
      { nodeId: query.toUpperCase() },
      { qrCode: query },
      { qrCode: query.toUpperCase() },
    ],
  }).lean();

  if (!node) return null;
  return {
    nodeId: node.nodeId,
    nodeName: node.name,
    floor: node.floor,
    coordinates: node.coordinates,
  };
}

function removeSocketFromCurrentRoom(io, socket) {
  const currentCode = socketToRoom.get(socket.id);
  if (!currentCode) return;

  socket.leave(currentCode);
  socketToRoom.delete(socket.id);
  const room = rooms.get(currentCode);
  if (!room) return;

  const departingMember = room.members.get(socket.id);
  room.members.delete(socket.id);
  if (room.members.size === 0) {
    rooms.delete(currentCode);
    return;
  }

  const membersList = Array.from(room.members.values());
  io.to(currentCode).emit('member_left', {
    socketId: socket.id,
    userName: departingMember?.userName || 'Friend',
  });
  io.to(currentCode).emit('room_state', { roomCode: currentCode, members: membersList });
}

function initLocationSocket(httpServer) {
  const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : false,
      methods: ['GET', 'POST'],
    },
  });

  // A guest may join as Normal_User. Authenticated roles and profile details
  // are always resolved from the signed token, never trusted from the client.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.data.user = null;
      return next();
    }
    try {
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        return next(new Error('Authentication service is not configured.'));
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id name email role avatarColor mustChangePassword');
      if (!user) return next(new Error('Session is no longer valid.'));
      if (user.mustChangePassword) return next(new Error('Change your temporary password before using live sharing.'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('Invalid or expired session.'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('create_room', async (payload = {}, ack) => {
      try {
        removeSocketFromCurrentRoom(io, socket);
        const roomCode = generateSixDigitCode(io);
        const nodeDetails = await resolveNodeDetails(payload.nodeId);
        if (!nodeDetails) {
          if (typeof ack === 'function') ack({ success: false, message: 'Unknown campus checkpoint.' });
          return;
        }

        const member = {
          socketId: socket.id,
          ...memberIdentity(socket, payload, 'Campus Explorer'),
          ...nodeDetails,
          updatedAt: new Date().toISOString(),
        };
        const roomObj = {
          code: roomCode,
          hostSocketId: socket.id,
          createdAt: new Date().toISOString(),
          expiresAt: Date.now() + ROOM_TTL_MS,
          members: new Map([[socket.id, member]]),
        };

        rooms.set(roomCode, roomObj);
        socketToRoom.set(socket.id, roomCode);
        socket.join(roomCode);
        const membersList = Array.from(roomObj.members.values());
        io.to(roomCode).emit('room_state', { roomCode, members: membersList });
        if (typeof ack === 'function') ack({ success: true, roomCode, members: membersList, me: member });
      } catch (err) {
        console.error('Socket create_room error:', err);
        if (typeof ack === 'function') ack({ success: false, message: 'Failed to create sharing room.' });
      }
    });

    socket.on('join_room', async (payload = {}, ack) => {
      try {
        const cleanCode = String(payload.roomCode || '').trim();
        if (!/^\d{6}$/.test(cleanCode)) {
          if (typeof ack === 'function') ack({ success: false, message: 'Enter a valid 6-digit room code.' });
          return;
        }

        pruneExpiredRooms(io);
        const roomObj = rooms.get(cleanCode);
        if (!roomObj || roomObj.expiresAt <= Date.now()) {
          if (typeof ack === 'function') ack({ success: false, message: 'Room not found or expired.' });
          return;
        }
        if (roomObj.members.size >= MAX_ROOM_MEMBERS) {
          if (typeof ack === 'function') ack({ success: false, message: 'This sharing room is full.' });
          return;
        }

        const nodeDetails = await resolveNodeDetails(payload.nodeId);
        if (!nodeDetails) {
          if (typeof ack === 'function') ack({ success: false, message: 'Unknown campus checkpoint.' });
          return;
        }

        removeSocketFromCurrentRoom(io, socket);
        const member = {
          socketId: socket.id,
          ...memberIdentity(socket, payload, 'Friend'),
          ...nodeDetails,
          updatedAt: new Date().toISOString(),
        };
        roomObj.members.set(socket.id, member);
        socketToRoom.set(socket.id, cleanCode);
        socket.join(cleanCode);

        const membersList = Array.from(roomObj.members.values());
        socket.to(cleanCode).emit('member_joined', { member });
        io.to(cleanCode).emit('room_state', { roomCode: cleanCode, members: membersList });
        if (typeof ack === 'function') ack({ success: true, roomCode: cleanCode, members: membersList, me: member });
      } catch (err) {
        console.error('Socket join_room error:', err);
        if (typeof ack === 'function') ack({ success: false, message: 'Failed to join sharing room.' });
      }
    });

    socket.on('update_location', async (payload = {}, ack) => {
      try {
        pruneExpiredRooms(io);
        const activeCode = socketToRoom.get(socket.id);
        if (!activeCode || !rooms.has(activeCode)) {
          if (typeof ack === 'function') ack({ success: false, message: 'Not in an active sharing room.' });
          return;
        }

        const roomObj = rooms.get(activeCode);
        if (socket.data.lastLocationUpdate && Date.now() - socket.data.lastLocationUpdate < LOCATION_UPDATE_INTERVAL_MS) {
          if (typeof ack === 'function') ack({ success: false, message: 'Please wait before sending another location update.' });
          return;
        }
        const existingMember = roomObj.members.get(socket.id);
        if (!existingMember) {
          if (typeof ack === 'function') ack({ success: false, message: 'Member not registered in room.' });
          return;
        }

        const nodeDetails = await resolveNodeDetails(payload.nodeId);
        if (!nodeDetails) {
          if (typeof ack === 'function') ack({ success: false, message: 'Unknown campus checkpoint.' });
          return;
        }
        socket.data.lastLocationUpdate = Date.now();

        const updatedMember = {
          ...existingMember,
          ...nodeDetails,
          updatedAt: new Date().toISOString(),
        };
        roomObj.members.set(socket.id, updatedMember);
        const membersList = Array.from(roomObj.members.values());
        io.to(activeCode).emit('location_updated', { roomCode: activeCode, member: updatedMember });
        io.to(activeCode).emit('room_state', { roomCode: activeCode, members: membersList });
        if (typeof ack === 'function') ack({ success: true, roomCode: activeCode, member: updatedMember });
      } catch (err) {
        console.error('Socket update_location error:', err);
        if (typeof ack === 'function') ack({ success: false, message: 'Failed to broadcast location update.' });
      }
    });

    socket.on('leave_room', (_payload, ack) => {
      removeSocketFromCurrentRoom(io, socket);
      if (typeof ack === 'function') ack({ success: true });
    });

    socket.on('disconnect', () => removeSocketFromCurrentRoom(io, socket));
  });

  return io;
}

module.exports = { initLocationSocket, rooms };
