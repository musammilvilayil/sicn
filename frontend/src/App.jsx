import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import BottomNav from './components/BottomNav';
import MapPage from './pages/MapPage';
import ScanPage from './pages/ScanPage';
import SchedulePage from './pages/SchedulePage';
import ProfilePage from './pages/ProfilePage';
import { useNavigation } from './context/NavigationContext';

export default function App() {
  const { toast } = useNavigation();

  return (
    <div className="relative min-h-dvh w-full bg-slate-50 text-slate-900 antialiased">
      {/* Global Mobile-Friendly Floating Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] w-[92%] max-w-sm pointer-events-none animate-fade-in">
          <div
            className={`px-4 py-2.5 rounded-2xl shadow-2xl border flex items-center gap-2.5 text-xs font-bold backdrop-blur-md ${
              toast.type === 'error'
                ? 'bg-rose-600/95 text-white border-rose-500'
                : toast.type === 'success'
                ? 'bg-emerald-600/95 text-white border-emerald-500'
                : 'bg-slate-900/95 text-white border-slate-700'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle size={16} className="shrink-0" />
            ) : toast.type === 'success' ? (
              <CheckCircle2 size={16} className="shrink-0" />
            ) : (
              <Info size={16} className="shrink-0" />
            )}
            <span className="leading-snug">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Multi-Page Router */}
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Google Maps-like Mobile Bottom Navigation Bar */}
      <BottomNav />
    </div>
  );
}
