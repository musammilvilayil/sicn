const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_indoor_nav_key_2026';

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ message: 'Not authorized, user no longer exists' });
      }
      req.user = user;
      return next();
    } catch (error) {
      console.error('JWT verification failed:', error.message);
      return res.status(401).json({ message: 'Not authorized, token invalid or expired' });
    }
  }

  return res.status(401).json({ message: 'Authentication required. Please sign in.' });
};

const optionalAuth = async (req, res, next) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (user) {
        req.user = user;
        return next();
      }
    } catch (err) {
      // Ignore invalid optional token and treat as Normal_User visitor
    }
  }
  req.user = { role: 'Normal_User', isGuest: true };
  return next();
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role || 'Normal_User';
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: `Access denied. Role '${userRole}' is not permitted to perform this action. Required role(s): ${allowedRoles.join(', ')}.`,
        currentRole: userRole,
        requiredRoles: allowedRoles,
      });
    }
    return next();
  };
};

module.exports = { protect, optionalAuth, authorizeRoles };
