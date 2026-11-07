import React, { useState } from 'react';
import {
  Share2,
  Users,
  Copy,
  Check,
  LogOut,
  X,
  Radio,
  Navigation,
  QrCode,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useNavigation } from '../context/NavigationContext';

export default function ShareLocationSheet({ isOpen, onClose }) {
  const navigate = useNavigate();
  const {
    isConnected,
    mySocketId,
    roomCode,
    roomMembers,
    displayName,
    setDisplayName,
    createShareRoom,
    joinShareRoom,
    leaveShareRoom,
  } = useSocket();

  const {
    startNodeId,
    setDestinationNodeId,
    setCurrentFloor,
    computeRoute,
    accessibleOnly,
    nodes,
  } = useNavigation();

  const [joinInput, setJoinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setErrorMsg('');
    setBusy(true);
    const res = await createShareRoom(displayName);
    setBusy(false);
    if (!res?.success) {
      setErrorMsg(res?.message || 'Could not create sharing room');
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (joinInput.trim().length !== 6) {
      setErrorMsg('Enter a 6-digit room code');
      return;
    }
    setBusy(true);
    const res = await joinShareRoom(joinInput.trim(), displayName);
    setBusy(false);
    if (!res?.success) {
      setErrorMsg(res?.message || 'Failed to join room');
    } else {
      setJoinInput('');
    }
  };

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleRouteToFriend = (member) => {
    setDestinationNodeId(member.nodeId);
    setCurrentFloor(member.floor);
    computeRoute(startNodeId, member.nodeId, accessibleOnly, nodes);
    onClose?.();
    navigate('/');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[88dvh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center">
              <Share2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Live Friend Sharing</h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>{isConnected ? 'Socket.io Real-Time Connected' : 'Reconnecting...'}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3.5 py-2.5 rounded-xl">
              {errorMsg}
            </div>
          )}

          {!roomCode ? (
            <>
              {/* Display Name Input */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Your Live Avatar Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Create 6-Digit Room Card */}
              <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl p-4 text-white shadow-lg">
                <div className="flex items-center gap-2 text-xs font-semibold text-violet-100 mb-1">
                  <Radio size={14} /> Instant Room Host
                </div>
                <h4 className="text-sm font-bold">Share Your Live Campus Location</h4>
                <p className="text-xs text-violet-100 mt-1 leading-relaxed">
                  Generate a unique 6-digit room code. Friends who join see your live checkpoint movements on their map in real time.
                </p>
                <button
                  onClick={handleCreate}
                  disabled={busy || !isConnected}
                  className="mt-3.5 w-full bg-white text-violet-700 hover:bg-violet-50 font-bold text-xs py-2.5 px-4 rounded-xl shadow transition disabled:opacity-60"
                >
                  {busy ? 'Generating Code...' : 'Generate 6-Digit Room Code'}
                </button>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200" />
                <span className="shrink mx-3 text-[11px] font-bold uppercase text-slate-400">
                  Or Join a Friend
                </span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              {/* Join Room Form */}
              <form onSubmit={handleJoin} className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-600">
                  Enter Friend&apos;s 6-Digit Room Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="e.g. 482915"
                    className="flex-1 px-4 py-2.5 text-center tracking-[0.3em] font-mono text-base font-bold border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={busy || joinInput.length !== 6}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition disabled:opacity-50"
                  >
                    Join Room
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              {/* Active 6-Digit Code Display */}
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700">
                  Active 6-Digit Room Code
                </span>
                <div className="mt-1.5 flex items-center justify-center gap-2">
                  <span className="font-mono text-3xl font-black tracking-[0.25em] text-slate-900 pl-2">
                    {roomCode}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="p-2 rounded-xl bg-white border border-violet-200 text-violet-700 hover:bg-violet-100 transition"
                    title="Copy 6-digit code"
                  >
                    {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs text-slate-600 mt-1.5">
                  Share this code with friends so they can join your live map session.
                </p>
              </div>

              {/* Active Members List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Users size={14} /> Connected Peers ({roomMembers.length})
                  </h4>
                  <button
                    onClick={() => {
                      onClose?.();
                      navigate('/scan');
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                  >
                    <QrCode size={13} /> Scan QR to Update
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {roomMembers.map((m) => {
                    const isMe = m.socketId === mySocketId;
                    return (
                      <div
                        key={m.socketId}
                        className="flex items-center justify-between gap-2.5 p-3 rounded-2xl border border-slate-200/90 bg-slate-50/70"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-9 h-9 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm"
                            style={{ backgroundColor: m.avatarColor || '#2563eb' }}
                          >
                            {(m.userName || 'U').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {m.userName}
                              </span>
                              {isMe && (
                                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">
                              📍 {m.nodeName} ({m.floor === 0 ? 'GF' : `F${m.floor}`})
                            </p>
                          </div>
                        </div>

                        {!isMe && (
                          <button
                            onClick={() => handleRouteToFriend(m)}
                            className="shrink-0 inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-xl transition"
                          >
                            <Navigation size={12} /> Find
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Leave Room */}
              <button
                onClick={leaveShareRoom}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs py-2.5 rounded-xl transition"
              >
                <LogOut size={14} /> Leave Live Sharing Room
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

