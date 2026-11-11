/**
 * Builds the Bishop Jerome Institute Main Block navigation graph (GF–7F) from
 * positions traced on the 1:100 architectural plans stored under `floorplan/`.
 *
 * Coordinate frame (`PLAN_FRAME.id`):
 *   - x/y are metres in one building-wide frame shared by all eight floors
 *     (+x = right on the upright plan sheet, +y = up on the upright sheet).
 *   - Every floor drawing was registered to that frame by translation only
 *     (tools/build_floorplan_assets.py records the per-sheet offsets), so a
 *     lift or staircase has the same x/y on every floor.
 *   - z = floor × 3.9 m (Section A-A / B-B floor-to-floor height 390 cm).
 *
 * Edge distances are the lengths of the walkable polylines stored in
 * `edge.geometry.points` and are therefore plan-derived (`architectural_plan`
 * evidence, `candidate` geometry). They are not a site survey.
 */
const fs = require('fs');
const path = require('path');
const { auditCampusGraph } = require('../utils/campusGraphAudit');

const SEED_DATA_PATH = path.join(__dirname, '../data/seedData.json');

const FLOOR_HEIGHT_M = 3.9;

const PLAN_FRAME = Object.freeze({
  id: 'bji-main-block-plan-1to100-v1',
  units: 'm',
  scale: '1:100 (72 pt = 2.54 m)',
  extent: { minX: 0, minY: 0, maxX: 66, maxY: 42 },
  axes: '+x right / +y up on the upright architectural sheet',
});

const PLAN_SOURCES = Object.freeze({
  0: 'floorplan/BJI_BUILDING PLAN 01 GF MAIN BLOCK_04022026.pdf#page=1 (GROUND FLOOR PLAN)',
  1: 'floorplan/BJI_BUILDING PLAN 0000_1ST FLOOR MAIN BLOCK_04022026.pdf#page=1 (FIRST FLOOR PLAN)',
  2: 'floorplan/BJI_MAIN_BLOCK_2ND_&_3RD_FLOOR_BUILDING_PLAN_00000_04022026.pdf#page=1 (SECOND FLOOR PLAN)',
  3: 'floorplan/BJI_MAIN_BLOCK_2ND_&_3RD_FLOOR_BUILDING_PLAN_00000_04022026.pdf#page=1 (THIRD FLOOR PLAN)',
  4: 'floorplan/BJI_BUILDING_PLAN_0002_4TH_&_5TH_FLOOR_MAIN_BLOCK_04022026.pdf#page=1 (FOURTH FLOOR PLAN)',
  5: 'floorplan/BJI_BUILDING_PLAN_0002_4TH_&_5TH_FLOOR_MAIN_BLOCK_04022026.pdf#page=1 (FIFTH FLOOR PLAN)',
  6: 'floorplan/BJI_BUILDING_PLAN_003_6TH_&_7TH_FLOOR_MAIN_BLOCK_04022026.pdf#page=1 (SIXTH FLOOR PLAN)',
  7: 'floorplan/BJI_BUILDING_PLAN_003_6TH_&_7TH_FLOOR_MAIN_BLOCK_04022026.pdf#page=1 (SEVENTH FLOOR PLAN)',
});

const ORDINALS = { 0: 'Ground', 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th' };
const floorPrefix = (floor) => (floor === 0 ? 'GF' : `${floor}F`);
const floorLabel = (floor) => `${ORDINALS[floor]} Floor`;
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/* ------------------------------------------------------------------------- */
/* Shared plan positions (metres)                                             */
/* ------------------------------------------------------------------------- */

// Centreline of the 2.76 m wide west-wing passage and the central junction.
const SPINE = Object.freeze({
  'LOBBY-WEST': [10.5, 27.9],
  'CORR-W1': [14.2, 26.5],
  'CORR-W2': [19.4, 23.8],
  'CORR-W3': [22.15, 22.6],
  'CORR-W4': [24.95, 21.75],
  'CORR-W5': [28.35, 20.7],
  'CORR-W6': [31.0, 20.1],
  'CORR-LIFT': [36.4, 20.4],
  'CORR-CENTRAL': [40.8, 20.9],
});

const SPINE_NAMES = Object.freeze({
  'LOBBY-WEST': 'West Lobby (Lift 2 & Fire Escape Stair)',
  'CORR-W1': 'West Passage (west end)',
  'CORR-W2': 'West Passage (west-centre)',
  'CORR-W3': 'West Passage (centre)',
  'CORR-W4': 'West Passage (east-centre)',
  'CORR-W5': 'West Passage (side-passage junction)',
  'CORR-W6': 'West Passage (toilet block)',
  'CORR-LIFT': 'Lift 1 Lobby',
  'CORR-CENTRAL': 'Central Passage Junction',
});

// Vertical cores. x/y are identical on every floor the core serves.
const CORES = Object.freeze({
  'STAIR-A': {
    xy: [46.8, 20.75],
    floors: [0, 1, 2, 3, 4, 5],
    type: 'stair',
    name: 'Main Staircase A',
    dimensions: 'Width 246 cm',
    description: 'Main staircase of the east wing (Section A-A: tread 30 cm, riser 15 cm, width 246 cm)',
  },
  'STAIR-B': {
    xy: [6.5, 32.9],
    floors: [0, 1, 2, 3, 4, 5, 6, 7],
    type: 'stair',
    name: 'Fire Escape Staircase B',
    dimensions: 'Width 190 cm',
    description: 'Curved fire escape stair at the north-west end of the west wing (Section B-B: tread 30 cm, riser 15 cm, width 190 cm)',
  },
  'LIFT-1': {
    xy: [36.4, 22.7],
    floors: [0, 1, 2, 3, 4, 5],
    type: 'lift',
    name: 'Lift 1',
    dimensions: '250x190 cm',
    description: 'Central passenger lift (250x190 cm) at the junction of the west and east wings',
  },
  'LIFT-2': {
    xy: [7.35, 28.0],
    floors: [0, 1, 2, 3, 4, 5, 6, 7],
    type: 'lift',
    name: 'Lift 2',
    dimensions: '207x305 cm',
    description: 'West lift (207x305 cm) beside the fire escape stair',
  },
});

// Walking-line length of one storey of stairs: 26 risers of 15 cm in two
// flights of 12 treads (3.6 m run, 1.95 m rise each) plus the mid-landing turn.
const STAIR_FLIGHT_M = Math.hypot(3.6, FLOOR_HEIGHT_M / 2);
const STAIR_STOREY_M = round(2 * STAIR_FLIGHT_M + 2.4, 1);
const LIFT_STOREY_M = FLOOR_HEIGHT_M;

/* ------------------------------------------------------------------------- */
/* Builder                                                                    */
/* ------------------------------------------------------------------------- */

function createBuilder() {
  const nodes = [];
  const edges = [];
  const nodeIndex = new Map();
  const edgeIds = new Set();

  function addNode(floor, suffix, name, type, xy, options = {}) {
    const nodeId = `${floorPrefix(floor)}-${suffix}`;
    if (nodeIndex.has(nodeId)) throw new Error(`Duplicate nodeId ${nodeId}`);
    const metadata = {};
    for (const key of ['roomNumber', 'department', 'capacity', 'description', 'dimensions']) {
      if (options[key] !== undefined) metadata[key] = options[key];
    }
    const node = {
      nodeId,
      name,
      floor,
      type,
      coordinates: { x: round(xy[0]), y: round(xy[1]), z: round(floor * FLOOR_HEIGHT_M, 1) },
      qrCode: `QR_${nodeId.replace(/-/g, '_')}`,
      accessible: options.accessible ?? type !== 'stair',
      building: 'Main Block',
      metadata,
    };
    nodes.push(node);
    nodeIndex.set(nodeId, node);
    return node;
  }

  function polylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return total;
  }

  /** Same-floor walkable edge whose distance is the plan polyline length. */
  function link(floor, fromSuffix, toSuffix, via = [], options = {}) {
    const from = nodeIndex.get(`${floorPrefix(floor)}-${fromSuffix}`);
    const to = nodeIndex.get(`${floorPrefix(floor)}-${toSuffix}`);
    if (!from || !to) throw new Error(`link(${floor}, ${fromSuffix}, ${toSuffix}) references a missing node`);
    const points = [
      { x: from.coordinates.x, y: from.coordinates.y },
      ...via.map(([x, y]) => ({ x: round(x), y: round(y) })),
      { x: to.coordinates.x, y: to.coordinates.y },
    ];
    const distance = round(polylineLength(points), 1);
    if (!(distance > 0)) throw new Error(`Zero-length edge ${fromSuffix} -> ${toSuffix} on floor ${floor}`);
    const edgeId = `E_${floorPrefix(floor)}_${fromSuffix}_${toSuffix}`.replace(/-/g, '');
    if (edgeIds.has(edgeId)) throw new Error(`Duplicate edgeId ${edgeId}`);
    edgeIds.add(edgeId);

    const bothCorridors = from.type === 'corridor' && to.type === 'corridor';
    const kind = options.kind || (bothCorridors ? 'corridor_centerline' : via.length ? 'door_connector' : 'room_entry_connector');
    const type = options.type || 'walking';
    const instruction = options.instruction || (bothCorridors
      ? `Continue along the passage towards ${to.name}`
      : `Walk to ${to.name}`);
    const reverseInstruction = options.reverseInstruction || (bothCorridors
      ? `Continue along the passage towards ${from.name}`
      : `Walk to ${from.name}`);

    edges.push({
      edgeId,
      fromNode: from.nodeId,
      toNode: to.nodeId,
      distance,
      distanceEvidence: {
        source: 'architectural_plan',
        reference: PLAN_SOURCES[floor],
        notes: 'Length of the walkable polyline traced on the 1:100 plan; not field measured.',
      },
      geometry: {
        kind,
        coordinateSystem: 'local_metric_m',
        coordinateFrameId: PLAN_FRAME.id,
        floor,
        sourceRef: PLAN_SOURCES[floor],
        points,
        verification: {
          status: 'candidate',
          notes: 'Traced from the architectural drawing; pending on-site walkthrough.',
        },
      },
      accessible: options.accessible ?? true,
      type,
      instruction,
      reverseInstruction,
      isBidirectional: true,
    });
  }

  /** Stair or lift edge between consecutive floors. */
  function vertical(edgeId, fromNodeId, toNodeId, type, distance, reference, notes) {
    if (!nodeIndex.has(fromNodeId) || !nodeIndex.has(toNodeId)) {
      throw new Error(`vertical(${fromNodeId}, ${toNodeId}) references a missing node`);
    }
    if (edgeIds.has(edgeId)) throw new Error(`Duplicate edgeId ${edgeId}`);
    edgeIds.add(edgeId);
    const from = nodeIndex.get(fromNodeId);
    const to = nodeIndex.get(toNodeId);
    edges.push({
      edgeId,
      fromNode: fromNodeId,
      toNode: toNodeId,
      distance,
      distanceEvidence: { source: 'architectural_plan', reference, notes },
      accessible: type === 'lift',
      type,
      instruction: type === 'lift'
        ? `Take the lift up to the ${floorLabel(to.floor)}`
        : `Climb the stairs up to the ${floorLabel(to.floor)}`,
      reverseInstruction: type === 'lift'
        ? `Take the lift down to the ${floorLabel(from.floor)}`
        : `Descend the stairs to the ${floorLabel(from.floor)}`,
      isBidirectional: true,
    });
  }

  /** Room-like destination reached from `from` through the listed door points. */
  function place(floor, suffix, name, type, xy, from, via, options = {}) {
    addNode(floor, suffix, name, type, xy, options);
    const entries = Array.isArray(from) ? from : [[from, via]];
    entries.forEach(([fromSuffix, doorPoints], index) => {
      link(floor, fromSuffix, suffix, doorPoints || [], {
        instruction: index === 0 ? `Enter ${name}` : `Enter ${name} through the other door`,
        reverseInstruction: `Leave ${name}`,
        ...(options.edge || {}),
      });
    });
  }

  return { nodes, edges, nodeIndex, addNode, link, place, vertical };
}

/* ------------------------------------------------------------------------- */
/* Floor definitions                                                          */
/* ------------------------------------------------------------------------- */

function addSpine(b, floor, keys) {
  for (const key of keys) {
    b.addNode(floor, key, `${SPINE_NAMES[key]} — ${floorLabel(floor)}`, 'corridor', SPINE[key], {
      dimensions: key.startsWith('CORR-W') ? '2.76 m wide passage' : undefined,
      description: `${SPINE_NAMES[key]} on the ${floorLabel(floor)}`,
    });
  }
  for (let i = 1; i < keys.length; i += 1) b.link(floor, keys[i - 1], keys[i]);
}

function addCores(b, floor, attach) {
  for (const [key, core] of Object.entries(CORES)) {
    if (!core.floors.includes(floor)) continue;
    b.addNode(floor, key, `${core.name} (${floorLabel(floor)})`, core.type, core.xy, {
      dimensions: core.dimensions,
      description: `${core.description} — ${floorLabel(floor)} landing`,
    });
    const [fromSuffix, via] = attach[key];
    b.link(floor, fromSuffix, key, via || [], {
      kind: 'room_entry_connector',
      instruction: `Walk to ${core.name}`,
      reverseInstruction: `Leave ${core.name} towards the passage`,
    });
  }
}

const WEST_CORE_ATTACH = Object.freeze({
  'STAIR-B': ['LOBBY-WEST', [[8.7, 30.25]]],
  'LIFT-2': ['LOBBY-WEST', []],
  'LIFT-1': ['CORR-LIFT', []],
});

const FULL_SPINE = ['LOBBY-WEST', 'CORR-W1', 'CORR-W2', 'CORR-W3', 'CORR-W4', 'CORR-W5', 'CORR-W6', 'CORR-LIFT', 'CORR-CENTRAL'];

function eastCorridor(b, floor, points) {
  const keys = Object.keys(points);
  for (const key of keys) {
    b.addNode(floor, key, `East Passage (${points[key][2]}) — ${floorLabel(floor)}`, 'corridor', points[key], {
      dimensions: '2.73 m wide passage',
      description: `East wing 2.73 m wide passage on the ${floorLabel(floor)}`,
    });
  }
  b.link(floor, 'CORR-CENTRAL', keys[0]);
  for (let i = 1; i < keys.length; i += 1) b.link(floor, keys[i - 1], keys[i]);
}

// Shared west-wing layout of the 2nd–5th floors (rooms differ only by name).
function upperWestWing(b, floor, names) {
  const n = floor * 100;
  b.addNode(floor, 'CORR-SPUR', `Side Passage to Classroom ${n + 2} — ${floorLabel(floor)}`, 'corridor', [26.6, 18.0], {
    description: `Side passage between the light well and the tutorial room on the ${floorLabel(floor)}`,
  });
  b.link(floor, 'CORR-W5', 'CORR-SPUR', [[26.9, 20.4]]);

  if (names.storeRoom) {
    b.place(floor, 'STORE-ROOM-W', `Store Room (${floorLabel(floor)}, West)`, 'room', [5.3, 26.1],
      'LOBBY-WEST', [[10.4, 25.2], [10.15, 24.35], [9.3, 23.7]], {
        dimensions: '240x1044 cm',
        description: 'Store room in the curved west tip of the building',
      });
  }
  b.place(floor, 'WAITING-AREA-W', `${names.hodShort} Waiting Area`, 'room', [15.9, 29.5],
    'CORR-W1', [[13.6, 28.7]], {
      dimensions: '570x355 cm',
      department: names.department,
      description: `Waiting area outside the ${names.hod} room`,
    });
  b.place(floor, names.hodId, names.hod, 'office', [17.4, 34.0],
    'WAITING-AREA-W', [[14.95, 31.5], [15.1, 32.3]], {
      dimensions: '570x837 cm',
      department: names.department,
      description: `${names.hod} (570x837 cm), entered through the waiting area`,
    });
  b.place(floor, `CLASS-${n + 3}`, `Classroom ${n + 3}`, 'room', [25.3, 30.0],
    [['CORR-W2', [[18.75, 25.7]]], ['CORR-W4', [[25.2, 23.1]]]], null, {
      roomNumber: String(n + 3),
      dimensions: '1014x1230 cm',
      description: `${floorLabel(floor)} classroom (1014x1230 cm) north of the west passage`,
    });
  b.place(floor, 'RESTROOM', `Toilets (${floorLabel(floor)})`, 'restroom', [31.5, 23.3],
    'CORR-W6', [[30.6, 21.65]], {
      description: `${floorLabel(floor)} toilet block and accessible toilet (255x186 cm) beside Lift 1`,
    });
  b.place(floor, `CLASS-${n + 1}`, `Classroom ${n + 1}`, 'room', [11.0, 13.5],
    'CORR-W1', [[12.9, 24.9], [11.5, 21.9], [10.1, 20.75]], {
      roomNumber: String(n + 1),
      dimensions: '905x1230 cm',
      description: `${floorLabel(floor)} classroom (905x1230 cm) in the south-west block`,
    });
  b.place(floor, `CLASS-${n + 2}`, `Classroom ${n + 2}`, 'room', [18.5, 9.5],
    'CORR-SPUR', [[25.8, 15.4], [25.4, 14.35], [24.4, 13.2]], {
      roomNumber: String(n + 2),
      dimensions: '850x1265 cm',
      description: `${floorLabel(floor)} classroom (850x1265 cm) in the south block`,
    });
}

function buildGraph() {
  const b = createBuilder();

  /* ============================ GROUND FLOOR ============================ */
  {
    const f = 0;
    addSpine(b, f, FULL_SPINE);
    eastCorridor(b, f, {
      'CORR-E1': [46.8, 21.9, 'main stair'],
      'CORR-E2': [50.25, 21.9, 'Basic Science / Valuation'],
      'CORR-E3': [54.95, 21.9, 'Drawing Hall west door'],
      'CORR-E4': [59.85, 21.9, 'Exam Cell'],
    });
    addCores(b, f, { ...WEST_CORE_ATTACH, 'STAIR-A': ['CORR-E1', []] });

    b.addNode(f, 'CORR-ENTRY', 'Entrance Side Passage — Ground Floor', 'corridor', [38.5, 11.6], {
      description: 'Passage beside the grand entrance steps, reached from the 1:12 entrance ramp',
    });
    b.link(f, 'CORR-CENTRAL', 'CORR-ENTRY', [[38.55, 18.4]]);

    b.addNode(f, 'MAIN-ENTRANCE', 'Main Entrance', 'entrance', [41.5, 2.0], {
      roomNumber: 'GF-00',
      description: 'South forecourt in front of the grand entrance steps and the entrance ramp',
    });
    b.addNode(f, 'RAMP', 'Entrance Ramp (1:12)', 'checkpoint', [38.5, 9.0], {
      description: 'Wheelchair access ramp (1:12) beside the grand entrance steps',
    });
    b.link(f, 'MAIN-ENTRANCE', 'RAMP', [[38.5, 5.2]], {
      type: 'ramp',
      kind: 'door_connector',
      instruction: 'Take the entrance ramp to the left of the grand steps',
      reverseInstruction: 'Go down the ramp to the main entrance forecourt',
    });
    b.link(f, 'RAMP', 'CORR-ENTRY', [], {
      type: 'ramp',
      kind: 'corridor_centerline',
      instruction: 'Continue up the ramp into the entrance side passage',
      reverseInstruction: 'Walk down the entrance ramp',
    });
    b.addNode(f, 'ENTRANCE-STEPS', 'Entrance Steps (Ground Level)', 'stair', [41.5, 5.7], {
      description: 'Foot of the grand entrance steps that rise from the forecourt to the 1st Floor passage',
    });
    b.link(f, 'MAIN-ENTRANCE', 'ENTRANCE-STEPS', [], {
      instruction: 'Walk to the foot of the grand entrance steps',
      reverseInstruction: 'Step off the grand entrance steps onto the forecourt',
    });

    b.place(f, 'PRO', 'Public Relation Office', 'office', [33.6, 10.3], 'CORR-ENTRY', [[37.7, 11.6]], {
      dimensions: '743x775 cm',
      description: 'Public Relation Office (743x775 cm), door on the entrance side passage',
    });
    b.place(f, 'ROOM-G1', 'Room G1', 'room', [34.3, 15.6], 'CORR-W6', [[32.55, 18.35]], {
      dimensions: '622x499 cm',
      description: 'Ground floor room (622x499 cm) south of the west passage',
    });
    b.place(f, 'STUDENTS-CLUB', 'Students Club', 'room', [27.9, 12.8], 'CORR-W6', [[31.2, 18.55]], {
      dimensions: '504x1215 cm',
      description: 'Students Club (504x1215 cm)',
    });
    b.place(f, 'DRAWING-WS', 'Drawing & Workshop Hall', 'lab', [19.5, 14.5],
      [['CORR-W3', [[21.25, 21.4]]], ['CORR-W1', [[13.1, 25.4], [14.5, 20.0], [17.3, 15.8]]]], null, {
        dimensions: '861x1757 cm + 891x1766 cm',
        description: 'Open drawing hall (861x1757 cm) and workshop (891x1766 cm) sharing one column bay',
      });
    b.place(f, 'CAD-LAB', 'CAD Lab', 'lab', [24.0, 29.5],
      [['CORR-W3', [[21.9, 24.3]]], ['CORR-W1', [[14.1, 28.3]]], ['CORR-W5', [[28.45, 22.15]]]], null, {
        dimensions: '1783x1239 cm',
        description: 'CAD Lab (1783x1239 cm) north of the west passage',
      });
    b.place(f, 'RESTROOM', 'Toilets (Ground Floor)', 'restroom', [32.3, 23.4], 'CORR-W6', [[30.3, 21.75]], {
      description: 'Ground floor toilet block beside Lift 1',
    });
    b.place(f, 'TOILET-DISABLED', 'Accessible WC (Ground Floor)', 'restroom', [34.2, 22.4], 'RESTROOM', [[33.4, 23.2]], {
      dimensions: '150x250 cm',
      description: 'Accessible toilet (150x250 cm) inside the ground floor toilet block',
    });
    b.place(f, 'BASIC-SCIENCE', 'Basic Science', 'lab', [46.9, 27.6], 'CORR-E2', [[49.2, 23.4]], {
      dimensions: '1783x1239 cm',
      description: 'Basic Science room on the north side of the east passage',
    });
    b.place(f, 'VALUATION-RM', 'Valuation Control Room', 'room', [54.5, 27.6], 'CORR-E2', [[51.3, 23.4]], {
      dimensions: '1783x1239 cm',
      description: 'Valuation Control Room on the north side of the east passage',
    });
    b.place(f, 'EXAM-CELL', 'Exam Cell', 'office', [61.9, 27.6], 'CORR-E4', [[59.7, 23.4]], {
      dimensions: '1783x1239 cm',
      description: 'Exam Cell at the east end of the east passage',
    });
    b.place(f, 'DRAWING-HALL', 'Drawing Hall', 'hall', [57.2, 13.8],
      [['CORR-E3', [[54.95, 20.4]]], ['CORR-E4', [[60.0, 20.4]]]], null, {
        dimensions: '1476x1309 cm',
        description: 'Drawing Hall (1476x1309 cm) on the south side of the east passage',
      });
  }

  /* ============================= 1ST FLOOR ============================== */
  {
    const f = 1;
    addSpine(b, f, FULL_SPINE);
    eastCorridor(b, f, {
      'CORR-E1': [46.8, 21.9, 'main stair'],
      'CORR-E3': [55.5, 21.9, "Principal's Room"],
      'CORR-E4': [59.55, 21.9, 'Conference Hall'],
    });
    addCores(b, f, { ...WEST_CORE_ATTACH, 'STAIR-A': ['CORR-E1', []] });

    b.addNode(f, 'ENTRANCE-STEPS', 'Entrance Steps (1st Floor Landing)', 'stair', [41.5, 16.5], {
      description: 'Top landing of the grand entrance steps on the 1st Floor passage',
    });
    b.link(f, 'CORR-CENTRAL', 'ENTRANCE-STEPS', [], {
      instruction: 'Walk to the top of the grand entrance steps',
      reverseInstruction: 'Walk from the grand entrance steps into the central passage',
    });
    b.addNode(f, 'CORR-SPUR', 'Side Passage to Class 03 & KTU Exam Cell — 1st Floor', 'corridor', [26.3, 18.0], {
      description: 'Side passage south of the west passage leading to Class 03 and the KTU Exam Cell',
    });
    b.link(f, 'CORR-W5', 'CORR-SPUR', [[26.6, 20.5]]);
    b.addNode(f, 'CORR-NORTH', 'North Passage to Office — 1st Floor', 'corridor', [41.0, 27.5], {
      description: 'Passage north of the central junction leading to the Office',
    });
    b.link(f, 'CORR-CENTRAL', 'CORR-NORTH');

    b.place(f, 'FACULTY-ROOM', 'Faculty Room', 'room', [5.2, 26.3],
      'LOBBY-WEST', [[10.4, 25.2], [10.15, 24.35], [9.3, 23.7]], {
        dimensions: '240x1044 cm',
        description: 'Faculty Room (240x1044 cm) in the curved west tip of the building',
      });
    b.place(f, 'WAITING-LOBBY', 'HOD Waiting Lobby', 'room', [15.6, 31.0], 'CORR-W1', [[13.9, 28.55]], {
      dimensions: '280x599 cm',
      description: 'Waiting Lobby (280x599 cm) serving the HOD Room and HOD Office',
    });
    b.place(f, 'HOD-OFFICE', 'HOD Office', 'office', [17.4, 28.2], 'WAITING-LOBBY', [[15.5, 29.0], [16.0, 28.5]], {
      dimensions: '276x288 cm',
      description: 'HOD Office (276x288 cm), entered from the waiting lobby',
    });
    b.place(f, 'HOD-ROOM', 'HOD Room', 'office', [18.0, 36.0], 'WAITING-LOBBY', [[16.2, 33.7]], {
      dimensions: '400x600 cm',
      description: 'HOD Room (400x600 cm), entered from the waiting lobby',
    });
    b.place(f, 'STAFF-ROOM', 'Staff Room', 'room', [22.5, 30.0], 'CORR-W2', [[19.9, 25.2]], {
      dimensions: '616x1235 cm',
      description: 'Staff Room (616x1235 cm) north of the west passage',
    });
    b.place(f, 'SR-PROF-1', 'Senior Professor 1', 'office', [25.9, 24.6], 'STAFF-ROOM', [[24.8, 26.7], [25.6, 26.0]], {
      dimensions: '295x350 cm',
      description: 'Senior Professor 1 cabin (295x350 cm), entered from the Staff Room',
    });
    b.place(f, 'SR-PROF-2', 'Senior Professor 2', 'office', [27.2, 28.0], 'STAFF-ROOM', [[26.2, 29.6]], {
      dimensions: '295x300 cm',
      description: 'Senior Professor 2 cabin (295x300 cm), entered from the Staff Room',
    });
    b.place(f, 'DEPT-LIBRARY', 'Department Library', 'library', [30.8, 31.3],
      'CORR-W5', [[28.45, 22.15], [29.4, 23.6], [30.4, 24.9], [30.6, 27.5]], {
        dimensions: '585x531 cm',
        description: 'Department Library (585x531 cm), reached through the lobby beside the toilet block',
      });
    b.place(f, 'RESTROOM', 'Toilets (1st Floor)', 'restroom', [32.3, 23.4], 'CORR-W6', [[30.3, 21.75]], {
      description: '1st floor toilet block beside Lift 1',
    });
    b.place(f, 'CLASS-02', 'Class 02', 'room', [11.3, 14.3],
      'CORR-W1', [[12.8, 25.0], [11.3, 21.7], [10.05, 20.6]], {
        roomNumber: '02',
        dimensions: '876x1203 cm',
        description: 'Class 02 (876x1203 cm) in the south-west block',
      });
    b.place(f, 'CLASS-03', 'Class 03', 'room', [19.3, 10.5],
      'CORR-SPUR', [[25.6, 15.6], [25.15, 14.2], [24.5, 13.1]], {
        roomNumber: '03',
        dimensions: '876x1203 cm',
        description: 'Class 03 (876x1203 cm) in the south block',
      });
    b.place(f, 'KTU-EXAM-CELL', 'KTU Exam Cell', 'office', [31.5, 12.8],
      'CORR-SPUR', [[27.7, 17.4], [28.7, 16.6]], {
        dimensions: '1206x1223 cm',
        description: 'KTU Exam Cell (1206x1223 cm)',
      });
    b.place(f, 'OFFICE', 'Office', 'office', [49.5, 29.4], 'CORR-NORTH', [[42.6, 31.35], [43.9, 31.35]], {
      dimensions: '1144x576 cm',
      description: 'Office (1144x576 cm) on the north side of the east wing',
    });
    b.place(f, 'RECORDS', 'Records', 'room', [60.0, 27.8], 'OFFICE', [[55.0, 28.25], [55.65, 28.25]], {
      dimensions: '884x877 cm',
      description: 'Records room (884x877 cm), entered from the Office',
    });
    b.place(f, 'PRINCIPAL-RM', "Principal's Room", 'office', [52.7, 14.5], 'CORR-E3', [[54.75, 20.4]], {
      dimensions: '576x1044 cm',
      description: "Principal's Room (576x1044 cm) on the south side of the east passage",
    });
    b.place(f, 'PA-OFFICE', 'P.A. Office', 'office', [57.2, 18.9], 'CORR-E3', [[56.3, 20.4]], {
      dimensions: '276x276 cm',
      description: "P.A. office (276x276 cm) beside the Principal's Room",
    });
    b.place(f, 'CONF-HALL', 'Conference Hall', 'hall', [61.8, 16.0], 'CORR-E4', [[59.55, 20.4]], {
      dimensions: '587x878 cm',
      description: 'Conference Hall (587x878 cm) on the south side of the east passage',
    });
  }

  /* ============================= 2ND FLOOR ============================== */
  {
    const f = 2;
    addSpine(b, f, FULL_SPINE);
    eastCorridor(b, f, {
      'CORR-E1': [46.0, 21.9, 'main stair'],
      'CORR-E2': [51.1, 21.9, 'Classroom 204'],
      'CORR-E3': [55.9, 21.9, 'Faculty Room'],
      'CORR-E4': [60.0, 21.9, 'Corporate Relation Cell'],
      'CORR-E5': [62.3, 21.9, 'System Room'],
    });
    addCores(b, f, { ...WEST_CORE_ATTACH, 'STAIR-A': ['CORR-E1', []] });
    upperWestWing(b, f, {
      storeRoom: true,
      hodId: 'HOD-MECH',
      hod: 'Head of Mechanical Department',
      hodShort: 'Mechanical HOD',
      department: 'Mechanical Engineering',
    });
    b.place(f, 'TUTORIAL-201', 'Tutorial Room 201', 'room', [31.4, 12.0], 'CORR-LIFT', [[36.5, 18.0], [35.6, 16.6]], {
      dimensions: '1106x990 cm',
      description: '2nd floor Tutorial Room (1106x990 cm)',
    });
    b.place(f, 'OFFICE-ROOM', 'Office Room', 'office', [46.8, 28.0], 'CORR-E1', [[45.1, 23.3]], {
      dimensions: '580x876 cm',
      description: 'Office Room (580x876 cm) on the north side of the east passage',
    });
    b.place(f, 'CLASS-204', 'Classroom 204', 'room', [52.9, 28.0], 'CORR-E2', [[51.1, 23.3]], {
      roomNumber: '204',
      dimensions: '585x876 cm',
      description: '2nd floor classroom (585x876 cm) on the north side of the east passage',
    });
    b.place(f, 'FACULTY-ROOM', 'Faculty Room (2nd Floor)', 'room', [58.7, 28.0], 'CORR-E3', [[57.0, 23.3]], {
      dimensions: '545x876 cm',
      description: 'Faculty Room (545x876 cm) on the north side of the east passage',
    });
    b.place(f, 'SYSTEM-ROOM', 'System Room (2nd Floor)', 'lab', [63.0, 25.8], 'CORR-E5', [[62.3, 23.3]], {
      dimensions: '300x594 cm',
      description: 'System Room (300x594 cm) at the east end of the east passage',
    });
    b.place(f, 'WAITING-AREA-E', 'Conference Waiting Area', 'room', [52.3, 18.8], 'CORR-E3', [[54.9, 20.4]], {
      dimensions: '590x295 cm',
      description: 'Waiting Area (590x295 cm) in front of the Conference Hall',
    });
    b.place(f, 'CONF-HALL', 'Conference Hall (2nd Floor)', 'hall', [52.7, 12.3], 'WAITING-AREA-E', [[55.0, 17.7], [55.0, 16.5]], {
      dimensions: '590x992 cm',
      description: 'Conference Hall (590x992 cm), entered through the waiting area',
    });
    b.place(f, 'CORP-RELATION', 'Corporate Relation Cell', 'office', [62.2, 18.8], 'CORR-E4', [[60.0, 20.4], [60.0, 19.2]], {
      dimensions: '565x292 cm',
      description: 'Corporate Relation Cell (565x292 cm)',
    });
    b.place(f, 'OFFICE-E', 'Office (2nd Floor, East)', 'office', [62.0, 14.0], 'CORP-RELATION', [[59.7, 18.6], [59.7, 16.6]], {
      dimensions: '565x583 cm',
      description: 'Office (565x583 cm) behind the Corporate Relation Cell',
    });
  }

  /* ============================= 3RD FLOOR ============================== */
  {
    const f = 3;
    addSpine(b, f, FULL_SPINE);
    eastCorridor(b, f, {
      'CORR-E1': [46.0, 21.9, 'main stair'],
      'CORR-E2': [50.6, 21.9, 'Store Room'],
      'CORR-E3': [56.2, 21.9, 'Civil Software Lab'],
      'CORR-E4': [60.0, 21.9, 'CCF'],
      'CORR-E5': [62.3, 21.9, 'System Room'],
    });
    addCores(b, f, { ...WEST_CORE_ATTACH, 'STAIR-A': ['CORR-E1', []] });
    upperWestWing(b, f, {
      storeRoom: false,
      hodId: 'HOD-CIVIL',
      hod: 'Head of Civil Department',
      hodShort: 'Civil HOD',
      department: 'Civil Engineering',
    });
    b.place(f, 'TUTORIAL-301', 'Tutorial Room 301', 'room', [31.4, 12.0], 'CORR-LIFT', [[36.5, 18.0], [35.6, 16.6]], {
      dimensions: '1106x990 cm',
      description: '3rd floor Tutorial Room (1106x990 cm)',
    });
    b.place(f, 'CLASS-304', 'Classroom 304', 'room', [46.8, 28.0], 'CORR-E1', [[44.7, 23.3]], {
      roomNumber: '304',
      dimensions: '580x876 cm',
      description: '3rd floor classroom (580x876 cm) on the north side of the east passage',
    });
    b.place(f, 'STORE-ROOM', 'Store Room (3rd Floor)', 'room', [51.5, 28.0], 'CORR-E2', [[50.6, 23.3]], {
      dimensions: '295x876 cm',
      description: 'Store Room (295x876 cm) on the north side of the east passage',
    });
    b.place(f, 'FACULTY-ROOM-B', 'Faculty Room B (3rd Floor)', 'room', [58.8, 28.0], 'CORR-E3', [[57.0, 23.3]], {
      dimensions: '508x876 cm',
      description: 'Faculty Room (508x876 cm) on the north side of the east passage',
    });
    b.place(f, 'FACULTY-ROOM-A', 'Faculty Room A (3rd Floor)', 'room', [54.6, 28.0], 'FACULTY-ROOM-B', [[57.0, 24.3], [56.2, 23.95], [55.3, 24.3]], {
      dimensions: '307x876 cm',
      description: 'Faculty Room (307x876 cm), entered through Faculty Room B',
    });
    b.place(f, 'SYSTEM-ROOM', 'System Room (3rd Floor)', 'lab', [63.0, 25.8], 'CORR-E5', [[62.3, 23.3]], {
      dimensions: '300x594 cm',
      description: 'System Room (300x594 cm) at the east end of the east passage',
    });
    b.place(f, 'CIVIL-SW-LAB', 'Civil Software Lab', 'lab', [52.5, 11.5], 'CORR-E3', [[55.4, 20.4], [55.0, 17.5], [54.9, 14.3]], {
      dimensions: '891x1308 cm',
      description: 'Civil Software Lab (891x1308 cm) on the south side of the east passage',
    });
    b.place(f, 'CCF', 'CCF', 'lab', [61.9, 12.4], 'CORR-E4', [[60.0, 20.4], [59.9, 18.9], [59.8, 17.7]], {
      dimensions: '565x1036 cm',
      description: 'CCF (565x1036 cm), entered through the 319x240 cm passage off the east passage',
    });
  }

  /* ============================= 4TH FLOOR ============================== */
  {
    const f = 4;
    addSpine(b, f, FULL_SPINE);
    eastCorridor(b, f, {
      'CORR-E1': [46.0, 21.9, 'main stair'],
      'CORR-E3': [55.2, 21.9, 'Tutorial Room 4B'],
      'CORR-E4': [60.0, 21.9, 'Classroom 404'],
      'CORR-E5': [62.3, 21.9, 'Sick Room'],
    });
    addCores(b, f, { ...WEST_CORE_ATTACH, 'STAIR-A': ['CORR-E1', []] });
    upperWestWing(b, f, {
      storeRoom: true,
      hodId: 'HOD-CS',
      hod: 'Head of CS Department',
      hodShort: 'CS HOD',
      department: 'Computer Science & Engineering',
    });
    b.place(f, 'TUTORIAL-4A', 'Tutorial Room 4A', 'room', [31.4, 12.0], 'CORR-LIFT', [[36.5, 18.0], [35.6, 16.6]], {
      dimensions: '1106x990 cm',
      description: '4th floor Tutorial Room (1106x990 cm)',
    });
    b.place(f, 'TUTORIAL-4C', 'Tutorial Room 4C', 'room', [45.4, 28.0], 'CORR-E1', [[44.7, 23.3]], {
      dimensions: '296x876 cm',
      description: 'Tutorial Room (296x876 cm) on the north side of the east passage',
    });
    b.place(f, 'DRAWING-HALL', 'Drawing Hall (4th Floor)', 'hall', [51.5, 28.0],
      [['CORR-E1', [[48.05, 23.3]]], ['CORR-E3', [[54.2, 23.3]]]], null, {
        dimensions: '877x876 cm',
        description: 'Drawing Hall (877x876 cm) on the north side of the east passage',
      });
    b.place(f, 'FACULTY-RM', 'Faculty Room (4th Floor)', 'room', [58.8, 28.0], 'CORR-E3', [[56.6, 23.3]], {
      dimensions: '508x876 cm',
      description: 'Faculty Room (508x876 cm) on the north side of the east passage',
    });
    b.place(f, 'SICK-ROOM', 'Sick Room', 'room', [63.0, 25.8], 'CORR-E5', [[62.3, 23.3]], {
      dimensions: '300x594 cm',
      description: 'Sick Room (300x594 cm) at the east end of the east passage',
    });
    b.place(f, 'TUTORIAL-4B', 'Tutorial Room 4B', 'room', [52.7, 12.5], 'CORR-E3', [[55.0, 20.4]], {
      dimensions: '588x1308 cm',
      description: 'Tutorial Room (588x1308 cm) on the south side of the east passage',
    });
    b.place(f, 'CLASS-404', 'Classroom 404', 'room', [61.9, 12.5], 'CORR-E4', [[60.0, 20.4]], {
      roomNumber: '404',
      dimensions: '565x1036 cm',
      description: '4th floor classroom (565x1036 cm) on the south side of the east passage',
    });
  }

  /* ============================= 5TH FLOOR ============================== */
  {
    const f = 5;
    addSpine(b, f, FULL_SPINE.slice(0, -1));
    b.addNode(f, 'CORR-CENTRAL', `${SPINE_NAMES['CORR-CENTRAL']} — ${floorLabel(f)}`, 'corridor', SPINE['CORR-CENTRAL'], {
      description: 'Junction lobby between the west wing and the 5th floor open terrace',
    });
    b.link(f, 'CORR-LIFT', 'CORR-CENTRAL', [[37.2, 19.0], [37.8, 18.9], [38.6, 19.1]], {
      kind: 'door_connector',
      instruction: 'Go through door D1 into the junction lobby',
      reverseInstruction: 'Go through door D1 into the west passage',
    });
    b.addNode(f, 'CORR-TERRACE', 'Terrace Access Lobby — 5th Floor', 'corridor', [42.4, 24.6], {
      description: 'Lobby north of the junction that opens onto the 5th floor terrace and the main stair head room',
    });
    b.link(f, 'CORR-CENTRAL', 'CORR-TERRACE');
    addCores(b, f, {
      ...WEST_CORE_ATTACH,
      'STAIR-A': ['CORR-TERRACE', [[44.45, 24.5], [44.45, 23.75], [44.9, 22.3]]],
    });
    upperWestWing(b, f, {
      storeRoom: false,
      hodId: 'HOD-EEE',
      hod: 'Head of Electrical & Electronics Department',
      hodShort: 'EEE HOD',
      department: 'Electrical & Electronics Engineering',
    });
    b.place(f, 'TUTORIAL-501', 'Tutorial Room 501', 'room', [30.6, 13.5], 'CORR-W5', [[29.8, 18.85]], {
      dimensions: '1106x990 cm',
      description: '5th floor Tutorial Room (1106x990 cm) with open terraces on two sides',
    });
    b.place(f, 'OPEN-TERRACE', '5th Floor Open Terrace', 'hall', [54.5, 27.5], 'CORR-TERRACE', [[44.5, 25.6]], {
      dimensions: 'Open Terrace',
      description: 'Open terrace over the east wing, level with the 5th floor',
    });
  }

  /* ============================= 6TH FLOOR ============================== */
  {
    const f = 6;
    const keys = ['LOBBY-WEST', 'CORR-W1', 'CORR-W2', 'CORR-W3', 'CORR-W4', 'CORR-W5'];
    for (const key of keys) {
      const name = key === 'LOBBY-WEST' ? SPINE_NAMES[key] : `Seminar Foyer (${SPINE_NAMES[key].replace('West Passage ', '').replace(/[()]/g, '')})`;
      b.addNode(f, key, `${name} — ${floorLabel(f)}`, 'corridor', SPINE[key], {
        description: 'Column foyer between the 6th floor rooms and the Seminar Hall',
      });
    }
    for (let i = 1; i < keys.length; i += 1) b.link(f, keys[i - 1], keys[i]);
    b.addNode(f, 'CORR-SPUR', 'Side Passage to Seminar Hall East Door — 6th Floor', 'corridor', [26.6, 18.0], {
      description: 'Side passage beside the light well leading to the east door of the Seminar Hall',
    });
    b.link(f, 'CORR-W5', 'CORR-SPUR', [[26.9, 20.4]]);
    addCores(b, f, WEST_CORE_ATTACH);

    b.place(f, 'RESTROOM', 'Toilets (6th Floor)', 'restroom', [16.3, 32.2], 'CORR-W1', [[14.5, 30.0], [14.7, 31.3]], {
      dimensions: '5x 155x135 cm + 260x142 cm',
      description: '6th floor wash and toilet block serving the Seminar Hall',
    });
    b.place(f, 'CLASS-601', 'Classroom 601', 'room', [21.9, 33.0], 'CORR-W3', [[22.35, 28.05], [22.3, 29.0]], {
      roomNumber: '601',
      dimensions: '659x877 cm',
      description: '6th floor classroom (659x877 cm)',
    });
    b.place(f, 'TUTORIAL-601', 'Tutorial Room 601', 'room', [28.0, 31.0], 'CORR-W4', [[24.6, 25.5], [23.95, 27.3], [24.7, 28.5]], {
      dimensions: '615x877 cm',
      description: '6th floor Tutorial Room (615x877 cm)',
    });
    b.place(f, 'SEMINAR-HALL', 'Seminar Hall', 'hall', [15.0, 11.5],
      [['CORR-W1', [[12.9, 24.9], [11.5, 21.9], [10.1, 20.75]]], ['CORR-SPUR', [[25.8, 15.4], [25.4, 14.35], [24.4, 13.2]]]], null, {
        dimensions: '1776x1230 cm',
        description: 'Seminar Hall (1776x1230 cm) with doors on the west side and on the east side passage',
      });
    b.place(f, 'SEMINAR-STAGE', 'Seminar Hall Stage', 'hall', [17.8, 18.5], 'SEMINAR-HALL', [], {
      dimensions: '905x1230 cm',
      description: 'Stage (905x1230 cm) at the north end of the Seminar Hall',
      edge: { instruction: 'Walk up the hall to the stage', reverseInstruction: 'Walk from the stage into the Seminar Hall' },
    });
    b.place(f, 'OPEN-TERRACE', '6th Floor Open Terrace', 'hall', [31.5, 13.0], 'CORR-W5', [[28.9, 20.35], [29.8, 19.3]], {
      dimensions: 'Open Terrace',
      description: 'Open terrace east of the Seminar Hall, reached through door D1 at the end of the foyer',
    });
  }

  /* ============================= 7TH FLOOR ============================== */
  {
    const f = 7;
    b.addNode(f, 'LOBBY-WEST', `${SPINE_NAMES['LOBBY-WEST']} — ${floorLabel(f)}`, 'corridor', SPINE['LOBBY-WEST'], {
      description: 'Roof-level landing outside Lift 2 and the fire escape stair',
    });
    addCores(b, f, WEST_CORE_ATTACH);
    b.place(f, 'OPEN-TERRACE', '7th Floor Open Terrace', 'hall', [22.0, 27.5], 'LOBBY-WEST', [], {
      dimensions: 'Open Terrace',
      description: 'Roof terrace over the 6th floor rooms and foyer',
    });
  }

  /* ========================= VERTICAL TRANSITIONS ======================= */
  for (const [key, core] of Object.entries(CORES)) {
    const isLift = core.type === 'lift';
    for (let i = 1; i < core.floors.length; i += 1) {
      const lower = core.floors[i - 1];
      const upper = core.floors[i];
      b.vertical(
        `E_INTER_${key.replace('-', '_')}_${floorPrefix(lower)}_${floorPrefix(upper)}`,
        `${floorPrefix(lower)}-${key}`,
        `${floorPrefix(upper)}-${key}`,
        isLift ? 'lift' : 'stairs',
        isLift ? LIFT_STOREY_M : STAIR_STOREY_M,
        'Section A-A / Section B-B on floorplan/BJI_BUILDING PLAN 0000_1ST FLOOR MAIN BLOCK_04022026.pdf',
        isLift
          ? 'Floor-to-floor height 390 cm.'
          : 'Walking line of one storey: two flights of 12 treads (30 cm) and 13 risers (15 cm) plus the mid-landing turn.'
      );
    }
  }
  // The grand entrance steps rise one storey from the forecourt to the 1st floor passage.
  b.vertical(
    'E_INTER_ENTRANCE_STEPS_GF_1F',
    'GF-ENTRANCE-STEPS',
    '1F-ENTRANCE-STEPS',
    'stairs',
    round(Math.hypot(16.5 - 5.7, FLOOR_HEIGHT_M), 1),
    `${PLAN_SOURCES[0]} and ${PLAN_SOURCES[1]}`,
    'Plan run of the grand entrance steps (10.8 m) combined with the 390 cm storey height.'
  );

  return { nodes: b.nodes, edges: b.edges };
}

/* ------------------------------------------------------------------------- */
/* Faculty and timetable demo data                                            */
/* ------------------------------------------------------------------------- */

function buildFacultyAndTimetables() {
  const teachers = [
    {
      teacherId: 'TCH-001',
      name: 'Dr. Priya Nair',
      email: 'priya.nair@bji.ac.in',
      department: 'Computer Science & Engineering',
      designation: 'Professor & Head of Department',
      cabinNodeId: '4F-HOD-CS',
      phone: '+91 94471 23456',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      subjects: ['Advanced Algorithms', 'Graph Theory', 'Artificial Intelligence'],
    },
    {
      teacherId: 'TCH-002',
      name: 'Prof. George Mathew',
      email: 'george.mathew@bji.ac.in',
      department: 'Computer Science & Engineering',
      designation: 'Associate Professor',
      cabinNodeId: '4F-FACULTY-RM',
      phone: '+91 94472 34567',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      subjects: ['Database Management Systems', 'Full Stack Web Development', 'Cloud Architecture'],
    },
    {
      teacherId: 'TCH-003',
      name: 'Dr. Ananya Sharma',
      email: 'ananya.sharma@bji.ac.in',
      department: 'Civil & Architecture',
      designation: 'Senior Professor',
      cabinNodeId: '1F-SR-PROF-1',
      phone: '+91 94473 45678',
      avatar: 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?w=150&auto=format&fit=crop&q=80',
      subjects: ['Structural Engineering', 'Building Information Modeling (BIM)'],
    },
    {
      teacherId: 'TCH-004',
      name: 'Prof. Rahul Varma',
      email: 'rahul.varma@bji.ac.in',
      department: 'Mechanical & Design',
      designation: 'Assistant Professor',
      cabinNodeId: '1F-STAFF-ROOM',
      phone: '+91 94474 56789',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      subjects: ['CAD & 3D Modeling', 'Machine Drawing', 'Robotics'],
    },
    {
      teacherId: 'TCH-005',
      name: 'Dr. Rajesh Kumar',
      email: 'rajesh.kumar@bji.ac.in',
      department: 'Electrical & Electronics Engineering',
      designation: 'Professor & Head of EEE',
      cabinNodeId: '5F-HOD-EEE',
      phone: '+91 94475 67890',
      avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=80',
      subjects: ['Power Systems Engineering', 'Control Systems', 'Renewable Energy Grids'],
    },
    {
      teacherId: 'TCH-006',
      name: 'Ar. Thomas Varghese',
      email: 'thomas.varghese@bji.ac.in',
      department: 'Architecture & Civil',
      designation: 'Associate Professor (B.Arch)',
      cabinNodeId: '3F-FACULTY-ROOM-B',
      phone: '+91 94476 78901',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
      subjects: ['Architectural Design Studio', 'Urban Planning', 'Sustainable Structures'],
    },
  ];

  const slot = (teacherId, dayOfWeek, startTime, endTime, roomNodeId, subject, courseCode, semester) => ({
    teacherId, dayOfWeek, startTime, endTime, roomNodeId, subject, courseCode, semester,
  });
  const timetables = [
    slot('TCH-001', 'Monday', '09:00', '10:30', '1F-CLASS-02', 'Advanced Graph Algorithms & Data Structures', 'CST301', 'S5 CSE'),
    slot('TCH-001', 'Monday', '11:00', '12:30', '1F-CLASS-03', 'Artificial Intelligence & Expert Systems', 'CST401', 'S7 CSE'),
    slot('TCH-001', 'Tuesday', '10:00', '11:30', '1F-CLASS-02', 'Advanced Graph Algorithms & Data Structures', 'CST301', 'S5 CSE'),
    slot('TCH-001', 'Wednesday', '14:00', '16:00', 'GF-CAD-LAB', 'AI & Vision Systems Lab', 'CSL411', 'S7 CSE'),
    slot('TCH-001', 'Thursday', '09:30', '11:00', '1F-CLASS-02', 'Research Methodology & Department Seminar', 'CSD333', 'S5 CSE'),
    slot('TCH-001', 'Friday', '10:30', '12:00', '1F-CLASS-03', 'Machine Learning Foundations', 'CST305', 'S5 CSE'),
    slot('TCH-001', 'Saturday', '10:00', '12:00', '1F-CONF-HALL', 'KTU Academic Council Meeting', 'ACM101', 'Faculty'),
    slot('TCH-002', 'Monday', '10:00', '11:30', '1F-CLASS-03', 'Database Management Systems', 'CST202', 'S3 CSE'),
    slot('TCH-002', 'Monday', '13:30', '16:00', 'GF-CAD-LAB', 'Full Stack Web Development Lab', 'CSL331', 'S5 CSE'),
    slot('TCH-002', 'Wednesday', '09:00', '10:30', '1F-CLASS-02', 'Cloud Computing Architecture', 'CST412', 'S7 CSE'),
    slot('TCH-002', 'Friday', '14:00', '15:30', '1F-CLASS-02', 'Database Query Optimization', 'CST202', 'S3 CSE'),
    slot('TCH-003', 'Monday', '09:30', '11:00', 'GF-DRAWING-HALL', 'Architectural Structural Drafting', 'CET203', 'S3 Civil'),
    slot('TCH-003', 'Wednesday', '11:00', '12:30', '1F-CONF-HALL', 'BIM Design Review', 'ARC402', 'S7 B.Arch'),
    slot('TCH-004', 'Monday', '11:00', '13:00', 'GF-DRAWING-WS', 'Machine Drawing & 3D Modeling Workshop', 'MET204', 'S3 Mech'),
    slot('TCH-004', 'Tuesday', '14:00', '16:30', 'GF-CAD-LAB', 'AutoCAD & SolidWorks Lab', 'MEL202', 'S3 Mech'),
    slot('TCH-005', 'Monday', '09:00', '10:30', '5F-CLASS-501', 'Power Systems Analysis', 'EET301', 'S5 EEE'),
    slot('TCH-005', 'Wednesday', '11:00', '12:30', '5F-CLASS-503', 'Smart Grids & High Voltage Engineering', 'EET401', 'S7 EEE'),
    slot('TCH-005', 'Friday', '14:00', '16:00', '6F-SEMINAR-HALL', 'IEEE Technical Colloquium & Seminar', 'EES499', 'All Branches'),
    slot('TCH-006', 'Tuesday', '09:30', '12:30', '3F-CLASS-303', 'Architectural Design Studio IV', 'ARC301', 'S5 B.Arch'),
    slot('TCH-006', 'Thursday', '13:30', '15:30', '4F-DRAWING-HALL', 'Structural Working Drawings', 'ARC405', 'S7 B.Arch'),
    slot('TCH-006', 'Saturday', '10:00', '12:00', '2F-CONF-HALL', 'B.Arch Thesis Design Jury', 'ARC490', 'S9 B.Arch'),
  ];
  return { teachers, timetables };
}

/* ------------------------------------------------------------------------- */
/* Assembly and validation                                                    */
/* ------------------------------------------------------------------------- */

function buildCampusSeedData() {
  const { nodes, edges } = buildGraph();
  const { teachers, timetables } = buildFacultyAndTimetables();
  const data = { nodes, edges, teachers, timetables };

  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  for (const node of nodes) {
    const { x, y } = node.coordinates;
    const { minX, minY, maxX, maxY } = PLAN_FRAME.extent;
    if (x < minX || x > maxX || y < minY || y > maxY) {
      throw new Error(`Node ${node.nodeId} lies outside the plan frame: (${x}, ${y})`);
    }
  }
  for (const teacher of teachers) {
    if (!nodeIds.has(teacher.cabinNodeId)) throw new Error(`Teacher ${teacher.teacherId} references missing cabin ${teacher.cabinNodeId}`);
  }
  for (const entry of timetables) {
    if (!nodeIds.has(entry.roomNodeId)) throw new Error(`Timetable entry references missing room ${entry.roomNodeId}`);
  }

  // Every vertical core must be continuous over the floors it serves.
  for (const [key, core] of Object.entries(CORES)) {
    for (let i = 1; i < core.floors.length; i += 1) {
      const u = `${floorPrefix(core.floors[i - 1])}-${key}`;
      const v = `${floorPrefix(core.floors[i])}-${key}`;
      if (!edges.some((edge) => edge.fromNode === u && edge.toNode === v)) {
        throw new Error(`Broken vertical transit link between ${u} and ${v}`);
      }
    }
  }

  const audit = auditCampusGraph(data);
  if (!audit.valid) {
    throw new Error(`Generated campus graph failed validation: ${JSON.stringify(audit.errors)}`);
  }
  if (audit.summary.connectedComponents !== 1) {
    throw new Error(`Generated campus graph is disconnected (${audit.summary.connectedComponents} components).`);
  }
  const badGeometry = audit.warnings.filter((warning) => warning.code === 'INVALID_EDGE_GEOMETRY');
  if (badGeometry.length) {
    throw new Error(`Generated edge geometry failed validation: ${JSON.stringify(badGeometry)}`);
  }
  return data;
}

function syncSeedDataFile() {
  const data = buildCampusSeedData();
  fs.writeFileSync(SEED_DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return data;
}

if (require.main === module) {
  const result = syncSeedDataFile();
  console.log(
    `Generated seedData.json: ${result.nodes.length} nodes, ${result.edges.length} edges across Floors 0–7.`
  );
}

module.exports = {
  syncSeedDataFile,
  buildCampusSeedData,
  PLAN_FRAME,
  PLAN_SOURCES,
  FLOOR_HEIGHT_M,
  CORES,
};
