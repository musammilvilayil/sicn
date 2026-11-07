const Node = require('../models/Node');
const Edge = require('../models/Edge');
const User = require('../models/User');
const { findShortestPath } = require('../algorithms/aStar');

// @desc    Calculate shortest route between two nodes across floors using A*
// @route   POST /api/navigation/route
const calculateRoute = async (req, res) => {
  try {
    const { startNodeId, destinationNodeId, accessibleOnly } = req.body;

    if (!startNodeId || !destinationNodeId) {
      return res.status(400).json({
        message: 'Both startNodeId and destinationNodeId are required',
      });
    }

    const [nodes, edges] = await Promise.all([
      Node.find({}).lean(),
      Edge.find({}).lean(),
    ]);

    const formattedStart = startNodeId.trim().toUpperCase();
    const formattedDest = destinationNodeId.trim().toUpperCase();

    const result = findShortestPath(
      formattedStart,
      formattedDest,
      nodes,
      edges,
      { accessibleOnly: Boolean(accessibleOnly) }
    );

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('calculateRoute error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error computing route',
    });
  }
};

// @desc    Get all edges
// @route   GET /api/navigation/edges
const getEdges = async (req, res) => {
  try {
    const edges = await Edge.find({}).lean();
    return res.json(edges);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new graph edge between two nodes (Admin RBAC only)
// @route   POST /api/navigation/edges
const createEdge = async (req, res) => {
  try {
    const { fromNode, toNode, distance, accessible, type, instruction, reverseInstruction } = req.body;

    if (!fromNode || !toNode) {
      return res.status(400).json({ message: 'fromNode and toNode are required' });
    }

    const u = fromNode.trim().toUpperCase();
    const v = toNode.trim().toUpperCase();

    const [nodeU, nodeV] = await Promise.all([
      Node.findOne({ nodeId: u }),
      Node.findOne({ nodeId: v }),
    ]);

    if (!nodeU || !nodeV) {
      return res.status(404).json({ message: 'One or both endpoint nodes do not exist' });
    }

    const dx = nodeU.coordinates.x - nodeV.coordinates.x;
    const dy = nodeU.coordinates.y - nodeV.coordinates.y;
    const computedDist = distance !== undefined
      ? Number(distance)
      : Math.max(2, Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10);

    const edge = await Edge.create({
      edgeId: `E_${u}_${v}_${Date.now()}`,
      fromNode: u,
      toNode: v,
      distance: computedDist,
      accessible: accessible !== undefined ? Boolean(accessible) : nodeU.accessible && nodeV.accessible,
      type: type || (nodeU.floor !== nodeV.floor ? 'stairs' : 'walking'),
      instruction: instruction || `Walk towards ${nodeV.name}`,
      reverseInstruction: reverseInstruction || `Walk towards ${nodeU.name}`,
      isBidirectional: true,
    });

    return res.status(201).json({ message: 'Edge created successfully', edge });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Delete an edge (Admin RBAC only)
// @route   DELETE /api/navigation/edges/:edgeId
const deleteEdge = async (req, res) => {
  try {
    const deleted = await Edge.findOneAndDelete({ edgeId: req.params.edgeId });
    if (!deleted) {
      return res.status(404).json({ message: 'Edge not found' });
    }
    return res.json({ message: 'Edge deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


const getCrowdSummary = async (req, res) => {
  try {
    const minutes = Math.min(60, Math.max(1, Number(req.query.windowMinutes) || 10));
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const groups = await User.aggregate([
      { $match: { role: { $in: ['Student', 'Teacher'] }, locationUpdatedAt: { $gte: since }, currentLocationNodeId: { $type: 'string' } } },
      { $group: { _id: '$currentLocationNodeId', people: { $sum: 1 } } },
      { $sort: { people: -1 } },
      { $limit: 100 },
    ]);
    const nodeIds = groups.map((x) => x._id);
    const nodes = await Node.find({ nodeId: { $in: nodeIds } }).select('nodeId name floor type').lean();
    const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));
    const hotspots = groups.map((g) => ({ nodeId: g._id, people: g.people, ...(nodeMap.get(g._id) || {}) }));
    const floors = new Map();
    hotspots.forEach((h) => {
      const floor = Number.isFinite(h.floor) ? h.floor : -1;
      floors.set(floor, (floors.get(floor) || 0) + h.people);
    });
    return res.json({
      windowMinutes: minutes,
      activeCheckpoints: hotspots.length,
      estimatedPeople: hotspots.reduce((sum, h) => sum + h.people, 0),
      floors: [...floors.entries()].map(([floor, people]) => ({ floor, people })).sort((a, b) => a.floor - b.floor),
      hotspots,
      privacy: 'Aggregated counts only; no individual identities are returned.',
      source: 'Recent QR checkpoint confirmations only; not a continuous sensor count.',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to calculate campus occupancy.' });
  }
};

module.exports = {
  calculateRoute,
  getEdges,
  createEdge,
  deleteEdge,
  getCrowdSummary,
};
