const Node = require('../models/Node');
const Edge = require('../models/Edge');

// @desc    Get all nodes with optional filtering
// @route   GET /api/nodes
const getNodes = async (req, res) => {
  try {
    const { floor, type, search } = req.query;
    const filter = {};

    if (floor !== undefined && floor !== '') {
      filter.floor = Number(floor);
    }

    if (type) {
      filter.type = type;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { nodeId: { $regex: search, $options: 'i' } },
        { 'metadata.roomNumber': { $regex: search, $options: 'i' } },
        { 'metadata.department': { $regex: search, $options: 'i' } },
      ];
    }

    const nodes = await Node.find(filter).sort({ floor: 1, name: 1 });
    return res.json(nodes);
  } catch (error) {
    console.error('getNodes error:', error);
    return res.status(500).json({ message: 'Error retrieving nodes', error: error.message });
  }
};

// @desc    Get single node by nodeId
// @route   GET /api/nodes/:id
const getNodeById = async (req, res) => {
  try {
    const queryId = req.params.id.toUpperCase();
    const node = await Node.findOne({
      $or: [{ nodeId: queryId }, { qrCode: queryId }],
    });

    if (!node) {
      return res.status(404).json({ message: `Node '${req.params.id}' not found` });
    }

    return res.json(node);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get node by QR code payload
// @route   GET /api/nodes/qr/:qrCode
const getNodeByQR = async (req, res) => {
  try {
    const qrPayload = req.params.qrCode.trim();
    const normalizedPayload = qrPayload.toUpperCase();
    const fallbackNodeId = normalizedPayload.startsWith('QR_')
      ? normalizedPayload.slice(3).replace(/_/g, '-')
      : normalizedPayload;
    const node = await Node.findOne({
      $or: [
        { qrCode: qrPayload },
        { qrCode: normalizedPayload },
        { nodeId: normalizedPayload },
        { nodeId: fallbackNodeId },
      ],
    });

    if (!node) {
      return res.status(404).json({ message: `No node registered for QR code '${qrPayload}'` });
    }

    return res.json(node);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new map node (Admin RBAC only)
// @route   POST /api/nodes
const createNode = async (req, res) => {
  try {
    const {
      nodeId,
      name,
      floor,
      type,
      coordinates,
      qrCode,
      accessible,
      metadata,
      connectToNodeId,
      edgeDistance,
    } = req.body;

    if (!nodeId || !name || floor === undefined || !coordinates) {
      return res.status(400).json({
        message: 'nodeId, name, floor, and coordinates (x, y) are required',
      });
    }

    const formattedId = nodeId.trim().toUpperCase();
    const existing = await Node.findOne({ nodeId: formattedId });
    if (existing) {
      return res.status(400).json({ message: `Node '${formattedId}' already exists` });
    }

    const floorNum = Number(floor);
    const createdNode = await Node.create({
      nodeId: formattedId,
      name: name.trim(),
      floor: floorNum,
      type: type || 'room',
      coordinates: {
        x: Number(coordinates.x),
        y: Number(coordinates.y),
        z: coordinates.z !== undefined ? Number(coordinates.z) : floorNum * 3.9,
      },
      qrCode: qrCode || `QR_${formattedId.replace(/-/g, '_')}`,
      accessible: accessible !== undefined ? Boolean(accessible) : true,
      metadata: metadata || {},
    });

    let createdEdge = null;
    if (connectToNodeId) {
      const neighbor = await Node.findOne({ nodeId: connectToNodeId.trim().toUpperCase() });
      if (neighbor) {
        const dx = createdNode.coordinates.x - neighbor.coordinates.x;
        const dy = createdNode.coordinates.y - neighbor.coordinates.y;
        // Node x/y are metres in the architectural plan frame, so a same-floor
        // default is the straight-line plan distance (an estimate, not a traced path).
        const sameFloor = createdNode.floor === neighbor.floor;
        const computedDist = edgeDistance
          ? Number(edgeDistance)
          : sameFloor
            ? Math.max(0.5, Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10)
            : 10.6;

        createdEdge = await Edge.create({
          edgeId: `E_${neighbor.nodeId}_${createdNode.nodeId}_${Date.now()}`,
          fromNode: neighbor.nodeId,
          toNode: createdNode.nodeId,
          distance: computedDist,
          distanceEvidence: {
            source: 'admin_estimate',
            notes: edgeDistance
              ? 'Distance entered by the administrator when the node was created.'
              : 'Straight-line distance between plan positions; replace with a traced walkable path.',
          },
          accessible: createdNode.accessible && neighbor.accessible,
          type: createdNode.floor !== neighbor.floor ? 'stairs' : 'walking',
          instruction: `Proceed towards ${createdNode.name}`,
          reverseInstruction: `Return towards ${neighbor.name}`,
          isBidirectional: true,
        });
      }
    }

    return res.status(201).json({
      message: 'Node created successfully',
      node: createdNode,
      edge: createdEdge,
    });
  } catch (error) {
    console.error('createNode error:', error);
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Update an existing map node (Admin RBAC only)
// @route   PUT /api/nodes/:id
const updateNode = async (req, res) => {
  try {
    const targetId = req.params.id.toUpperCase();
    const node = await Node.findOne({ nodeId: targetId });

    if (!node) {
      return res.status(404).json({ message: `Node '${targetId}' not found` });
    }

    const { name, floor, type, coordinates, qrCode, accessible, metadata } = req.body;

    if (name !== undefined) node.name = name.trim();
    if (floor !== undefined) node.floor = Number(floor);
    if (type !== undefined) node.type = type;
    if (qrCode !== undefined) node.qrCode = qrCode.trim();
    if (accessible !== undefined) node.accessible = Boolean(accessible);
    if (coordinates) {
      node.coordinates = {
        x: coordinates.x !== undefined ? Number(coordinates.x) : node.coordinates.x,
        y: coordinates.y !== undefined ? Number(coordinates.y) : node.coordinates.y,
        z: coordinates.z !== undefined ? Number(coordinates.z) : node.floor * 3.9,
      };
    }
    if (metadata !== undefined) {
      node.metadata = { ...node.metadata, ...metadata };
    }

    await node.save();
    return res.json({ message: 'Node updated successfully', node });
  } catch (error) {
    console.error('updateNode error:', error);
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a map node and its connected edges (Admin RBAC only)
// @route   DELETE /api/nodes/:id
const deleteNode = async (req, res) => {
  try {
    const targetId = req.params.id.toUpperCase();
    const deleted = await Node.findOneAndDelete({ nodeId: targetId });

    if (!deleted) {
      return res.status(404).json({ message: `Node '${targetId}' not found` });
    }

    await Edge.deleteMany({
      $or: [{ fromNode: targetId }, { toNode: targetId }],
    });

    return res.json({ message: `Node '${targetId}' and connected edges deleted` });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getNodes,
  getNodeById,
  getNodeByQR,
  createNode,
  updateNode,
  deleteNode,
};
