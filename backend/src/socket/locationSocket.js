const { Server } = require('socket.io');
const Node = require('../models/Node');

// Active 6-digit sharing rooms in memory
const rooms = new Map();
const socketToRoom = new Map();

function generateSixDigitCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

async function resolveNodeDetails(nodeIdOrQr) {
  const query = (nodeIdOrQr || 'GF-MAIN-ENTRANCE').trim();
  const node = await Node.findOne({
    $or: [
      { nodeId: query.toUpperCase() },
      { qrCode: query },
      { qrCode: query.toUpperCase() },
    ],
  }).lean();

  if (node) {
    return {
      nodeId: node.nodeId,
      nodeName: node.name,
      floor: node.floor,
      coordinates: node.coordinates,
    };
  }

  return {
    nodeId: 'GF-MAIN-ENTRANCE',
    nodeName: 'Main Entrance & Porch',
    floor: 0,
    coordinates: { x: 50, y: 30, z: 0 },
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
  } else {
    const membersList = Array.from(room.members.values());
    io.to(currentCode).emit('member_left', {
      socketId: socket.id,
      userName: departingMember?.userName || 'Friend',
    });
    io.to(currentCode).emit('room_state', {
      roomCode: currentCode,
      members: membersList,
    });
  }
}

function initLocationSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    // 1. Create a new 6-digit Live Location Sharing Room
    socket.on('create_room', async (payload = {}, ack) => {
      try {
        removeSocketFromCurrentRoom(io, socket);

        const roomCode = generateSixDigitCode();
        const nodeDetails = await resolveNodeDetails(payload.nodeId);

        const member = {
          socketId: socket.id,
          userName: payload.userName || 'Campus Explorer',
          role: payload.role || 'Normal_User',
          avatarColor: payload.avatarColor || '#2563eb',
          ...nodeDetails,
          updatedAt: new Date().toISOString(),
        };

        const roomObj = {
          code: roomCode,
          hostSocketId: socket.id,
          createdAt: new Date().toISOString(),
          members: new Map([[socket.id, member]]),
        };

        rooms.set(roomCode, roomObj);
        socketToRoom.set(socket.id, roomCode);
        socket.join(roomCode);

        const membersList = Array.from(roomObj.members.values());
        io.to(roomCode).emit('room_state', { roomCode, members: membersList });

        if (typeof ack === 'function') {
          ack({ success: true, roomCode, members: membersList, me: member });
        }
      } catch (err) {
        console.error('Socket create_room error:', err);
        if (typeof ack === 'function') {
          ack({ success: false, message: 'Failed to create sharing room' });
        }
      }
    });

    // 2. Join an existing 6-digit Live Location Sharing Room
    socket.on('join_room', async (payload = {}, ack) => {
      try {
        const cleanCode = String(payload.roomCode || '').trim();
        if (!/^\d{6}$/.test(cleanCode)) {
          if (typeof ack === 'function') {
            return ack({ success: false, message: 'Please enter a valid 6-digit room code' });
          }
          return;
        }

        const roomObj = rooms.get(cleanCode);
        if (!roomObj) {
          if (typeof ack === 'function') {
            return ack({
              success: false,
              message: `Room #${cleanCode} was not found or has expired`,
            });
          }
          return;
        }

        removeSocketFromCurrentRoom(io, socket);

        const nodeDetails = await resolveNodeDetails(payload.nodeId);
        const member = {
          socketId: socket.id,
          userName: payload.userName || 'Friend',
          role: payload.role || 'Normal_User',
          avatarColor: payload.avatarColor || '#059669',
          ...nodeDetails,
          updatedAt: new Date().toISOString(),
        };

        roomObj.members.set(socket.id, member);
        socketToRoom.set(socket.id, cleanCode);
        socket.join(cleanCode);

        const membersList = Array.from(roomObj.members.values());

        socket.to(cleanCode).emit('member_joined', { member });
        io.to(cleanCode).emit('room_state', { roomCode: cleanCode, members: membersList });

        if (typeof ack === 'function') {
          ack({ success: true, roomCode: cleanCode, members: membersList, me: member });
        }
      } catch (err) {
        console.error('Socket join_room error:', err);
        if (typeof ack === 'function') {
          ack({ success: false, message: 'Failed to join sharing room' });
        }
      }
    });

    // 3. Broadcast Live Location Update (Triggered on QR Checkpoint Scan or Move)
    socket.on('update_location', async (payload = {}, ack) => {
      try {
        const activeCode = payload.roomCode || socketToRoom.get(socket.id);
        if (!activeCode || !rooms.has(activeCode)) {
          if (typeof ack === 'function') {
            return ack({ success: false, message: 'Not currently in an active sharing room' });
          }
          return;
        }

        const roomObj = rooms.get(activeCode);
        const existingMember = roomObj.members.get(socket.id);
        if (!existingMember) {
          if (typeof ack === 'function') {
            return ack({ success: false, message: 'Member not registered in room' });
          }
          return;
        }

        const nodeDetails = await resolveNodeDetails(payload.nodeId);
        const updatedMember = {
          ...existingMember,
          ...(payload.userName ? { userName: payload.userName } : {}),
          ...nodeDetails,
          updatedAt: new Date().toISOString(),
        };

        roomObj.members.set(socket.id, updatedMember);
        const membersList = Array.from(roomObj.members.values());

        // Broadcast instant avatar movement to everyone in the room
        io.to(activeCode).emit('location_updated', {
          roomCode: activeCode,
          member: updatedMember,
        });
        io.to(activeCode).emit('room_state', {
          roomCode: activeCode,
          members: membersList,
        });

        if (typeof ack === 'function') {
          ack({ success: true, roomCode: activeCode, member: updatedMember });
        }
      } catch (err) {
        console.error('Socket update_location error:', err);
        if (typeof ack === 'function') {
          ack({ success: false, message: 'Failed to broadcast location update' });
        }
      }
    });

    // 4. Leave Room explicitly
    socket.on('leave_room', (_payload, ack) => {
      removeSocketFromCurrentRoom(io, socket);
      if (typeof ack === 'function') {
        ack({ success: true });
      }
    });

    // 5. Handle Disconnect
    socket.on('disconnect', () => {
      removeSocketFromCurrentRoom(io, socket);
    });
  });

  return io;
}

module.exports = { initLocationSocket, rooms };

