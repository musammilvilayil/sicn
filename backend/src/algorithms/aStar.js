/**
 * A* Pathfinding Algorithm for Multi-Floor Indoor Navigation
 */

class PriorityQueue {
  constructor() {
    this.elements = [];
  }

  enqueue(item, priority) {
    this.elements.push({ item, priority });
    this.elements.sort((a, b) => a.priority - b.priority);
  }

  dequeue() {
    return this.elements.shift()?.item;
  }

  isEmpty() {
    return this.elements.length === 0;
  }
}

/**
 * Heuristic function: 3D Euclidean distance with vertical transition weight
 */
function heuristic(nodeA, nodeB) {
  if (!nodeA || !nodeB) return 0;
  const dx = (nodeA.coordinates?.x ?? 0) - (nodeB.coordinates?.x ?? 0);
  const dy = (nodeA.coordinates?.y ?? 0) - (nodeB.coordinates?.y ?? 0);
  const zA = nodeA.coordinates?.z ?? (nodeA.floor ?? 0) * 3.9;
  const zB = nodeB.coordinates?.z ?? (nodeB.floor ?? 0) * 3.9;
  const dz = zA - zB;
  // Admissible 3D Euclidean heuristic (3.9m floor height <= 4.0m lift / 7.0m stair cost)
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Generate human-friendly step instructions
 */
function formatDirections(pathNodes, pathEdges) {
  const directions = [];

  if (pathNodes.length === 0) return directions;

  directions.push({
    step: 1,
    type: 'start',
    floor: pathNodes[0].floor,
    nodeId: pathNodes[0].nodeId,
    instruction: `Start at ${pathNodes[0].name} (${pathNodes[0].floor === 0 ? 'Ground Floor' : `Floor ${pathNodes[0].floor}`})`,
    distance: 0,
  });

  let currentFloor = pathNodes[0].floor;

  for (let i = 0; i < pathEdges.length; i++) {
    const edge = pathEdges[i];
    const fromNode = pathNodes[i];
    const toNode = pathNodes[i + 1];

    let instruction = edge.instruction;
    let stepType = 'straight';

    // Check if reverse direction was taken
    if (edge.toNode === fromNode.nodeId && edge.reverseInstruction) {
      instruction = edge.reverseInstruction;
    }

    if (toNode.floor !== fromNode.floor) {
      if (edge.type === 'lift') {
        stepType = 'lift';
        instruction = `Take the elevator from ${fromNode.floor === 0 ? 'Ground Floor' : `Floor ${fromNode.floor}`} to ${toNode.floor === 0 ? 'Ground Floor' : `Floor ${toNode.floor}`}`;
      } else {
        stepType = 'stairs';
        const direction = toNode.floor > fromNode.floor ? 'up' : 'down';
        instruction = `Take the stairs ${direction} to ${toNode.floor === 0 ? 'Ground Floor' : `Floor ${toNode.floor}`}`;
      }
      currentFloor = toNode.floor;
    } else if (i === pathEdges.length - 1) {
      stepType = 'arrive';
      instruction = `Arrive at destination: ${toNode.name} (${toNode.floor === 0 ? 'Ground Floor' : `Floor ${toNode.floor}`})`;
    } else if (!instruction) {
      instruction = `Continue towards ${toNode.name}`;
    }

    directions.push({
      step: i + 2,
      type: stepType,
      floor: toNode.floor,
      fromNodeId: fromNode.nodeId,
      toNodeId: toNode.nodeId,
      instruction,
      distance: Math.round(edge.distance * 10) / 10,
    });
  }

  return directions;
}

/**
 * A* Search Implementation
 * @param {string} startId
 * @param {string} targetId
 * @param {Array} nodes
 * @param {Array} edges
 * @param {Object} options { accessibleOnly: boolean }
 */
function findShortestPath(startId, targetId, nodes, edges, options = {}) {
  const { accessibleOnly = false } = options;

  const nodeMap = new Map();
  nodes.forEach((n) => nodeMap.set(n.nodeId, n));

  const startNode = nodeMap.get(startId);
  const targetNode = nodeMap.get(targetId);

  if (!startNode) {
    throw new Error(`Start node '${startId}' not found in map data`);
  }
  if (!targetNode) {
    throw new Error(`Target node '${targetId}' not found in map data`);
  }

  if (startId === targetId) {
    return {
      success: true,
      path: [startNode],
      nodeIds: [startId],
      totalDistance: 0,
      estimatedTimeMinutes: 0,
      floorsCovered: [startNode.floor],
      directions: [
        {
          step: 1,
          type: 'arrive',
          floor: startNode.floor,
          nodeId: startId,
          instruction: `You are already at ${startNode.name}`,
          distance: 0,
        },
      ],
      edges: [],
    };
  }

  // Build Adjacency List
  const adj = new Map();
  nodes.forEach((n) => adj.set(n.nodeId, []));

  edges.forEach((edge) => {
    if (!Number.isFinite(Number(edge.distance)) || Number(edge.distance) <= 0) return;
    // If wheelchair accessible mode is requested, ignore non-accessible paths
    if (accessibleOnly && !edge.accessible) {
      return;
    }

    if (adj.has(edge.fromNode)) {
      adj.get(edge.fromNode).push({
        neighbor: edge.toNode,
        distance: edge.distance,
        edge,
        isReverse: false,
      });
    }

    if (edge.isBidirectional && adj.has(edge.toNode)) {
      adj.get(edge.toNode).push({
        neighbor: edge.fromNode,
        distance: edge.distance,
        edge,
        isReverse: true,
      });
    }
  });

  const openSet = new PriorityQueue();
  const gScore = new Map();
  const fScore = new Map();
  const cameFrom = new Map();

  nodes.forEach((n) => {
    gScore.set(n.nodeId, Infinity);
    fScore.set(n.nodeId, Infinity);
  });

  gScore.set(startId, 0);
  fScore.set(startId, heuristic(startNode, targetNode));
  openSet.enqueue(startId, fScore.get(startId));

  const visited = new Set();

  while (!openSet.isEmpty()) {
    const currentId = openSet.dequeue();
    if (visited.has(currentId)) continue;

    if (currentId === targetId) {
      // Reconstruct path
      const pathNodeIds = [currentId];
      const pathEdges = [];

      let curr = currentId;
      while (cameFrom.has(curr)) {
        const { prevNode, edge } = cameFrom.get(curr);
        pathEdges.unshift(edge);
        pathNodeIds.unshift(prevNode);
        curr = prevNode;
      }

      const pathNodes = pathNodeIds.map((id) => nodeMap.get(id));
      const totalDistance = pathEdges.reduce((acc, e) => acc + e.distance, 0);
      const floorsCovered = [...new Set(pathNodes.map((n) => n.floor))].sort((a, b) => a - b);
      
      // Average walking speed ~ 1.2 m/s = 72 m/min, plus 0.5 min per floor shift
      const floorChanges = Math.abs(targetNode.floor - startNode.floor);
      const walkingTimeMin = totalDistance / 70;
      const verticalDelayMin = floorChanges * 0.5;
      const estimatedTimeMinutes = Math.max(1, Math.round((walkingTimeMin + verticalDelayMin) * 10) / 10);

      const directions = formatDirections(pathNodes, pathEdges);

      return {
        success: true,
        path: pathNodes,
        nodeIds: pathNodeIds,
        totalDistance: Math.round(totalDistance * 10) / 10,
        estimatedTimeMinutes,
        floorsCovered,
        directions,
        edges: pathEdges,
      };
    }

    visited.add(currentId);

    const neighbors = adj.get(currentId) || [];
    for (const { neighbor, distance, edge } of neighbors) {
      if (visited.has(neighbor)) continue;

      const tentativeGScore = gScore.get(currentId) + distance;

      if (tentativeGScore < gScore.get(neighbor)) {
        cameFrom.set(neighbor, { prevNode: currentId, edge });
        gScore.set(neighbor, tentativeGScore);

        const neighborNode = nodeMap.get(neighbor);
        const newFScore = tentativeGScore + heuristic(neighborNode, targetNode);
        fScore.set(neighbor, newFScore);

        openSet.enqueue(neighbor, newFScore);
      }
    }
  }

  // No path found
  return {
    success: false,
    message: `No available path found between ${startNode.name} and ${targetNode.name}${accessibleOnly ? ' using wheelchair-accessible routes' : ''}.`,
    path: [],
    nodeIds: [],
    totalDistance: 0,
    directions: [],
    edges: [],
  };
}

module.exports = {
  findShortestPath,
  heuristic,
};

