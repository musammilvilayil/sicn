const API_BASE = '/api';

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem('bji_nav_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export const api = {
  // ================= NODES (Public Read + Admin CRUD) =================
  async getNodes(params = {}) {
    const query = new URLSearchParams();
    if (params.floor !== undefined && params.floor !== '') query.append('floor', params.floor);
    if (params.type) query.append('type', params.type);
    if (params.search) query.append('search', params.search);

    const res = await fetch(`${API_BASE}/nodes?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch nodes');
    return res.json();
  },

  async getNodeById(id) {
    const res = await fetch(`${API_BASE}/nodes/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Failed to fetch node');
    return res.json();
  },

  async getNodeByQR(qrCode) {
    const res = await fetch(`${API_BASE}/nodes/qr/${encodeURIComponent(qrCode)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Invalid QR code checkpoint');
    return data;
  },

  async createNode(nodePayload) {
    const res = await fetch(`${API_BASE}/nodes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(nodePayload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to create node');
    return data;
  },

  async updateNode(nodeId, nodePayload) {
    const res = await fetch(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(nodePayload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to update node');
    return data;
  },

  async deleteNode(nodeId) {
    const res = await fetch(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to delete node');
    return data;
  },

  // ================= NAVIGATION & EDGES =================
  async getRoute({ startNodeId, destinationNodeId, accessibleOnly = false }) {
    const res = await fetch(`${API_BASE}/navigation/route`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ startNodeId, destinationNodeId, accessibleOnly }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Route calculation failed');
    return data;
  },

  async getEdges() {
    const res = await fetch(`${API_BASE}/navigation/edges`);
    if (!res.ok) throw new Error('Failed to fetch edges');
    return res.json();
  },

  async createEdge(edgePayload) {
    const res = await fetch(`${API_BASE}/navigation/edges`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(edgePayload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to create edge');
    return data;
  },

  async deleteEdge(edgeId) {
    const res = await fetch(`${API_BASE}/navigation/edges/${encodeURIComponent(edgeId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to delete edge');
    return data;
  },

  // ================= TEACHERS & TIMETABLES (RBAC Protected) =================
  async getTeachers() {
    const res = await fetch(`${API_BASE}/teachers`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch teachers');
    return data;
  },

  async getTeacherById(teacherId) {
    const res = await fetch(`${API_BASE}/teachers/${encodeURIComponent(teacherId)}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch teacher profile');
    return data;
  },

  async getTeacherDestination(teacherId, day, time) {
    const query = new URLSearchParams();
    if (day) query.append('day', day);
    if (time) query.append('time', time);

    const res = await fetch(
      `${API_BASE}/teachers/${encodeURIComponent(teacherId)}/destination?${query.toString()}`,
      { headers: getAuthHeaders() }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to resolve teacher destination');
    return data;
  },

  async getTimetables(params = {}) {
    const query = new URLSearchParams();
    if (params.day) query.append('day', params.day);
    if (params.teacherId) query.append('teacherId', params.teacherId);
    if (params.roomNodeId) query.append('roomNodeId', params.roomNodeId);

    const res = await fetch(`${API_BASE}/timetable?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch timetables');
    return data;
  },

  async createTimetable(payload) {
    const res = await fetch(`${API_BASE}/timetable`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to add timetable slot');
    return data;
  },

  async updateTimetable(id, payload) {
    const res = await fetch(`${API_BASE}/timetable/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to update timetable slot');
    return data;
  },

  async deleteTimetable(id) {
    const res = await fetch(`${API_BASE}/timetable/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to delete timetable slot');
    return data;
  },

  // ================= AUTHENTICATION & USER LOCATION =================
  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    return data;
  },

  async provisionUser(userData) {
    const res = await fetch(`${API_BASE}/auth/provision`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(userData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Account provisioning failed');
    return data;
  },

  async register(userData) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');
    return data;
  },

  async changePassword(currentPassword, newPassword) {
    const res = await fetch(`${API_BASE}/auth/password`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Password update failed');
    return data;
  },

  async getMe(token) {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Session invalid');
    return res.json();
  },

  async updateMyLocation(nodeId) {
    const token = localStorage.getItem('bji_nav_token');
    if (!token) return null;
    const res = await fetch(`${API_BASE}/auth/location`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ nodeId }),
    });
    if (!res.ok) return null;
    return res.json();
  },

  // ================= DATABASE SEED (Admin Only) =================
  async reseed() {
    const res = await fetch(`${API_BASE}/seed`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Database reset failed');
    return data;
  },
};
