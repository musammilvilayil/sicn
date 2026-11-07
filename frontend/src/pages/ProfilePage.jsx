import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  ShieldCheck,
  LogOut,
  CheckCircle2,
  Lock,
  Share2,
  RefreshCw,
  Wrench,
  Calendar,
  Map,
  Mail,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useSocket } from '../context/SocketContext';
import { api } from '../services/api';
import ShareLocationSheet from '../components/ShareLocationSheet';

const DEMO_ACCOUNTS = [
  {
    role: 'Admin',
    label: 'Admin',
    sub: 'Edit map & nodes',
    email: 'admin@bji.ac.in',
    pass: 'AdminPassword@123',
    badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  {
    role: 'Teacher',
    label: 'Teacher',
    sub: 'Update timetable',
    email: 'priya.nair@bji.ac.in',
    pass: 'Teacher@123',
    badgeClass: 'bg-violet-100 text-violet-700 border-violet-200',
  },
  {
    role: 'Student',
    label: 'Student',
    sub: 'Timetable routing',
    email: 'student@bji.ac.in',
    pass: 'Password@123',
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  {
    role: 'Normal_User',
    label: 'Normal_User',
    sub: 'Visitor basic map',
    email: 'visitor@bji.ac.in',
    pass: 'Visitor@123',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
];

export default function ProfilePage() {
  const navigate = useNavigate();
  const {
    user,
    effectiveRole,
    canEditMap,
    canManageTimetable,
    canAccessTimetableRouting,
    login,
    register,
    logout,
  } = useAuth();

  const { startNodeObj, refreshMapData, showToast } = useNavigation();
  const { roomCode, roomMembers } = useSocket();

  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Student');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [busy, setBusy] = useState(false);
  const [reseedBusy, setReseedBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleQuickRoleSwitch = async (acct) => {
    setBusy(true);
    try {
      await login(acct.email, acct.pass);
      showToast(`Signed in as ${acct.role}`, 'success');
    } catch (err) {
      showToast(err.message || 'Demo login failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (authMode === 'login') {
        const logged = await login(email, password);
        showToast(`Welcome back, ${logged.name} (${logged.role})`, 'success');
      } else {
        const created = await register({ name, email, password, role, department });
        showToast(`Account created with role ${created.role}`, 'success');
      }
      setEmail('');
      setPassword('');
    } catch (err) {
      showToast(err.message || 'Authentication error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAdminReseed = async () => {
    setReseedBusy(true);
    try {
      await api.reseed();
      await refreshMapData();
      showToast('Campus graph & RBAC users reset to blueprint defaults!', 'success');
    } catch (err) {
      showToast(err.message || 'Reset failed', 'error');
    } finally {
      setReseedBusy(false);
    }
  };

  const capabilities = [
    {
      label: 'Point-to-Point A* Map Routing & QR Scan',
      allowed: true,
      rolesText: 'All Roles',
    },
    {
      label: 'Live Friend Sharing (6-Digit Socket.io Room)',
      allowed: true,
      rolesText: 'All Roles',
    },
    {
      label: 'Faculty Locator & Timetable Routing',
      allowed: canAccessTimetableRouting,
      rolesText: 'Student, Teacher, Admin',
    },
    {
      label: 'Update & Manage Class Timetables',
      allowed: canManageTimetable,
      rolesText: 'Teacher, Admin',
    },
    {
      label: 'Edit Campus Map Nodes & Corridor Edges',
      allowed: canEditMap,
      rolesText: 'Admin Only',
    },
  ];

  return (
    <div className="min-h-dvh bg-slate-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 leading-tight">
                User Profile & RBAC Roles
              </h1>
              <p className="text-xs text-slate-500">
                JWT Session, Permissions & Live Room Settings
              </p>
            </div>
          </div>

          {user && (
            <button
              onClick={() => {
                logout();
                showToast('Signed out (Switched to Visitor Normal_User)', 'info');
              }}
              className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold px-3 py-2 rounded-xl transition"
            >
              <LogOut size={14} /> Sign Out
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Current Active Session Card */}
        <section className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-3.5">
            <div
              className="w-14 h-14 rounded-2xl text-white text-lg font-black flex items-center justify-center shadow-md shrink-0"
              style={{ backgroundColor: user?.avatarColor || '#0f172a' }}
            >
              {(user?.name || 'Visitor').slice(0, 2).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 truncate">
                  {user ? user.name : 'Campus Visitor (Guest)'}
                </h2>
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-600 text-white">
                  {effectiveRole}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {user ? `${user.email} • ${user.department}` : 'Not signed in — operating with Normal_User permissions'}
              </p>
              <p className="text-[11px] font-semibold text-emerald-700 mt-1">
                📍 Active Checkpoint: {startNodeObj?.name || 'Main Entrance & Porch'}
              </p>
            </div>
          </div>

          {/* Role Quick Actions */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center justify-center gap-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 text-xs font-bold py-2.5 px-3 rounded-2xl transition"
            >
              <Share2 size={14} />
              <span>{roomCode ? `Room #${roomCode} (${roomMembers.length})` : 'Share Live Location'}</span>
            </button>

            {canEditMap ? (
              <button
                onClick={() => navigate('/')}
                className="flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold py-2.5 px-3 rounded-2xl transition"
              >
                <Wrench size={14} />
                <span>Open Map Node Editor</span>
              </button>
            ) : canAccessTimetableRouting ? (
              <button
                onClick={() => navigate('/schedule')}
                className="flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold py-2.5 px-3 rounded-2xl transition"
              >
                <Calendar size={14} />
                <span>{canManageTimetable ? 'Manage Timetable' : 'Faculty Schedules'}</span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/')}
                className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2.5 px-3 rounded-2xl transition"
              >
                <Map size={14} />
                <span>Open Campus Map</span>
              </button>
            )}
          </div>
        </section>

        {/* Instant 4-Role Demo Switcher */}
        <section className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs space-y-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Instant RBAC Role Switcher (Demo Accounts)
            </h3>
            <p className="text-xs text-slate-500">
              Tap any of the 4 system roles to sign in via JWT and test role-specific capabilities:
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {DEMO_ACCOUNTS.map((acct) => {
              const isCurrent = user?.role === acct.role;
              return (
                <button
                  key={acct.role}
                  disabled={busy}
                  onClick={() => handleQuickRoleSwitch(acct)}
                  className={`text-left p-3 rounded-2xl border transition ${
                    isCurrent
                      ? 'ring-2 ring-blue-600 border-blue-600 bg-blue-50/40'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${acct.badgeClass}`}>
                      {acct.label}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-blue-600">Active</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-800 mt-1.5">{acct.sub}</p>
                  <p className="text-[10px] text-slate-400 truncate">{acct.email}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* RBAC Access Matrix */}
        <section className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs space-y-2.5">
          <h3 className="text-sm font-extrabold text-slate-900">
            Active Role Permissions ({effectiveRole})
          </h3>
          <div className="divide-y divide-slate-100">
            {capabilities.map((cap, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {cap.allowed ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <Lock size={16} className="text-slate-400 shrink-0" />
                  )}
                  <span
                    className={`text-xs font-semibold ${
                      cap.allowed ? 'text-slate-800' : 'text-slate-400'
                    }`}
                  >
                    {cap.label}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">
                  {cap.rolesText}
                </span>
              </div>
            ))}
          </div>

          {canEditMap && (
            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={handleAdminReseed}
                disabled={reseedBusy}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-2xl transition disabled:opacity-50"
              >
                <RefreshCw size={14} className={reseedBusy ? 'animate-spin' : ''} />
                <span>{reseedBusy ? 'Resetting Database...' : 'Reset Map & Seed Data (Admin)'}</span>
              </button>
            </div>
          )}
        </section>

        {/* Custom Sign In / Register Form */}
        <section className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setAuthMode('login')}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                authMode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthMode('register')}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                authMode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              Register Account
            </button>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-3">
            {authMode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Email Address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@bji.ac.in"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Password</label>
              <div className="relative">
                <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {authMode === 'register' && (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Select Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs font-semibold border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="Student">Student</option>
                    <option value="Teacher">Teacher</option>
                    <option value="Normal_User">Normal_User (Visitor)</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-3 rounded-2xl shadow transition disabled:opacity-50"
            >
              {busy
                ? 'Processing...'
                : authMode === 'login'
                ? 'Sign In with JWT'
                : `Create ${role} Account`}
            </button>
          </form>
        </section>
      </main>

      <ShareLocationSheet
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

