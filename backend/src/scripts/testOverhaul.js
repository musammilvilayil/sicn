const { io } = require('../../../frontend/node_modules/socket.io-client');

const API = process.env.TEST_API_BASE || 'http://localhost:5000/api';
const SOCKET_URL = process.env.TEST_SOCKET_URL || 'http://localhost:5000';

async function loginAsAdmin() {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run the security smoke test.');
  }

  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok || data.role !== 'Admin') {
    throw new Error('Configured test credentials did not authenticate an Admin account.');
  }
  return data;
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), 6000);
    socket.emit(event, payload, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

async function runVerification() {
  console.log('=== SICN security and live-sharing smoke test ===');
  const admin = await loginAsAdmin();

  const meResponse = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const me = await meResponse.json();
  if (!meResponse.ok || me.role !== 'Admin') throw new Error('Protected profile endpoint failed.');
  console.log('PASS: Admin authentication and protected profile.');

  const escalationResponse = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Privilege Escalation Test',
      email: `role-escalation-${Date.now()}@example.invalid`,
      password: 'NotARealPassword-2026!',
      role: 'Admin',
    }),
  });
  if (escalationResponse.status !== 403) {
    throw new Error(`Public Admin role assignment should return 403; got ${escalationResponse.status}.`);
  }
  console.log('PASS: Public registration cannot assign Admin role.');

  const provisionResponse = await fetch(`${API}/auth/provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      name: 'Admin Escalation Test',
      email: `admin-provision-test-${Date.now()}@example.invalid`,
      password: 'NotARealPassword-2026!',
      role: 'Admin',
    }),
  });
  if (provisionResponse.status !== 400) {
    throw new Error(`Admin provisioning endpoint must reject creating another Admin; got ${provisionResponse.status}.`);
  }
  console.log('PASS: Provisioning endpoint cannot create another Admin.');

  const host = io(SOCKET_URL, { transports: ['websocket'], auth: { token: admin.token } });
  const guest = io(SOCKET_URL, { transports: ['websocket'] });
  try {
    await Promise.all([
      new Promise((resolve, reject) => {
        host.once('connect', resolve);
        host.once('connect_error', reject);
      }),
      new Promise((resolve, reject) => {
        guest.once('connect', resolve);
        guest.once('connect_error', reject);
      }),
    ]);

    const created = await emitAck(host, 'create_room', {
      userName: 'Forged Admin Name',
      role: 'Normal_User',
      nodeId: 'GF-MAIN-ENTRANCE',
    });
    if (!created?.success || !/^\d{6}$/.test(created.roomCode)) {
      throw new Error('Authenticated user could not create a live room.');
    }
    if (created.me.role !== 'Admin') throw new Error('Socket trusted a client-supplied role instead of the JWT identity.');

    const joined = await emitAck(guest, 'join_room', {
      roomCode: created.roomCode,
      userName: 'Campus Guest',
      role: 'Admin',
      nodeId: 'GF-MAIN-ENTRANCE',
    });
    if (!joined?.success || joined.me.role !== 'Normal_User') {
      throw new Error('Guest socket was allowed to impersonate a privileged role.');
    }
    console.log('PASS: Socket.IO uses JWT roles and forces anonymous guests to Normal_User.');
    console.log('PASS: Live sharing room creation and joining.');
  } finally {
    host.disconnect();
    guest.disconnect();
  }

  console.log('All SICN security smoke tests passed.');
}

runVerification().catch((error) => {
  console.error('SICN smoke test failed:', error.message);
  process.exitCode = 1;
});
