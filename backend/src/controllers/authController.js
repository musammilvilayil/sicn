const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { VALID_ROLES } = require('../models/User');
const Teacher = require('../models/Teacher');

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      teacherId: user.teacherId || null,
    },
    process.env.JWT_SECRET || 'super_secret_jwt_indoor_nav_key_2026',
    {
      expiresIn: '30d',
    }
  );
};

const formatAuthResponse = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  teacherId: user.teacherId,
  department: user.department,
  currentLocationNodeId: user.currentLocationNodeId,
  avatarColor: user.avatarColor,
  token: generateToken(user),
});

// @desc    Register a new user with one of the 4 RBAC roles
// @route   POST /api/auth/register
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, department, teacherId, cabinNodeId } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide name, email, and password' });
    }

    const selectedRole = role || 'Normal_User';
    if (!VALID_ROLES.includes(selectedRole)) {
      return res.status(400).json({
        message: `Invalid role '${selectedRole}'. Allowed roles: ${VALID_ROLES.join(', ')}`,
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    let resolvedTeacherId = teacherId ? teacherId.toUpperCase().trim() : null;

    // If registering as a Teacher, link to existing Teacher profile or create one
    if (selectedRole === 'Teacher') {
      let existingTeacher = await Teacher.findOne({
        $or: [
          ...(resolvedTeacherId ? [{ teacherId: resolvedTeacherId }] : []),
          { email: normalizedEmail },
        ],
      });

      if (!existingTeacher) {
        const count = await Teacher.countDocuments();
        const newTchId = resolvedTeacherId || `TCH-00${count + 1}`;
        existingTeacher = await Teacher.create({
          teacherId: newTchId,
          name,
          email: normalizedEmail,
          department: department || 'Computer Science & Engineering',
          designation: 'Assistant Professor',
          cabinNodeId: cabinNodeId || '1F-FACULTY-ROOM',
          subjects: ['General Studies'],
        });
      }
      resolvedTeacherId = existingTeacher.teacherId;
    }

    const palette = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
    const avatarColor = palette[Math.floor(Math.random() * palette.length)];

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: selectedRole,
      teacherId: resolvedTeacherId,
      department: department || 'General',
      avatarColor,
    });

    return res.status(201).json(formatAuthResponse(user));
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (user && (await user.matchPassword(password))) {
      return res.json(formatAuthResponse(user));
    } else {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
const getUserProfile = async (req, res) => {
  if (req.user) {
    return res.json(req.user);
  }
  return res.status(404).json({ message: 'User not found' });
};

// @desc    Update user location checkpoint
// @route   PUT /api/auth/location
const updateUserLocation = async (req, res) => {
  try {
    const { nodeId } = req.body;
    if (!nodeId) {
      return res.status(400).json({ message: 'Node ID is required' });
    }

    req.user.currentLocationNodeId = nodeId.toUpperCase();
    await req.user.save();

    return res.json({
      message: 'Location updated successfully',
      currentLocationNodeId: req.user.currentLocationNodeId,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserLocation,
};
