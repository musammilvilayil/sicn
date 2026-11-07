import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useNavigation } from './NavigationContext';
import { api } from '../services/api';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user, token, effectiveRole } = useAuth();
  const { startNodeId, showToast } = useNavigation();

  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [mySocketId, setMySocketId] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [roomMembers, setRoomMembers] = useState([]);
  const [displayName, setDisplayName] = useState('');

  // Keep display name synced with authenticated user or guest handle
  useEffect(() => {
    if (user?.name) {
      setDisplayName(user.name);
    } else if (!displayName) {
      setDisplayName(`Explorer-${Math.floor(100 + Math.random() * 900)}`);
    }
  }, [user]);

  useEffect(() => {
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: token ? { token } : {},
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setMySocketId(socket.id);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('room_state', ({ roomCode: activeCode, members }) => {
      setRoomCode(activeCode);
      setRoomMembers(members || []);
    });

    socket.on('member_joined', ({ member }) => {
      if (member && member.socketId !== socket.id) {
        showToast(`${member.userName} joined live room!`, 'success');
      }
    });

    socket.on('member_left', ({ userName }) => {
      showToast(`${userName} left the live room`, 'info');
    });

    socket.on('location_updated', ({ member }) => {
      if (member && member.socketId !== socket.id) {
        const floorLabel = member.floor === 0 ? 'GF' : `F${member.floor}`;
        showToast(`${member.userName} checked in at ${member.nodeName} (${floorLabel})`, 'info');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [showToast, token]);

  const createShareRoom = useCallback(
    (customName) => {
      return new Promise((resolve) => {
        if (!socketRef.current) {
          return resolve({ success: false, message: 'Socket not connected' });
        }
        const activeName = (customName || displayName || user?.name || 'Explorer').trim();
        setDisplayName(activeName);

        socketRef.current.emit(
          'create_room',
          {
            userName: activeName,
            role: effectiveRole,
            avatarColor: user?.avatarColor || '#2563eb',
            nodeId: startNodeId || 'GF-MAIN-ENTRANCE',
          },
          (response) => {
            if (response?.success) {
              setRoomCode(response.roomCode);
              setRoomMembers(response.members || []);
              showToast(`Live Room #${response.roomCode} created!`, 'success');
            }
            resolve(response);
          }
        );
      });
    },
    [displayName, user, effectiveRole, startNodeId, showToast]
  );

  const joinShareRoom = useCallback(
    (codeToJoin, customName) => {
      return new Promise((resolve) => {
        if (!socketRef.current) {
          return resolve({ success: false, message: 'Socket not connected' });
        }
        const activeName = (customName || displayName || user?.name || 'Friend').trim();
        setDisplayName(activeName);

        socketRef.current.emit(
          'join_room',
          {
            roomCode: String(codeToJoin || '').trim(),
            userName: activeName,
            role: effectiveRole,
            avatarColor: user?.avatarColor || '#059669',
            nodeId: startNodeId || 'GF-MAIN-ENTRANCE',
          },
          (response) => {
            if (response?.success) {
              setRoomCode(response.roomCode);
              setRoomMembers(response.members || []);
              showToast(`Joined Live Room #${response.roomCode}!`, 'success');
            }
            resolve(response);
          }
        );
      });
    },
    [displayName, user, effectiveRole, startNodeId, showToast]
  );

  const leaveShareRoom = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('leave_room', {}, () => {
      setRoomCode(null);
      setRoomMembers([]);
      showToast('Stopped live location sharing', 'info');
    });
  }, [showToast]);

  const broadcastCheckpoint = useCallback(
    (nodeId) => {
      if (!nodeId) return;
      // Persist checkpoint for logged-in user
      api.updateMyLocation(nodeId).catch(() => {});

      // Broadcast instantaneously to Socket.io room if active
      if (socketRef.current && roomCode) {
        socketRef.current.emit(
          'update_location',
          {
            roomCode,
            nodeId,
            userName: user?.name || displayName,
          },
          (res) => {
            if (res?.success) {
              showToast(`Broadcasted live location to Room #${roomCode}`, 'success');
            }
          }
        );
      }
    },
    [roomCode, user, displayName, showToast]
  );

  const friendsInRoom = roomMembers.filter((m) => m.socketId !== mySocketId);

  return (
    <SocketContext.Provider
      value={{
        isConnected,
        mySocketId,
        roomCode,
        roomMembers,
        friendsInRoom,
        displayName,
        setDisplayName,
        createShareRoom,
        joinShareRoom,
        leaveShareRoom,
        broadcastCheckpoint,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);

