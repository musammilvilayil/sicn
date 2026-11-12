import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, formatDuration, getRoomSchedule, toMinutes } from '../src/utils/roomSchedule.js';

const teachers = [
  { teacherId: 'TCH-001', name: 'Dr. Priya Nair', designation: 'Professor', cabinNodeId: '4F-HOD-CS' },
  { teacherId: 'TCH-002', name: 'Prof. Arun Kumar', cabinNodeId: '2F-FACULTY' },
];
const timetables = [
  { teacherId: 'TCH-001', dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30', roomNodeId: '1F-CLASS-02', subject: 'Graph Algorithms', courseCode: 'CST301' },
  { teacherId: 'tch-002', dayOfWeek: 'Monday', startTime: '11:00', endTime: '12:00', roomNodeId: '1f-class-02', subject: 'Compilers' },
  { teacherId: 'TCH-002', dayOfWeek: 'Monday', startTime: '14:00', endTime: '15:00', roomNodeId: '1F-CLASS-02', subject: 'Networks' },
  { teacherId: 'TCH-001', dayOfWeek: 'Tuesday', startTime: '09:00', endTime: '10:00', roomNodeId: '1F-CLASS-02', subject: 'Not today' },
  { teacherId: 'TCH-001', dayOfWeek: 'Monday', startTime: 'bad', endTime: '10:00', roomNodeId: '1F-CLASS-02', subject: 'Malformed' },
];
// 2026-11-16 is a Monday.
const at = (hh, mm) => new Date(2026, 10, 16, hh, mm);

test('parses and formats clock times', () => {
  assert.equal(toMinutes('09:30'), 570);
  assert.equal(toMinutes('24:00'), null);
  assert.equal(toMinutes(''), null);
  assert.equal(formatClock(570), '9:30 AM');
  assert.equal(formatClock(12 * 60), '12:00 PM');
  assert.equal(formatClock(0), '12:00 AM');
  assert.equal(formatDuration(25), '25 min');
  assert.equal(formatDuration(70), '1 h 10 min');
});

test('finds the class running now and the next one today', () => {
  const schedule = getRoomSchedule('1F-CLASS-02', { teachers, timetables, now: at(9, 45) });
  assert.equal(schedule.current.subject, 'Graph Algorithms');
  assert.equal(schedule.current.teacher.name, 'Dr. Priya Nair');
  assert.equal(schedule.current.endsIn, 45);
  assert.equal(schedule.next.subject, 'Compilers');
  assert.equal(schedule.next.startsIn, 75);
  assert.equal(schedule.next.teacher.name, 'Prof. Arun Kumar', 'ids match case-insensitively');
  assert.equal(schedule.laterToday, 1);
});

test('a class ending at 10:30 is over at 10:30, and other days are ignored', () => {
  const schedule = getRoomSchedule('1F-CLASS-02', { teachers, timetables, now: at(10, 30) });
  assert.equal(schedule.current, null);
  assert.equal(schedule.next.subject, 'Compilers');
  const evening = getRoomSchedule('1F-CLASS-02', { teachers, timetables, now: at(18, 0) });
  assert.equal(evening.current, null);
  assert.equal(evening.next, null);
});

test('reports whose cabin a room is and where that teacher is teaching now', () => {
  const cabin = getRoomSchedule('4F-HOD-CS', { teachers, timetables, now: at(9, 10) });
  assert.equal(cabin.cabinOwners.length, 1);
  assert.equal(cabin.cabinOwners[0].teacher.name, 'Dr. Priya Nair');
  assert.equal(cabin.cabinOwners[0].teachingNow.roomNodeId, '1F-CLASS-02');
  assert.equal(cabin.cabinOwners[0].teachingNow.endsIn, 80);
  const free = getRoomSchedule('4F-HOD-CS', { teachers, timetables, now: at(13, 0) });
  assert.equal(free.cabinOwners[0].teachingNow, null);
});
