const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (user) => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters.');
  }
  return jwt.sign(
    { id: user._id, role: user.role, teacherId: user.teacherId || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
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
  mustChangePassword: Boolean(user.mustChangePassword),
  token: generateToken(user),
});

// Public registration is intentionally restricted to ordinary visitor accounts.
// Staff and administrator accounts must be provisioned through trusted channels.
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide name, email, and password.' });
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ message: 'Name must contain 2 to 80 characters.' });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
      return res.status(400).json({ message: 'Password must contain 10 to 128 characters.' });
    }
    if (req.body?.role && req.body.role !== 'Normal_User') {
      return res.status(403).json({
        message: 'Public registration is limited to visitor accounts. Contact an administrator for staff access.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ message: 'An account already exists with this email.' });
    }

    const palette = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'Normal_User',
      department: 'Visitor',
      avatarColor: palette[cryptoRandomIndex(palette.length)],
    });

    return res.status(201).json(formatAuthResponse(user));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account already exists with this email.' });
    }
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Server error during registration.' });
  }
};

function cryptoRandomIndex(length) {
  return require('crypto').randomInt(0, length);
}

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ message: 'Please provide email and password.' });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (user && (await user.matchPassword(password))) {
      return res.json(formatAuthResponse(user));
    }
    return res.status(401).json({ message: 'Invalid email or password.' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login.' });
  }
};

const getUserProfile = async (req, res) => {
  if (req.user) return res.json(req.user);
  return res.status(404).json({ message: 'User not found.' });
};

const updateUserLocation = async (req, res) => {
  try {
    const { nodeId } = req.body || {};
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      return res.status(400).json({ message: 'Node ID is required.' });
    }
    req.user.currentLocationNodeId = nodeId.trim().toUpperCase();
    await req.user.save();
    return res.json({
      message: 'Location updated successfully.',
      currentLocationNodeId: req.user.currentLocationNodeId,
    });
  } catch (error) {
    console.error('Location update error:', error);
    return res.status(500).json({ message: 'Unable to update location.' });
  }
};


const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ message: 'Current and new passwords are required.' });
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      return res.status(400).json({ message: 'New password must contain 12 to 128 characters.' });
    }

    const user = await User.findById(req.user._id);
    if (!user || !(await user.matchPassword(currentPassword))) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();
    return res.json({ message: 'Password updated successfully. Please sign in again.' });
  } catch (error) {
    console.error('Password change error:', error);
    return res.status(500).json({ message: 'Unable to update password.' });
  }
};

module.exports = { registerUser, loginUser, getUserProfile, updateUserLocation, changePassword };
