const express = require('express');
const router = express.Router();
const {
  calculateRoute,
  getEdges,
  createEdge,
  deleteEdge,
} = require('../controllers/navigationController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Public point-to-point map routing (Available to all roles including Normal_User)
router.post('/route', calculateRoute);
router.get('/edges', getEdges);

// Admin RBAC only for modifying map edges
router.post('/edges', protect, authorizeRoles('Admin'), createEdge);
router.delete('/edges/:edgeId', protect, authorizeRoles('Admin'), deleteEdge);

module.exports = router;
