const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { initLocationSocket, rooms } = require('./socket/locationSocket');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Attach Socket.io Real-Time Location Sharing Server
const io = initLocationSocket(server);

// Middlewares
app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Route imports
const authRoutes = require('./routes/authRoutes');
const nodeRoutes = require('./routes/nodeRoutes');
const navigationRoutes = require('./routes/navigationRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const seedRoutes = require('./routes/seedRoutes');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/navigation', navigationRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/seed', seedRoutes);

// Health check endpoint
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
  res.send('Smart Indoor College Navigation API & Socket.io Server is running.');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Smart Indoor Navigation & Socket.io Server running on port ${PORT}`);
});

module.exports = { app, server, io };
