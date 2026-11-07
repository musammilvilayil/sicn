import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import BottomNav from './components/BottomNav';
import MapPage from './pages/MapPage';
import ScanPage from './pages/ScanPage';
import SchedulePage from './pages/SchedulePage';
import ProfilePage from './pages/ProfilePage';
import AttendancePage from './pages/AttendancePage';
import AttendancePage from './pages/AttendancePage';
import { useNavigation } from './context/NavigationContext';
export default function App() {
 const {toast}=useNavigation();
 return <div className="sicn-ui relative min-h-dvh w-full bg-slate-50 text-slate-900 antialiased">
  {toast&&<div role="status" aria-live="polite" className="sicn-toast fixed left-1/2 top-4 z-[70] w-[min(92%,420px)] -translate-x-1/2 animate-fade-in pointer-events-none"><div className={'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl '+(toast.type==='error'?'sicn-toast-error':toast.type==='success'?'sicn-toast-success':'sicn-toast-info')}><span className="shrink-0">{toast.type==='error'?<AlertCircle size={18}/>:toast.type==='success'?<CheckCircle2 size={18}/>:<Info size={18}/>}</span><span className="leading-snug">{toast.message}</span></div></div>}
  <Routes><Route path="/" element={<MapPage/>}/><Route path="/scan" element={<ScanPage/>}/><Route path="/schedule" element={<SchedulePage/>}/><Route path="/profile" element={<ProfilePage/>}/><Route path="/attendance" element={<AttendancePage/>}/><Route path="/attendance" element={<AttendancePage/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes><BottomNav/>
 </div>;
}