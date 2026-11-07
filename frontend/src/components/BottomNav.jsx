import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Map, Camera, QrCode, Calendar, User, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNavigation } from '../context/NavigationContext';

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { effectiveRole, canAccessTimetableRouting } = useAuth();
  const { roomCode, roomMembers } = useSocket();
  const { isARMode, launchARLiveView, fallbackTo2DMap } = useNavigation();

  const handleToggleAR = async () => {
    if (location.pathname !== '/') {
      navigate('/');
    }
    if (isARMode) {
      fallbackTo2DMap();
    } else {
      await launchARLiveView();
    }
  };

  const navItems = [
    {
      to: '/',
      label: 'Explore',
      icon: Map,
      end: true,
      onClick: () => {
        if (isARMode) fallbackTo2DMap();
      },
      forceInactive: isARMode,
    },
    {
      action: handleToggleAR,
      label: 'AR Live View',
      icon: Camera,
      isActiveCustom: location.pathname === '/' && isARMode,
    },
    {
      to: '/scan',
      label: 'Scan QR',
      icon: QrCode,
      badge: roomCode ? `${roomMembers.length}` : null,
      onClick: () => {
        if (isARMode) fallbackTo2DMap();
      },
    },
    {
      to: '/schedule',
      label: 'Schedule',
      icon: Calendar,
      locked: !canAccessTimetableRouting,
      onClick: () => {
        if (isARMode) fallbackTo2DMap();
      },
    },
    {
      to: '/profile',
      label: 'Profile',
      icon: User,
      roleBadge: effectiveRole,
      onClick: () => {
        if (isARMode) fallbackTo2DMap();
      },
    },
  ];

  return (
    <nav
      aria-label="Primary Bottom Navigation"
      className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] md:bottom-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[500px] md:rounded-2xl md:border md:shadow-2xl pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 h-16 px-1.5 items-center">
        {navItems.map((item) => {
          const IconComponent = item.icon;

          if (item.action) {
            const active = Boolean(item.isActiveCustom);
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all duration-200 select-none ${
                  active
                    ? 'text-indigo-600 font-semibold'
                    : 'text-slate-500 hover:text-slate-800 font-medium'
                }`}
              >
                <div
                  className={`relative flex items-center justify-center px-3.5 py-1 rounded-full transition-colors duration-200 ${
                    active ? 'bg-indigo-100 text-indigo-700' : ''
                  }`}
                >
                  <IconComponent size={20} strokeWidth={active ? 2.4 : 2} />
                </div>
                <span className="text-[10px] sm:text-[11px] tracking-tight leading-none mt-0.5 truncate max-w-full px-0.5">
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={item.onClick}
              className={({ isActive }) => {
                const effectiveActive = isActive && !item.forceInactive;
                return `relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all duration-200 select-none ${
                  effectiveActive
                    ? 'text-blue-600 font-semibold'
                    : 'text-slate-500 hover:text-slate-800 font-medium'
                }`;
              }}
            >
              {({ isActive }) => {
                const effectiveActive = isActive && !item.forceInactive;
                return (
                  <>
                    <div
                      className={`relative flex items-center justify-center px-3.5 py-1 rounded-full transition-colors duration-200 ${
                        effectiveActive ? 'bg-blue-100/90 text-blue-700' : ''
                      }`}
                    >
                      <IconComponent size={20} strokeWidth={effectiveActive ? 2.4 : 2} />

                      {item.badge && (
                        <span className="absolute -top-1 right-0.5 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full ring-2 ring-white">
                          {item.badge}
                        </span>
                      )}

                      {item.locked && (
                        <span className="absolute -top-1 right-0.5 bg-amber-100 text-amber-700 p-0.5 rounded-full ring-1 ring-amber-300">
                          <Lock size={9} />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] sm:text-[11px] tracking-tight leading-none mt-0.5 truncate max-w-full px-0.5">
                      {item.label}
                    </span>
                  </>
                );
              }}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
