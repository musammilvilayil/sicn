const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-')) {
    throw new Error('JWT_SECRET is not configured correctly.');
  }
  return process.env.JWT_SECRET;
};

const verifyRequestToken = async (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const decoded = jwt.verify(token, getJwtSecret());
  return User.findById(decoded.id).select('-password');
};

const protect = async (req, res, next) => {
  try {
    const user = await verifyRequestToken(req);
    if (!user) return res.status(401).json({ message: 'Authentication required. Please sign in.' });
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token invalid or expired.' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    req.user = await verifyRequestToken(req) || { role: 'Normal_User', isGuest: true };
  } catch {
    req.user = { role: 'Normal_User', isGuest: true };
  }
  return next();
};

const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  const userRole = req.user?.role || 'Normal_User';
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({
      message: 'You do not have permission to perform this action.',
      currentRole: userRole,
      requiredRoles: allowedRoles,
    });
  }
  return next();
};

module.exports = { protect, optionalAuth, authorizeRoles };
