import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Map, Camera, QrCode, CalendarDays, UserRound, Lock, Compass, Radio, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNavigation } from '../context/NavigationContext';
export default function BottomNav() {
 const location=useLocation(), navigate=useNavigate();
 const {effectiveRole,canAccessTimetableRouting}=useAuth();
 const canAccessAttendance=['Student','Teacher','Admin'].includes(effectiveRole);
 const {roomCode,roomMembers}=useSocket();
 const {isARMode,launchARLiveView,fallbackTo2DMap}=useNavigation();
 if(isARMode) return null;
 const toggleAR=()=>{if(location.pathname!=='/')navigate('/');if(isARMode)fallbackTo2DMap();else launchARLiveView();};
 const items=[
  {to:'/',label:'Explore',caption:'Campus map',icon:Map,end:true,onClick:()=>isARMode&&fallbackTo2DMap(),inactive:isARMode},
  {action:toggleAR,label:'AR guidance',caption:'Camera mode',icon:Camera,active:location.pathname==='/'&&isARMode},
  {to:'/scan',label:'QR scanner',caption:'Check in',icon:QrCode,badge:roomCode?String(roomMembers.length):null,onClick:()=>isARMode&&fallbackTo2DMap()},
  {to:'/schedule',label:'Schedule',caption:'Find a teacher',icon:CalendarDays,locked:!canAccessTimetableRouting,onClick:()=>isARMode&&fallbackTo2DMap()},
  {to:'/attendance',label:'Attendance',caption:'Class check-in',icon:ClipboardCheck,locked:!canAccessAttendance,onClick:()=>isARMode&&fallbackTo2DMap()},
  {to:'/profile',label:'Account & access',caption:effectiveRole.replace('_',' '),icon:UserRound,onClick:()=>isARMode&&fallbackTo2DMap()}
 ];
 const render=(item,desktop)=>{
  const Icon=item.icon, cls=desktop?'sicn-nav-link group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition':'sicn-mobile-link relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition';
  const content=active=><><span className="sicn-nav-icon relative"><Icon size={desktop?19:20} strokeWidth={active?2.5:2}/>{item.badge&&<span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-emerald-500 px-1 text-center text-[9px] font-bold text-white">{item.badge}</span>}{item.locked&&<span className="absolute -right-2 -top-2 rounded-full bg-amber-100 p-0.5 text-amber-700"><Lock size={9}/></span>}</span><span className={desktop?'min-w-0 flex-1':'max-w-full truncate'}>{item.label}</span>{desktop&&<span className="sicn-nav-caption">{item.caption}</span>}{desktop&&active&&<span className="sicn-nav-active-mark"/>}</>;
  if(item.action)return <button key={item.label} type="button" onClick={item.action} aria-label={item.label} className={cls+(item.active?' is-active':'')}>{content(Boolean(item.active))}</button>;
  return <NavLink key={item.to} to={item.to} end={item.end} onClick={item.onClick} aria-label={item.label} className={({isActive})=>cls+(isActive&&!item.inactive?' is-active':'')}>{({isActive})=>content(isActive&&!item.inactive)}</NavLink>;
 };
 return <><nav aria-label="Primary navigation" className="sicn-mobile-nav fixed inset-x-0 bottom-0 z-50 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden"><div className="mx-auto grid h-[58px] max-w-xl grid-cols-6 items-center">{items.map(x=>render(x,false))}</div></nav><aside className="sicn-desktop-nav fixed left-4 top-1/2 z-50 hidden -translate-y-1/2 flex-col md:flex"><div className="sicn-brand-lockup"><div className="sicn-brand-mark"><Compass size={21}/></div><div><div className="sicn-brand-name">SICN</div><div className="sicn-brand-subtitle">CAMPUS NAVIGATION</div></div></div><div className="sicn-nav-section-label">WORKSPACE</div><nav aria-label="Desktop navigation" className="flex w-full flex-col gap-1">{items.map(x=>render(x,true))}</nav><div className="sicn-nav-footer"><span className={'sicn-status-indicator'+(roomCode?' is-live':'')}><Radio size={13}/></span><div className="min-w-0"><div className="sicn-nav-footer-title">{roomCode?'Live location active':'Campus services'}</div><div className="sicn-nav-footer-copy">{roomCode?'Room '+roomCode+' · '+roomMembers.length+' members':'Bishop Jerome Institute'}</div></div></div><div className="sicn-nav-version">SMART INDOOR NAVIGATION <span>•</span> 1.0</div></aside></>;
}