/**
 * What is happening in a room right now, from the timetable and the faculty
 * cabin list: the class running now, the next class today, and whose cabin
 * the room is (and where that person is teaching right now).
 */
export const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "09:30" -> 570 minutes after midnight; null when malformed. */
export function toMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 570 -> "9:30 AM" */
export function formatClock(minutes) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const sameId = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();

function todaysSlots(timetables, day) {
  return (timetables || [])
    .filter((slot) => slot.dayOfWeek === day)
    .map((slot) => ({ ...slot, start: toMinutes(slot.startTime), end: toMinutes(slot.endTime) }))
    .filter((slot) => slot.start !== null && slot.end !== null && slot.end > slot.start)
    .sort((a, b) => a.start - b.start);
}

/**
 * @param {string} roomNodeId
 * @param {{ teachers?: object[], timetables?: object[], now?: Date }} data
 * @returns {{ current, next, cabinOwners, laterToday: number }}
 *   current / next: { subject, courseCode, semester, startTime, endTime, endsIn, startsIn, teacher }
 *   cabinOwners: [{ teacher, teachingNow: slot|null }]
 */
export function getRoomSchedule(roomNodeId, { teachers = [], timetables = [], now = new Date() } = {}) {
  const day = WEEK_DAYS[now.getDay()];
  const minute = now.getHours() * 60 + now.getMinutes();
  const teacherById = new Map((teachers || []).map((teacher) => [String(teacher.teacherId).toUpperCase(), teacher]));
  const withTeacher = (slot) => slot && {
    ...slot,
    teacher: teacherById.get(String(slot.teacherId).toUpperCase()) || null,
  };

  const slots = todaysSlots(timetables, day);
  const inRoom = slots.filter((slot) => sameId(slot.roomNodeId, roomNodeId));
  const current = inRoom.find((slot) => slot.start <= minute && minute < slot.end) || null;
  const upcoming = inRoom.filter((slot) => slot.start > minute);
  const next = upcoming[0] || null;

  const cabinOwners = (teachers || [])
    .filter((teacher) => sameId(teacher.cabinNodeId, roomNodeId))
    .map((teacher) => {
      const teaching = slots.find((slot) => sameId(slot.teacherId, teacher.teacherId) && slot.start <= minute && minute < slot.end);
      return { teacher, teachingNow: teaching ? { ...teaching, endsIn: teaching.end - minute } : null };
    });

  return {
    day,
    current: current ? { ...withTeacher(current), endsIn: current.end - minute } : null,
    next: next ? { ...withTeacher(next), startsIn: next.start - minute } : null,
    laterToday: Math.max(0, upcoming.length - 1),
    cabinOwners,
  };
}

/** "25 min" / "1 h 10 min" */
export function formatDuration(minutes) {
  const value = Math.max(0, Math.round(minutes));
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
