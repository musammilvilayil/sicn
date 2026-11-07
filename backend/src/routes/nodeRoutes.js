const express = require('express');
const router = express.Router();
const {
  getNodes,
  getNodeById,
  getNodeByQR,
  createNode,
  updateNode,
  deleteNode,
} = require('../controllers/nodeController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Public read endpoints (All roles including Normal_User get map nodes & QR scanning)
router.get('/', getNodes);
router.get('/qr/:qrCode', getNodeByQR);
router.get('/:id', getNodeById);

// Admin RBAC endpoints for map & node editing
router.post('/', protect, authorizeRoles('Admin'), createNode);
router.put('/:id', protect, authorizeRoles('Admin'), updateNode);
router.delete('/:id', protect, authorizeRoles('Admin'), deleteNode);

module.exports = router;
