import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Map, Camera, QrCode, CalendarDays, UserRound, Lock, Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNavigation } from '../context/NavigationContext';

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { effectiveRole, canAccessTimetableRouting } = useAuth();
  const { roomCode, roomMembers } = useSocket();
  const { isARMode, launchARLiveView, fallbackTo2DMap } = useNavigation();

  const toggleAR = () => {
    if (location.pathname !== '/') navigate('/');
    if (isARMode) fallbackTo2DMap();
    else launchARLiveView();
  };

  const items = [
    { to: '/', label: 'Explore', icon: Map, end: true, onClick: () => isARMode && fallbackTo2DMap(), inactive: isARMode },
    { action: toggleAR, label: 'AR View', icon: Camera, active: location.pathname === '/' && isARMode },
    { to: '/scan', label: 'Scan QR', icon: QrCode, badge: roomCode ? String(roomMembers.length) : null, onClick: () => isARMode && fallbackTo2DMap() },
    { to: '/schedule', label: 'Schedule', icon: CalendarDays, locked: !canAccessTimetableRouting, onClick: () => isARMode && fallbackTo2DMap() },
    { to: '/profile', label: 'Account', icon: UserRound, role: effectiveRole, onClick: () => isARMode && fallbackTo2DMap() },
  ];

  const renderItem = (item, desktop = false) => {
    const Icon = item.icon;
    const common = desktop
      ? 'group relative flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-[11px] font-semibold transition duration-200'
      : 'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-semibold transition duration-200';

    if (item.action) {
      return (
        <button
          key={item.label}
          type="button"
          onClick={item.action}
          title={item.label}
          aria-label={item.label}
          className={`${common} ${item.active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'}`}
        >
          <Icon size={desktop ? 21 : 20} strokeWidth={item.active ? 2.5 : 2} />
          <span className="max-w-full truncate">{item.label}</span>
          {item.active && <span className="absolute -right-1 top-2 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />}
        </button>
      );
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={item.onClick}
        title={item.label}
        aria-label={item.label}
        className={({ isActive }) => {
          const active = isActive && !item.inactive;
          return `${common} ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'}`;
        }}
      >
        {({ isActive }) => {
          const active = isActive && !item.inactive;
          return (
            <>
              <span className="relative">
                <Icon size={desktop ? 21 : 20} strokeWidth={active ? 2.5 : 2} />
                {item.badge && <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-emerald-500 px-1 text-center text-[9px] font-bold text-white">{item.badge}</span>}
                {item.locked && <span className="absolute -right-2 -top-2 rounded-full bg-amber-100 p-0.5 text-amber-700"><Lock size={9} /></span>}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
              {desktop && item.role && <span className="max-w-full truncate text-[9px] font-medium text-slate-400">{item.role.replace('_', ' ')}</span>}
            </>
          );
        }}
      </NavLink>
    );
  };

  return (
    <>
      {/* Mobile: thumb-friendly bottom tab bar with safe-area spacing */}
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid h-[62px] max-w-xl grid-cols-5 items-center">
          {items.map((item) => renderItem(item, false))}
        </div>
      </nav>

      {/* Desktop: compact floating campus navigation rail */}
      <aside className="fixed left-5 top-1/2 z-50 hidden -translate-y-1/2 flex-col items-center gap-3 rounded-[28px] border border-white/70 bg-white/90 p-2.5 shadow-[0_20px_70px_rgba(15,23,42,0.16)] backdrop-blur-2xl md:flex">
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg">
          <Compass size={22} />
        </div>
        <div className="h-px w-9 bg-slate-200" />
        <nav aria-label="Desktop navigation" className="flex w-full flex-col gap-1.5">
          {items.map((item) => renderItem(item, true))}
        </nav>
        <div className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" title="SICN" />
      </aside>
    </>
  );
}
