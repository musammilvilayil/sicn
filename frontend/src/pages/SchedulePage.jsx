import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Search,
  Compass,
  Briefcase,
  Lock,
  Plus,
  Pencil,
  Trash2,
  UserCheck,
  MapPin,
  X,
  Save,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function SchedulePage() {
  const navigate = useNavigate();
  const {
    user,
    effectiveRole,
    canAccessTimetableRouting,
    canManageTimetable,
  } = useAuth();

  const {
    nodes,
    startNodeId,
    setDestinationNodeId,
    computeRoute,
    accessibleOnly,
    setSheetSnap,
    showToast,
  } = useNavigation();

  const [viewTab, setViewTab] = useState('locator'); // 'locator' | 'manage'
  const [teachers, setTeachers] = useState([]);
  const [timetables, setTimetables] = useState([]);
  const [teacherDestinations, setTeacherDestinations] = useState({});
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [simulatedDay, setSimulatedDay] = useState('Monday');
  const [simulatedTime, setSimulatedTime] = useState('09:30');
  const [useRealTime, setUseRealTime] = useState(false);

  // Teacher / Admin Timetable Editor Modal State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formTeacherId, setFormTeacherId] = useState('');
  const [formDay, setFormDay] = useState('Monday');
  const [formStart, setFormStart] = useState('09:00');
  const [formEnd, setFormEnd] = useState('10:30');
  const [formRoomId, setFormRoomId] = useState('1F-CLASS-02');
  const [formSubject, setFormSubject] = useState('');
  const [formCode, setFormCode] = useState('CST301');
  const [formSem, setFormSem] = useState('S5 CSE');
  const [savingSlot, setSavingSlot] = useState(false);

  const loadScheduleData = useCallback(async () => {
    if (!canAccessTimetableRouting) return;
    setLoading(true);
    try {
      const [fetchedTeachers, fetchedSchedules] = await Promise.all([
        api.getTeachers(),
        api.getTimetables(
          effectiveRole === 'Teacher' && user?.teacherId
            ? { teacherId: user.teacherId }
            : {}
        ),
      ]);
      setTeachers(fetchedTeachers);
      setTimetables(fetchedSchedules);
    } catch (err) {
      showToast(err.message || 'Unable to load timetable data', 'error');
    } finally {
      setLoading(false);
    }
  }, [canAccessTimetableRouting, effectiveRole, user, showToast]);

  useEffect(() => {
    loadScheduleData();
  }, [loadScheduleData]);

  // Resolve dynamic destinations for all teachers
  useEffect(() => {
    if (!canAccessTimetableRouting || teachers.length === 0) return;

    let active = true;
    const resolveAll = async () => {
      const dayParam = useRealTime ? undefined : simulatedDay;
      const timeParam = useRealTime ? undefined : simulatedTime;
      const map = {};

      await Promise.all(
        teachers.map(async (t) => {
          try {
            const res = await api.getTeacherDestination(t.teacherId, dayParam, timeParam);
            map[t.teacherId] = res;
          } catch {
            // ignore single failure
          }
        })
      );

      if (active) setTeacherDestinations(map);
    };

    resolveAll();
    return () => {
      active = false;
    };
  }, [teachers, timetables, simulatedDay, simulatedTime, useRealTime, canAccessTimetableRouting]);

  const handleNavigateToFaculty = async (destNodeId, teacherName, roomLabel) => {
    setDestinationNodeId(destNodeId);
    await computeRoute(startNodeId, destNodeId, accessibleOnly, nodes);
    setSheetSnap('half');
    showToast(`Routing to ${teacherName} (${roomLabel})`, 'success');
    navigate('/');
  };

  const openAddSlotModal = () => {
    setEditingEntry(null);
    setFormTeacherId(
      effectiveRole === 'Teacher'
        ? user?.teacherId || 'TCH-001'
        : teachers[0]?.teacherId || 'TCH-001'
    );
    setFormDay('Monday');
    setFormStart('09:00');
    setFormEnd('10:30');
    setFormRoomId('1F-CLASS-02');
    setFormSubject('');
    setFormCode('CST301');
    setFormSem('S5 CSE');
    setEditorOpen(true);
  };

  const openEditSlotModal = (slot) => {
    setEditingEntry(slot);
    setFormTeacherId(slot.teacherId);
    setFormDay(slot.dayOfWeek);
    setFormStart(slot.startTime);
    setFormEnd(slot.endTime);
    setFormRoomId(slot.roomNodeId);
    setFormSubject(slot.subject);
    setFormCode(slot.courseCode || '');
    setFormSem(slot.semester || '');
    setEditorOpen(true);
  };

  const handleSaveSlot = async (e) => {
    e.preventDefault();
    setSavingSlot(true);
    try {
      const payload = {
        teacherId: formTeacherId,
        dayOfWeek: formDay,
        startTime: formStart,
        endTime: formEnd,
        roomNodeId: formRoomId,
        subject: formSubject,
        courseCode: formCode,
        semester: formSem,
      };

      if (editingEntry) {
        await api.updateTimetable(editingEntry._id, payload);
        showToast('Timetable slot updated!', 'success');
      } else {
        await api.createTimetable(payload);
        showToast('New class slot added to timetable!', 'success');
      }

      setEditorOpen(false);
      await loadScheduleData();
    } catch (err) {
      showToast(err.message || 'Could not save slot', 'error');
    } finally {
      setSavingSlot(false);
    }
  };

  const handleDeleteSlot = async (slotId) => {
    try {
      await api.deleteTimetable(slotId);
      showToast('Class slot removed', 'info');
      await loadScheduleData();
    } catch (err) {
      showToast(err.message || 'Failed to delete slot', 'error');
    }
  };

  // ============================================================================
  // RBAC GUARD FOR NORMAL_USER (Visitor only gets point-to-point map routing!)
  // ============================================================================
  if (!canAccessTimetableRouting) {
    return (
      <div className="min-h-dvh bg-slate-50 pb-24 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 py-3.5">
          <div className="max-w-xl mx-auto flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Lock size={20} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900">
                Faculty & Timetable Routing
              </h1>
              <p className="text-xs text-slate-500">Role-Based Access Control (RBAC)</p>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 text-center shadow-sm space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Lock size={30} />
            </div>
            <div>
              <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-slate-100 text-slate-700 mb-2">
                Active Role: {effectiveRole}
              </span>
              <h2 className="text-lg font-extrabold text-slate-900">
                Student or Faculty Sign-In Required
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                As a <strong>Normal_User</strong> (Visitor), you have full access to point-to-point Indoor Map Routing, QR Checkpoints, and Live Friend Sharing. Dynamic Faculty Timetable Routing is reserved for <strong>Student</strong>, <strong>Teacher</strong>, and <strong>Admin</strong> accounts.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => navigate('/profile')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-3 px-4 rounded-2xl shadow transition"
              >
                Switch Role / Sign In on Profile
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-3 px-4 rounded-2xl transition"
              >
                Return to Point-to-Point Map
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const filteredTeachers = teachers.filter((t) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.department.toLowerCase().includes(q) ||
      t.subjects?.some((s) => s.toLowerCase().includes(q))
    );
  });

  const classroomNodes = nodes.filter((n) =>
    ['room', 'lab', 'hall', 'office', 'library'].includes(n.type)
  );

  return (
    <div className="min-h-dvh bg-slate-50 pb-24">
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Calendar size={20} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 leading-tight">
                Campus Timetables & Faculty
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <UserCheck size={12} className="text-emerald-600" />
                Role: <strong className="text-slate-700">{effectiveRole}</strong>
              </p>
            </div>
          </div>

          {canManageTimetable && (
            <button
              onClick={openAddSlotModal}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs transition"
            >
              <Plus size={15} /> Add Slot
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <section className="sicn-page-hero sicn-schedule-hero">
          <div className="sicn-hero-copy">
            <span className="sicn-eyebrow"><span className="sicn-eyebrow-dot" /> PEOPLE & PLACES</span>
            <h2>Find the right person. Find the right room.</h2>
            <p>Check faculty availability, locate active classrooms and navigate to the right place across campus.</p>
          </div>
          <div className="sicn-hero-art" aria-hidden="true"><div className="sicn-hero-orbit orbit-one" /><div className="sicn-hero-orbit orbit-two" /><div className="sicn-hero-qr"><Calendar size={39} strokeWidth={1.6} /></div><span className="sicn-hero-pin"><MapPin size={15} /></span></div>
          <div className="sicn-hero-meta"><span>Faculty locator</span><span>Live timetable data</span></div>
        </section>
        {/* Sub-Tabs if Teacher or Admin */}
        {canManageTimetable && (
          <div className="grid grid-cols-2 gap-1.5 bg-slate-200/75 p-1 rounded-2xl">
            <button
              onClick={() => setViewTab('locator')}
              className={`py-2.5 rounded-xl text-xs font-bold transition ${
                viewTab === 'locator'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Live Faculty Locator
            </button>
            <button
              onClick={() => setViewTab('manage')}
              className={`py-2.5 rounded-xl text-xs font-bold transition ${
                viewTab === 'manage'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {effectiveRole === 'Teacher' ? 'Manage My Timetable' : 'Manage All Timetables'}
            </button>
          </div>
        )}

        {viewTab === 'locator' ? (
          <>
            {/* Schedule Time Simulator */}
            <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Clock size={15} className="text-indigo-600" />
                  <span>Schedule Time Resolver</span>
                </div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useRealTime}
                    onChange={(e) => setUseRealTime(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>Live Clock</span>
                </label>
              </div>

              {!useRealTime && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Day</label>
                    <select
                      value={simulatedDay}
                      onChange={(e) => setSimulatedDay(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50"
                    >
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Time</label>
                    <select
                      value={simulatedTime}
                      onChange={(e) => setSimulatedTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50"
                    >
                      <option value="09:30">09:30 AM (Morning Lecture)</option>
                      <option value="11:30">11:30 AM (Mid-Day Slot)</option>
                      <option value="14:30">02:30 PM (Afternoon Lab)</option>
                      <option value="17:00">05:00 PM (Cabin Hours)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search faculty by name, department, or subject..."
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
              />
            </div>

            {/* Faculty Cards */}
            {loading ? (
              <div className="text-center py-10 text-xs font-semibold text-slate-500">
                Loading faculty schedules...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTeachers.map((t) => {
                  const destInfo = teacherDestinations[t.teacherId];
                  const isInClass = destInfo?.status === 'in_class';
                  const targetNodeId = destInfo?.destinationNodeId || t.cabinNodeId;
                  const targetRoomName = isInClass
                    ? destInfo?.activeClass?.roomName || targetNodeId
                    : destInfo?.cabinNode?.name || t.cabinNodeId;

                  return (
                    <div
                      key={t.teacherId}
                      className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={
                            t.avatar ||
                            'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120'
                          }
                          alt={t.name}
                          className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="text-sm font-extrabold text-slate-900 truncate">
                              {t.name}
                            </h3>
                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md shrink-0">
                              {t.teacherId}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate">
                            {t.designation} • {t.department}
                          </p>

                          <div className="mt-2.5 space-y-1">
                            {isInClass ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-xl">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                In Class: {destInfo.activeClass?.subject} ({destInfo.activeClass?.startTime}–{destInfo.activeClass?.endTime})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-xl">
                                <Briefcase size={12} /> Available in Cabin
                              </span>
                            )}

                            <div className="text-xs text-slate-700 flex items-center gap-1 pt-0.5">
                              <MapPin size={12} className="text-slate-400 shrink-0" />
                              <span className="truncate">
                                Location: <strong>{targetRoomName}</strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          handleNavigateToFaculty(targetNodeId, t.name, targetRoomName)
                        }
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 px-4 rounded-2xl shadow-xs flex items-center justify-center gap-1.5 transition"
                      >
                        <Compass size={14} />
                        <span>Route to {isInClass ? 'Active Classroom' : 'Faculty Cabin'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* TEACHER & ADMIN TIMETABLE MANAGEMENT VIEW */
          <div className="space-y-3">
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex items-center justify-between gap-2">
              <div className="text-xs text-indigo-900">
                <strong>RBAC Timetable Studio:</strong>{' '}
                {effectiveRole === 'Teacher'
                  ? `Editing classes linked to your Teacher ID (${user?.teacherId || 'TCH-001'}).`
                  : 'Admin full access across all faculty schedules.'}
              </div>
              <button
                onClick={openAddSlotModal}
                className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl"
              >
                + New Class
              </button>
            </div>

            {timetables.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center text-xs text-slate-500">
                No timetable slots scheduled yet. Tap &ldquo;+ New Class&rdquo; to add one!
              </div>
            ) : (
              <div className="space-y-2.5">
                {timetables.map((slot) => (
                  <div
                    key={slot._id}
                    className="bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                          {slot.dayOfWeek}
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          {slot.startTime} – {slot.endTime}
                        </span>
                        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          {slot.room?.name || slot.roomNodeId}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 truncate">
                        {slot.subject} ({slot.courseCode})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {slot.teacher?.name || slot.teacherId} • {slot.semester}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openEditSlotModal(slot)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition"
                        title="Edit slot"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteSlot(slot._id)}
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                        title="Delete slot"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add / Edit Timetable Slot Modal */}
      {editorOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setEditorOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingEntry ? 'Edit Timetable Slot' : 'Add Timetable Slot'}
              </h3>
              <button
                onClick={() => setEditorOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSlot} className="p-5 space-y-3">
              {effectiveRole === 'Admin' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Faculty</label>
                  <select
                    value={formTeacherId}
                    onChange={(e) => setFormTeacherId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                  >
                    {teachers.map((t) => (
                      <option key={t.teacherId} value={t.teacherId}>
                        {t.name} ({t.teacherId})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Day</label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Classroom / Lab</label>
                  <select
                    value={formRoomId}
                    onChange={(e) => setFormRoomId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                  >
                    {classroomNodes.map((n) => (
                      <option key={n.nodeId} value={n.nodeId}>
                        [F{n.floor}] {n.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Subject Title</label>
                <input
                  type="text"
                  required
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="e.g. Distributed Cloud Systems"
                  className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Course Code</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Semester</label>
                  <input
                    type="text"
                    value={formSem}
                    onChange={(e) => setFormSem(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingSlot}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-3 rounded-2xl shadow flex items-center justify-center gap-1.5 transition"
              >
                <Save size={14} />
                <span>{savingSlot ? 'Saving...' : 'Save Timetable Entry'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

