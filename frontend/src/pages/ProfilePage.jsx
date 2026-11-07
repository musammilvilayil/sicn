import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  ShieldCheck,
  LogOut,
  CheckCircle2,
  Lock,
  Share2,
  Wrench,
  Calendar,
  Map,
  Mail,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useSocket } from '../context/SocketContext';
import ShareLocationSheet from '../components/ShareLocationSheet';
import { api } from '../services/api';

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
    changePassword,
    logout,
  } = useAuth();

  const { startNodeObj, showToast } = useNavigation();
  const { roomCode, roomMembers } = useSocket();

  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [provisionName, setProvisionName] = useState('');
  const [provisionEmail, setProvisionEmail] = useState('');
  const [provisionPassword, setProvisionPassword] = useState('');
  const [provisionRole, setProvisionRole] = useState('Student');
  const [provisionTeacherId, setProvisionTeacherId] = useState('');
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (authMode === 'login') {
        const logged = await login(email, password);
        showToast(`Welcome back, ${logged.name} (${logged.role})`, 'success');
      } else {
        await register({ name, email, password });
        showToast(`Visitor account created successfully`, 'success');
      }
      setEmail('');
      setPassword('');
    } catch (err) {
      showToast(err.message || 'Authentication error', 'error');
    } finally {
      setBusy(false);
    }
  };


  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      showToast('Password updated. Please sign in again.', 'success');
    } catch (err) {
      showToast(err.message || 'Password update failed', 'error');
    } finally {
      setPasswordBusy(false);
    }
  };


  const handleProvisionUser = async (e) => {
    e.preventDefault();
    setProvisionBusy(true);
    try {
      const result = await api.provisionUser({
        name: provisionName,
        email: provisionEmail,
        password: provisionPassword,
        role: provisionRole,
        teacherId: provisionRole === 'Teacher' ? provisionTeacherId : undefined,
      });
      showToast(`${result.user.name} account created as ${result.user.role}`, 'success');
      setProvisionName('');
      setProvisionEmail('');
      setProvisionPassword('');
      setProvisionTeacherId('');
    } catch (err) {
      showToast(err.message || 'Could not create account', 'error');
    } finally {
      setProvisionBusy(false);
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
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 leading-tight">
                Account & Access
              </h1>
              <p className="text-xs text-slate-500">
                Manage your campus navigation account
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

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4 md:pl-24">
        <section className="sicn-page-hero sicn-account-hero">
          <div className="sicn-hero-copy">
            <span className="sicn-eyebrow"><span className="sicn-eyebrow-dot" /> YOUR CAMPUS IDENTITY</span>
            <h2>Your access. Your campus.</h2>
            <p>Manage your account, review permissions and keep your campus navigation access secure.</p>
          </div>
          <div className="sicn-hero-art" aria-hidden="true"><div className="sicn-hero-orbit orbit-one" /><div className="sicn-hero-orbit orbit-two" /><div className="sicn-hero-qr"><ShieldCheck size={42} strokeWidth={1.6} /></div><span className="sicn-hero-pin"><KeyRound size={15} /></span></div>
          <div className="sicn-hero-meta"><span>Role-based access</span><span>Secure account controls</span></div>
        </section>
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

        {user?.mustChangePassword && (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm space-y-3">
            <div>
              <h3 className="text-sm font-extrabold text-amber-950">Secure your administrator account</h3>
              <p className="mt-1 text-xs leading-relaxed text-amber-900">
                This is a one-time administrator password. Set a new password before continuing to use this account.
              </p>
            </div>
            <form onSubmit={handlePasswordChange} className="space-y-2.5">
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={1}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Temporary password from server terminal"
                className="w-full rounded-xl border border-amber-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
              />
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (minimum 12 characters)"
                className="w-full rounded-xl border border-amber-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={passwordBusy || newPassword.length < 12}
                className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {passwordBusy ? 'Updating password…' : 'Set new password'}
              </button>
            </form>
          </section>
        )}

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

        </section>

        {canEditMap && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-950">Create campus account</h3>
              <p className="mt-1 text-xs text-slate-500">Provision verified Teacher or Student accounts. Administrator access is only bootstrapped at server startup.</p>
            </div>
            <form onSubmit={handleProvisionUser} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input required minLength={2} maxLength={80} value={provisionName} onChange={(e) => setProvisionName(e.target.value)} placeholder="Full name" className="rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <input required type="email" value={provisionEmail} onChange={(e) => setProvisionEmail(e.target.value)} placeholder="Email address" className="rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <input required type="password" minLength={12} maxLength={128} value={provisionPassword} onChange={(e) => setProvisionPassword(e.target.value)} placeholder="Temporary password (12+ characters)" className="rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={provisionRole} onChange={(e) => setProvisionRole(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="Student">Student</option>
                <option value="Teacher">Teacher</option>
                <option value="Normal_User">Visitor</option>
              </select>
              {provisionRole === 'Teacher' && (
                <input required value={provisionTeacherId} onChange={(e) => setProvisionTeacherId(e.target.value)} placeholder="Existing faculty ID (e.g. TCH-001)" className="rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-2" />
              )}
              <button type="submit" disabled={provisionBusy || provisionPassword.length < 12} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50 sm:col-span-2">
                {provisionBusy ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </section>
        )}

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
              <p className="text-xs text-slate-500">
                New public accounts are created with visitor permissions. Staff and administrator accounts are provisioned separately by the system owner.
              </p>
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
                : 'Create Visitor Account'}
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

