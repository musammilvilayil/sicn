const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const connectDB = require('./config/db');
const ensureBootstrapAdmin = require('./scripts/ensureBootstrapAdmin');
const { initLocationSocket, rooms } = require('./socket/locationSocket');

dotenv.config();

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Native clients and same-origin requests may omit Origin.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)');
  next();
});
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

const io = initLocationSocket(server);

const authRoutes = require('./routes/authRoutes');
const nodeRoutes = require('./routes/nodeRoutes');
const navigationRoutes = require('./routes/navigationRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const seedRoutes = require('./routes/seedRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/navigation', navigationRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/seed', seedRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    system: 'Smart Indoor College Navigation and Campus Assistance System',
    campus: 'Bishop Jerome Institute, Kollam',
    websockets: 'active',
    activeSharingRooms: rooms.size,
    rolesSupported: ['Admin', 'Teacher', 'Student', 'Normal_User'],
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.send('Smart Indoor Navigation API & Socket.io Server is running.');
});

app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  const status = Number(err.status || err.statusCode) || 500;
  res.status(status).json({
    message: status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error',
  });
});

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-')) {
    throw new Error('JWT_SECRET must be configured and contain at least 32 characters.');
  }
  await connectDB();
  await ensureBootstrapAdmin();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, resolve);
  });
  console.log(`Smart Indoor Navigation & Socket.io Server running on port ${PORT}`);
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  });
}

module.exports = { app, server, io, startServer };
