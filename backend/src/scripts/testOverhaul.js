const { io } = require('../../..//frontend/node_modules/socket.io-client');

const API = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

async function loginAs(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${data.message}`);
  return data;
}

async function runVerification() {
  console.log('=== Verifying RBAC Roles, Map CRUD, Timetable CRUD & Socket.io Live Rooms ===\n');

  // 1. Authenticate all 4 exact roles
  const [admin, teacher, student, normalUser] = await Promise.all([
    loginAs('admin@bji.ac.in', 'AdminPassword@123'),
    loginAs('priya.nair@bji.ac.in', 'Teacher@123'),
    loginAs('student@bji.ac.in', 'Password@123'),
    loginAs('visitor@bji.ac.in', 'Visitor@123'),
  ]);

  console.log(`✓ Authenticated all 4 exact roles: ${admin.role}, ${teacher.role}, ${student.role}, ${normalUser.role}`);

  // 2. Verify Normal_User RBAC (Gets point-to-point route, blocked from Timetable routing & Node edit)
  const visitorRouteRes = await fetch(`${API}/navigation/route`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${normalUser.token}`,
    },
    body: JSON.stringify({ startNodeId: 'GF-MAIN-ENTRANCE', destinationNodeId: '1F-CLASS-02' }),
  });
  if (!visitorRouteRes.ok) throw new Error('Normal_User point-to-point routing failed');

  const visitorTimetableRes = await fetch(`${API}/teachers/TCH-001/destination`, {
    headers: { Authorization: `Bearer ${normalUser.token}` },
  });
  if (visitorTimetableRes.status !== 403) {
    throw new Error(`Expected 403 for Normal_User timetable access, got ${visitorTimetableRes.status}`);
  }
  console.log('✓ Normal_User RBAC verified: Point-to-point routing ALLOWED, Timetable routing BLOCKED (403)');

  // 3. Verify Student RBAC (Gets Timetable routing, blocked from Timetable edit & Node edit)
  const studentDestRes = await fetch(
    `${API}/teachers/TCH-001/destination?day=Monday&time=09:30`,
    { headers: { Authorization: `Bearer ${student.token}` } }
  );
  const studentDest = await studentDestRes.json();
  if (!studentDestRes.ok || studentDest.destinationNodeId !== '1F-CLASS-02') {
    throw new Error('Student timetable routing failed');
  }
  const studentEditRes = await fetch(`${API}/timetable`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${student.token}`,
    },
    body: JSON.stringify({}),
  });
  if (studentEditRes.status !== 403) {
    throw new Error('Expected 403 when Student attempts timetable update');
  }
  console.log('✓ Student RBAC verified: Timetable routing ALLOWED (1F-CLASS-02), Timetable editing BLOCKED (403)');

  // 4. Verify Teacher RBAC (Can create & delete own timetable slot, blocked from Map Node edit)
  const createSlotRes = await fetch(`${API}/timetable`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacher.token}`,
    },
    body: JSON.stringify({
      dayOfWeek: 'Saturday',
      startTime: '14:00',
      endTime: '15:00',
      roomNodeId: '1F-CLASS-02',
      subject: 'Special AI Workshop',
      courseCode: 'CST499',
      semester: 'S7 CSE',
    }),
  });
  const createdSlotData = await createSlotRes.json();
  if (!createSlotRes.ok) throw new Error(`Teacher timetable create failed: ${createdSlotData.message}`);

  await fetch(`${API}/timetable/${createdSlotData.entry._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${teacher.token}` },
  });

  const teacherNodeEditRes = await fetch(`${API}/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacher.token}`,
    },
    body: JSON.stringify({}),
  });
  if (teacherNodeEditRes.status !== 403) {
    throw new Error('Expected 403 when Teacher attempts map node edit');
  }
  console.log('✓ Teacher RBAC verified: Timetable update ALLOWED, Map node editing BLOCKED (403)');

  // 5. Verify Admin RBAC (Can create & delete map nodes)
  const createNodeRes = await fetch(`${API}/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      nodeId: 'GF-TEST-KIOSK',
      name: 'Digital Help Kiosk',
      floor: 0,
      type: 'checkpoint',
      coordinates: { x: 52, y: 42 },
      connectToNodeId: 'GF-FOYER',
    }),
  });
  if (!createNodeRes.ok) throw new Error('Admin node creation failed');

  await fetch(`${API}/nodes/GF-TEST-KIOSK`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  console.log('✓ Admin RBAC verified: Map node & edge creation/deletion ALLOWED');

  // 6. Verify Socket.io 6-Digit Room Sharing & Instant Checkpoint Broadcast
  const socketHost = io(SOCKET_URL, { transports: ['websocket'] });
  const socketFriend = io(SOCKET_URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise((res) => socketHost.on('connect', res)),
    new Promise((res) => socketFriend.on('connect', res)),
  ]);

  const createdRoom = await new Promise((res) =>
    socketHost.emit(
      'create_room',
      { userName: 'Alex', role: 'Student', nodeId: 'GF-MAIN-ENTRANCE' },
      res
    )
  );

  if (!createdRoom.success || !/^\d{6}$/.test(createdRoom.roomCode)) {
    throw new Error('Failed to generate 6-digit Socket.io room code');
  }
  console.log(`✓ Generated unique 6-digit Socket.io room code: #${createdRoom.roomCode}`);

  const joinedRoom = await new Promise((res) =>
    socketFriend.emit(
      'join_room',
      { roomCode: createdRoom.roomCode, userName: 'Meera', role: 'Student', nodeId: 'GF-FOYER' },
      res
    )
  );
  if (!joinedRoom.success || joinedRoom.members.length !== 2) {
    throw new Error('Friend failed to join 6-digit Socket.io room');
  }

  // Listen on Friend's socket for Alex scanning QR_1F_CLASS_02
  const broadcastPromise = new Promise((resolve) => {
    socketFriend.on('location_updated', (payload) => {
      resolve(payload);
    });
  });

  socketHost.emit('update_location', {
    roomCode: createdRoom.roomCode,
    nodeId: 'QR_1F_CLASS_02',
  });

  const liveUpdate = await broadcastPromise;
  if (liveUpdate.member.nodeId !== '1F-CLASS-02' || liveUpdate.member.floor !== 1) {
    throw new Error('Live QR location broadcast mismatch');
  }
  console.log(
    `✓ Real-Time Socket.io Broadcast verified: Friend received instant move -> ${liveUpdate.member.userName} @ ${liveUpdate.member.nodeName} (Floor ${liveUpdate.member.floor})`
  );

  socketHost.disconnect();
  socketFriend.disconnect();

  console.log('\n==============================================================');
  console.log('ALL RBAC, ROUTING & LIVE SOCKET.IO TESTS PASSED SUCCESSFULLY!');
  console.log('==============================================================\n');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});

