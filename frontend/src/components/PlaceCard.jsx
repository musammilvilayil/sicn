import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock, DoorOpen, Lock, MapPin, Navigation, UserRound, X } from 'lucide-react';
import { formatClock, formatDuration, getRoomSchedule } from '../utils/roomSchedule';

const floorName = (floor) => (Number(floor) === 0 ? 'Ground Floor' : `Floor ${floor}`);
const SCHEDULE_TYPES = new Set(['room', 'lab', 'hall', 'office', 'library']);

/** Minute-resolution clock so "ends in 12 min" stays current while the card is open. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Card for a tapped place: what it is, the class running there now, the next
 * class today, and whose cabin it is (with where that teacher is right now).
 *
 * schedule: { status: 'ready' | 'loading' | 'locked' | 'error', teachers, timetables }
 */
export default function PlaceCard({ node, nodes = [], schedule, onDirections, onSetStart, onClose, style }) {
  const now = useNow();
  const nodeName = useMemo(() => {
    const byId = new Map(nodes.map((item) => [String(item.nodeId).toUpperCase(), item]));
    return (id) => byId.get(String(id || '').toUpperCase());
  }, [nodes]);

  const info = useMemo(() => (
    schedule?.status === 'ready'
      ? getRoomSchedule(node.nodeId, { teachers: schedule.teachers, timetables: schedule.timetables, now })
      : null
  ), [node.nodeId, schedule, now]);

  const showSchedule = SCHEDULE_TYPES.has(node.type) || Boolean(info?.cabinOwners?.length);
  const description = node.metadata?.description;
  const department = node.metadata?.department;

  return (
    <div
      role="dialog"
      aria-label={node.name}
      className="sicn-place-card absolute -translate-x-1/2 z-30 bg-white border border-slate-200 rounded-2xl shadow-2xl animate-fade-in"
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <h4 className="text-[15px] font-extrabold leading-snug text-slate-900">{node.name}</h4>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className="capitalize">{node.type}</span> · {floorName(node.floor)}
            {department ? ` · ${department}` : ''}
          </p>
          {description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{description}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="sicn-icon-btn -mr-1.5 -mt-1">
          <X size={17} />
        </button>
      </div>

      {showSchedule && (
        <div className="sicn-place-schedule mx-4 mt-3 space-y-2">
          {schedule?.status === 'locked' && (
            <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              <Lock size={13} className="shrink-0" />
              Sign in as a student or staff member to see classes and faculty here.
            </p>
          )}
          {schedule?.status === 'loading' && <p className="text-[11px] text-slate-400">Loading timetable…</p>}
          {schedule?.status === 'error' && <p className="text-[11px] text-amber-700">Timetable is unavailable right now.</p>}

          {info && (
            <>
              {info.current ? (
                <div className="sicn-place-row is-live">
                  <span className="sicn-place-row-icon"><BookOpen size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">
                      <span className="sicn-live-dot" aria-hidden="true" /> In class now
                    </div>
                    <div className="truncate text-[13px] font-bold text-slate-900">
                      {info.current.subject}{info.current.courseCode ? ` · ${info.current.courseCode}` : ''}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {info.current.teacher?.name || info.current.teacherId}
                      {info.current.semester ? ` · ${info.current.semester}` : ''}
                      {' · until '}{formatClock(info.current.end)} ({formatDuration(info.current.endsIn)} left)
                    </div>
                  </div>
                </div>
              ) : SCHEDULE_TYPES.has(node.type) && (
                <div className="sicn-place-row">
                  <span className="sicn-place-row-icon"><DoorOpen size={15} /></span>
                  <div className="text-[12px] font-semibold text-slate-700">No class here right now</div>
                </div>
              )}

              {info.next && (
                <div className="sicn-place-row">
                  <span className="sicn-place-row-icon"><Clock size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-bold text-slate-800">
                      Next: {info.next.subject}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {formatClock(info.next.start)}–{formatClock(info.next.end)} · in {formatDuration(info.next.startsIn)}
                      {info.next.teacher?.name ? ` · ${info.next.teacher.name}` : ''}
                      {info.laterToday ? ` · +${info.laterToday} more today` : ''}
                    </div>
                  </div>
                </div>
              )}

              {info.cabinOwners.map(({ teacher, teachingNow }) => {
                const room = teachingNow ? nodeName(teachingNow.roomNodeId) : null;
                return (
                  <div key={teacher.teacherId} className="sicn-place-row">
                    <span className="sicn-place-row-icon"><UserRound size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-bold text-slate-800">
                        Cabin of {teacher.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {teacher.designation || 'Faculty'}
                        {teachingNow
                          ? ` · teaching in ${room?.name || teachingNow.roomNodeId} until ${formatClock(teachingNow.end)}`
                          : ' · no class scheduled now'}
                      </div>
                    </div>
                    {teachingNow && room && (
                      <button
                        type="button"
                        onClick={() => onDirections?.(room)}
                        className="sicn-place-mini-btn"
                        title={`Directions to ${room.name}`}
                      >
                        <MapPin size={13} /> Go
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      <div className="flex gap-2 px-4 pb-3.5 pt-3">
        <button
          type="button"
          onClick={() => onDirections?.(node)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
        >
          <Navigation size={14} /> Directions
        </button>
        <button
          type="button"
          onClick={() => onSetStart?.(node)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
        >
          <MapPin size={14} /> I'm here
        </button>
      </div>
    </div>
  );
}
