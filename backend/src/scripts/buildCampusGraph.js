const fs = require('fs');
const path = require('path');

const SEED_DATA_PATH = path.join(__dirname, '../data/seedData.json');

const ORDINALS = {
  0: 'Ground',
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
  5: '5th',
  6: '6th',
  7: '7th',
};

function makeNode(floor, suffix, name, type, x, y, accessible, metadata = {}) {
  const prefix = floor === 0 ? 'GF' : `${floor}F`;
  const nodeId = `${prefix}-${suffix}`;
  const qrCode = `QR_${nodeId.replace(/-/g, '_')}`;
  const z = Math.round(floor * 3.9 * 10) / 10;

  return {
    nodeId,
    name,
    floor,
    type,
    coordinates: { x, y, z },
    qrCode,
    accessible,
    building: 'Main Block',
    metadata,
  };
}

function makeEdge(
  edgeId,
  fromNode,
  toNode,
  distance,
  accessible,
  type,
  instruction,
  reverseInstruction
) {
  return {
    edgeId,
    fromNode,
    toNode,
    distance,
    accessible,
    type,
    instruction,
    reverseInstruction,
    isBidirectional: true,
  };
}

/**
 * Generates vertical transit cores (Stair A, Stair B, Lift 1, Lift 2)
 * and main corridor junctions for floors 2 through 7, matching Section A-A & Section B-B.
 */
function buildFloorCoreAndCorridors(floor, includeWestCorridor = true) {
  const ord = ORDINALS[floor];
  const p = `${floor}F`;

  const nodes = [
    makeNode(floor, 'STAIR-A', `Main Staircase A (${ord} Floor Landing)`, 'stair', 42, 55, false, {
      dimensions: 'Width 246 cm',
      description: `${ord} Floor landing for Section A-A Main Staircase (Riser 15cm, Tread 30cm)`,
    }),
    makeNode(
      floor,
      'STAIR-B',
      `Fire Escape Staircase B (${ord} Floor Landing)`,
      'stair',
      90,
      52,
      false,
      {
        dimensions: 'Width 190 cm',
        description: `${ord} Floor curved East Fire Escape Staircase (Section B-B)`,
      }
    ),
    makeNode(floor, 'LIFT-1', `Lift 1 (${ord} Floor)`, 'lift', 48, 52, true, {
      dimensions: '250x190 cm',
      capacity: 10,
      description: `Central passenger elevator landing on ${ord} Floor`,
    }),
    makeNode(floor, 'LIFT-2', `Lift 2 (${ord} Floor)`, 'lift', 72, 52, true, {
      dimensions: '207x305 cm',
      capacity: 13,
      description: `East wing service & stretcher elevator landing on ${ord} Floor`,
    }),
    makeNode(
      floor,
      'CORR-CENTRAL',
      `${ord} Floor Central Corridor Junction`,
      'corridor',
      50,
      50,
      true,
      {
        dimensions: '2.76m wide passage',
        description: `${ord} Floor central lobby connecting lifts, main staircase, and wings`,
      }
    ),
    makeNode(floor, 'CORR-EAST', `${ord} Floor East Passage`, 'corridor', 70, 50, true, {
      dimensions: '2.73m wide passage',
      description: `${ord} Floor east wing passage to Lift 2, Fire Stair B, and east rooms/terrace`,
    }),
  ];

  const edges = [
    makeEdge(
      `E_${p}_STAIRA_CORRCENTRAL`,
      `${p}-STAIR-A`,
      `${p}-CORR-CENTRAL`,
      9.0,
      true,
      'walking',
      `Step off Main Staircase A into the ${ord} Floor Central Corridor`,
      `Walk from ${ord} Floor Central Corridor to Main Staircase A landing`
    ),
    makeEdge(
      `E_${p}_LIFT1_CORRCENTRAL`,
      `${p}-LIFT-1`,
      `${p}-CORR-CENTRAL`,
      3.0,
      true,
      'walking',
      `Exit Lift 1 into the ${ord} Floor Central Corridor`,
      `Approach Lift 1 on the ${ord} Floor`
    ),
    makeEdge(
      `E_${p}_CORRCENTRAL_CORREAST`,
      `${p}-CORR-CENTRAL`,
      `${p}-CORR-EAST`,
      20.0,
      true,
      'walking',
      `Walk east along the 2.73m passage on the ${ord} Floor`,
      `Walk west back to the ${ord} Floor Central Corridor Junction`
    ),
    makeEdge(
      `E_${p}_CORREAST_LIFT2`,
      `${p}-CORR-EAST`,
      `${p}-LIFT-2`,
      3.0,
      true,
      'walking',
      `Arrive at Lift 2 landing on the ${ord} Floor`,
      `Step out of Lift 2 into the ${ord} Floor East Passage`
    ),
    makeEdge(
      `E_${p}_CORREAST_STAIRB`,
      `${p}-CORR-EAST`,
      `${p}-STAIR-B`,
      20.0,
      true,
      'walking',
      `Walk east to Fire Escape Staircase B (${ord} Floor)`,
      `Enter the ${ord} Floor East Passage from Fire Escape Staircase B`
    ),
  ];

  if (includeWestCorridor) {
    nodes.push(
      makeNode(floor, 'CORR-WEST', `${ord} Floor West Corridor`, 'corridor', 30, 55, true, {
        dimensions: '2.76m wide passage',
        description: `${ord} Floor west wing academic passage`,
      })
    );
    edges.push(
      makeEdge(
        `E_${p}_CORRCENTRAL_CORRWEST`,
        `${p}-CORR-CENTRAL`,
        `${p}-CORR-WEST`,
        20.0,
        true,
        'walking',
        `Walk west along the 2.76m wide ${ord} Floor corridor`,
        `Walk east along the corridor to the ${ord} Floor Central Junction`
      )
    );
  }

  return { nodes, edges };
}

/**
 * Sequential inter-floor vertical edges linking 1F -> 2F -> 3F -> 4F -> 5F -> 6F -> 7F
 * for Staircase A, Staircase B, Lift 1, and Lift 2.
 */
function buildSequentialVerticalEdges() {
  const verticalEdges = [];

  for (let f = 2; f <= 7; f++) {
    const prev = f - 1;
    const prevOrd = ORDINALS[prev];
    const currOrd = ORDINALS[f];

    verticalEdges.push(
      makeEdge(
        `E_INTER_STAIR_A_${prev}F_${f}F`,
        `${prev}F-STAIR-A`,
        `${f}F-STAIR-A`,
        7.0,
        false,
        'stairs',
        `Climb Main Staircase A from ${prevOrd} Floor up to ${currOrd} Floor`,
        `Descend Main Staircase A from ${currOrd} Floor down to ${prevOrd} Floor`
      ),
      makeEdge(
        `E_INTER_STAIR_B_${prev}F_${f}F`,
        `${prev}F-STAIR-B`,
        `${f}F-STAIR-B`,
        7.0,
        false,
        'stairs',
        `Climb Fire Escape Staircase B from ${prevOrd} Floor up to ${currOrd} Floor`,
        `Descend Fire Escape Staircase B from ${currOrd} Floor down to ${prevOrd} Floor`
      ),
      makeEdge(
        `E_INTER_LIFT_1_${prev}F_${f}F`,
        `${prev}F-LIFT-1`,
        `${f}F-LIFT-1`,
        4.0,
        true,
        'lift',
        `Take Lift 1 up from ${prevOrd} Floor to ${currOrd} Floor`,
        `Take Lift 1 down from ${currOrd} Floor to ${prevOrd} Floor`
      ),
      makeEdge(
        `E_INTER_LIFT_2_${prev}F_${f}F`,
        `${prev}F-LIFT-2`,
        `${f}F-LIFT-2`,
        4.0,
        true,
        'lift',
        `Take Lift 2 up from ${prevOrd} Floor to ${currOrd} Floor`,
        `Take Lift 2 down from ${currOrd} Floor to ${prevOrd} Floor`
      )
    );
  }

  return verticalEdges;
}

/**
 * Floors 2 through 7 Rooms, Classrooms, Labs, Offices, Seminar Hall & Open Terraces
 * parsed from BJI Main Block Architectural Plans (00000, 0002, and 003).
 */
function buildUpperFloorsGraph() {
  const allNodes = [];
  const allEdges = [];

  // =========================================================================
  // 2ND FLOOR (Civil Engineering & Advanced Computing Wing) — z = 7.8m
  // =========================================================================
  const f2 = buildFloorCoreAndCorridors(2, true);
  allNodes.push(
    ...f2.nodes,
    makeNode(2, 'CLASS-201', 'Classroom 201', 'room', 18, 68, true, {
      roomNumber: '201',
      dimensions: '905x1230 cm',
      department: 'Civil Engineering',
      capacity: 72,
      description: '2nd Floor Smart Lecture Hall (S3 Civil)',
    }),
    makeNode(2, 'CLASS-202', 'Classroom 202', 'room', 18, 48, true, {
      roomNumber: '202',
      dimensions: '850x1265 cm',
      department: 'Civil Engineering',
      capacity: 70,
      description: '2nd Floor Structural Mechanics Lecture Room (S5 Civil)',
    }),
    makeNode(2, 'TUTORIAL-201', 'Tutorial Room 201', 'room', 20, 28, true, {
      roomNumber: '203',
      dimensions: '1106x990 cm',
      department: 'Civil Engineering',
      capacity: 45,
      description: 'Remedial & small-group tutorial classroom',
    }),
    makeNode(2, 'RESTROOM', '2nd Floor Restrooms & Accessible Toilet', 'restroom', 36, 46, true, {
      dimensions: '255x186 cm',
      description: 'Gents, Ladies, and Wheelchair Accessible D.Toilet (2nd Floor)',
    }),
    makeNode(2, 'SURVEY-LAB', 'Geomatics & Structural CADD Lab', 'lab', 46, 35, true, {
      roomNumber: '208',
      dimensions: '877x876 cm',
      department: 'Civil Engineering',
      capacity: 45,
      description: 'Total station surveying & GIS modeling laboratory',
    }),
    makeNode(2, 'PROG-LAB', 'Systems & Networks Computing Lab', 'lab', 56, 68, true, {
      roomNumber: '210',
      dimensions: '1014x1230 cm',
      department: 'Computer Science & Engineering',
      capacity: 66,
      description: 'High-performance Linux networking and OS lab',
    }),
    makeNode(2, 'CLASS-203', 'Classroom 203', 'room', 66, 35, true, {
      roomNumber: '212',
      dimensions: '565x1036 cm',
      department: 'Computer Science & Engineering',
      capacity: 60,
      description: '2nd Floor East Wing Lecture Room',
    }),
    makeNode(2, 'HOD-CIVIL', 'Head of Civil Engineering Department', 'office', 76, 68, true, {
      roomNumber: '215',
      dimensions: '570x837 cm',
      department: 'Civil Engineering',
      description: 'HOD Civil Engineering chamber with 570x355 cm waiting lobby',
    }),
    makeNode(2, 'FACULTY-CIVIL', 'Civil Engineering Faculty Room', 'room', 84, 38, true, {
      roomNumber: '218',
      dimensions: '508x876 cm',
      department: 'Civil Engineering',
      capacity: 20,
      description: 'Civil Engineering teaching staff workstations',
    })
  );
  allEdges.push(
    ...f2.edges,
    makeEdge('E_2F_CORRWEST_CLASS201', '2F-CORR-WEST', '2F-CLASS-201', 16.0, true, 'walking', 'Turn right into Classroom 201', 'Exit Classroom 201 into 2nd Floor West Corridor'),
    makeEdge('E_2F_CORRWEST_CLASS202', '2F-CORR-WEST', '2F-CLASS-202', 14.0, true, 'walking', 'Enter Classroom 202 on your left', 'Exit Classroom 202 into 2nd Floor West Corridor'),
    makeEdge('E_2F_CORRWEST_TUT201', '2F-CORR-WEST', '2F-TUTORIAL-201', 28.0, true, 'walking', 'Walk to the end of West Corridor to Tutorial Room 201', 'Exit Tutorial Room 201 to West Corridor'),
    makeEdge('E_2F_CORRWEST_RESTROOM', '2F-CORR-WEST', '2F-RESTROOM', 11.0, true, 'walking', 'Enter 2nd Floor Restrooms & Accessible Toilet', 'Exit Restrooms into 2nd Floor West Corridor'),
    makeEdge('E_2F_CORRCENTRAL_SURVEYLAB', '2F-CORR-CENTRAL', '2F-SURVEY-LAB', 16.0, true, 'walking', 'Walk south from Central Junction to Geomatics & CADD Lab', 'Exit Geomatics Lab to 2nd Floor Central Junction'),
    makeEdge('E_2F_CORRCENTRAL_PROGLAB', '2F-CORR-CENTRAL', '2F-PROG-LAB', 19.0, true, 'walking', 'Walk north into Systems & Networks Computing Lab', 'Exit Systems & Networks Lab to Central Junction'),
    makeEdge('E_2F_CORREAST_CLASS203', '2F-CORR-EAST', '2F-CLASS-203', 15.5, true, 'walking', 'Turn south into Classroom 203', 'Exit Classroom 203 into East Passage'),
    makeEdge('E_2F_CORREAST_HODCIVIL', '2F-CORR-EAST', '2F-HOD-CIVIL', 19.0, true, 'walking', 'Enter Head of Civil Engineering Department Office', 'Exit HOD Civil Office into East Passage'),
    makeEdge('E_2F_CORREAST_FACCIVIL', '2F-CORR-EAST', '2F-FACULTY-CIVIL', 18.5, true, 'walking', 'Enter the Civil Engineering Faculty Room', 'Exit Civil Faculty Room into East Passage')
  );

  // =========================================================================
  // 3RD FLOOR (Mechanical Engineering & B.Arch Design Studios) — z = 11.7m
  // =========================================================================
  const f3 = buildFloorCoreAndCorridors(3, true);
  allNodes.push(
    ...f3.nodes,
    makeNode(3, 'CLASS-301', 'Classroom 301', 'room', 18, 68, true, {
      roomNumber: '301',
      dimensions: '905x1230 cm',
      department: 'Mechanical Engineering',
      capacity: 72,
      description: '3rd Floor Lecture Classroom (S5 Mechanical)',
    }),
    makeNode(3, 'CLASS-302', 'Classroom 302', 'room', 18, 48, true, {
      roomNumber: '302',
      dimensions: '850x1265 cm',
      department: 'Mechanical Engineering',
      capacity: 70,
      description: '3rd Floor Lecture Classroom (S7 Mechanical)',
    }),
    makeNode(3, 'TUTORIAL-301', 'Tutorial Room 301', 'room', 20, 28, true, {
      roomNumber: '303',
      dimensions: '1106x990 cm',
      department: 'Mechanical Engineering',
      capacity: 45,
      description: 'Thermodynamics & Design Tutorial Room',
    }),
    makeNode(3, 'RESTROOM', '3rd Floor Restrooms & Accessible Toilet', 'restroom', 36, 46, true, {
      dimensions: '255x186 cm',
      description: '3rd Floor Gents, Ladies, and Disabled Restroom',
    }),
    makeNode(3, 'JURY-HALL', 'Architecture Jury & Review Hall', 'hall', 46, 35, true, {
      roomNumber: '308',
      dimensions: '588x1308 cm',
      department: 'Architecture',
      capacity: 75,
      description: 'Critique and portfolio presentation hall for B.Arch students',
    }),
    makeNode(3, 'EMBEDDED-LAB', 'Microprocessor & Robotics Lab', 'lab', 56, 68, true, {
      roomNumber: '310',
      dimensions: '1014x1230 cm',
      department: 'Electronics & Mechanical',
      capacity: 60,
      description: 'Embedded controllers, IoT sensors, and mechatronics lab',
    }),
    makeNode(3, 'HOD-MECH', 'Head of Mechanical Engineering Department', 'office', 66, 35, true, {
      roomNumber: '312',
      dimensions: '570x837 cm',
      department: 'Mechanical Engineering',
      description: 'Chamber of Head of Mechanical Engineering',
    }),
    makeNode(3, 'ARCH-STUDIO', 'B.Arch Design Studio', 'hall', 76, 68, true, {
      roomNumber: '315',
      dimensions: '877x876 cm',
      department: 'Architecture',
      capacity: 65,
      description: 'Drafting tables and architectural model-making studio',
    }),
    makeNode(3, 'FACULTY-MECH', 'Mechanical & Architecture Faculty Room', 'room', 84, 38, true, {
      roomNumber: '318',
      dimensions: '508x876 cm',
      department: 'Mechanical & Architecture',
      capacity: 22,
      description: '3rd Floor faculty cubicles and consultation room',
    })
  );
  allEdges.push(
    ...f3.edges,
    makeEdge('E_3F_CORRWEST_CLASS301', '3F-CORR-WEST', '3F-CLASS-301', 16.0, true, 'walking', 'Turn right into Classroom 301', 'Exit Classroom 301 into 3rd Floor West Corridor'),
    makeEdge('E_3F_CORRWEST_CLASS302', '3F-CORR-WEST', '3F-CLASS-302', 14.0, true, 'walking', 'Enter Classroom 302', 'Exit Classroom 302 into 3rd Floor West Corridor'),
    makeEdge('E_3F_CORRWEST_TUT301', '3F-CORR-WEST', '3F-TUTORIAL-301', 28.0, true, 'walking', 'Proceed down West Corridor to Tutorial Room 301', 'Exit Tutorial Room 301 to West Corridor'),
    makeEdge('E_3F_CORRWEST_RESTROOM', '3F-CORR-WEST', '3F-RESTROOM', 11.0, true, 'walking', 'Enter 3rd Floor Restrooms & Accessible Toilet', 'Exit Restrooms into 3rd Floor West Corridor'),
    makeEdge('E_3F_CORRCENTRAL_JURYHALL', '3F-CORR-CENTRAL', '3F-JURY-HALL', 15.5, true, 'walking', 'Walk south into the Architecture Jury & Review Hall', 'Exit Jury Hall to 3rd Floor Central Junction'),
    makeEdge('E_3F_CORRCENTRAL_EMBEDDED', '3F-CORR-CENTRAL', '3F-EMBEDDED-LAB', 19.0, true, 'walking', 'Enter Microprocessor & Robotics Lab', 'Exit Robotics Lab to 3rd Floor Central Junction'),
    makeEdge('E_3F_CORREAST_HODMECH', '3F-CORR-EAST', '3F-HOD-MECH', 15.5, true, 'walking', 'Enter Head of Mechanical Engineering Office', 'Exit HOD Mechanical Office into East Passage'),
    makeEdge('E_3F_CORREAST_ARCHSTUDIO', '3F-CORR-EAST', '3F-ARCH-STUDIO', 19.0, true, 'walking', 'Turn north into B.Arch Design Studio', 'Exit B.Arch Design Studio into East Passage'),
    makeEdge('E_3F_CORREAST_FACMECH', '3F-CORR-EAST', '3F-FACULTY-MECH', 18.5, true, 'walking', 'Enter 3rd Floor Faculty Room', 'Exit 3rd Floor Faculty Room into East Passage')
  );

  // =========================================================================
  // 4TH FLOOR (Parsed from BJI_BUILDING PLAN 0002 — FOURTH FLOOR PLAN) — z = 15.6m
  // =========================================================================
  const f4 = buildFloorCoreAndCorridors(4, true);
  allNodes.push(
    ...f4.nodes,
    makeNode(4, 'CLASS-401', 'Classroom 401', 'room', 18, 68, true, {
      roomNumber: '401',
      dimensions: '905x1230 cm',
      department: 'Computer Science & Engineering',
      capacity: 72,
      description: '4th Floor West Wing Classroom (905x1230 cm)',
    }),
    makeNode(4, 'CLASS-402', 'Classroom 402', 'room', 18, 48, true, {
      roomNumber: '402',
      dimensions: '850x1265 cm',
      department: 'Computer Science & Engineering',
      capacity: 70,
      description: '4th Floor West Wing Classroom (850x1265 cm)',
    }),
    makeNode(4, 'TUTORIAL-4A', 'Tutorial Room 4A', 'room', 20, 28, true, {
      roomNumber: '403',
      dimensions: '1106x990 cm',
      department: 'Computer Science & Engineering',
      capacity: 48,
      description: '4th Floor South-West Tutorial Room (1106x990 cm)',
    }),
    makeNode(4, 'SICK-ROOM', 'Sick Room & First Aid', 'room', 33, 33, true, {
      roomNumber: '404',
      dimensions: '300x594 cm',
      description: 'Campus Sick Room & Medical Rest Bay with attached 180x286 cm washroom',
    }),
    makeNode(4, 'STORE-RM', 'Store Room (4th Floor)', 'room', 35, 68, true, {
      roomNumber: '405',
      dimensions: '240x1044 cm',
      description: '4th Floor equipment and academic store room (240x1044 cm)',
    }),
    makeNode(4, 'RESTROOM', '4th Floor Restrooms & D.Toilet', 'restroom', 36, 47, true, {
      dimensions: '255x186 cm',
      description: '4th Floor Toilets & Wheelchair Accessible D.Toilet (255x186 cm)',
    }),
    makeNode(4, 'HOD-CS-PG', 'Head of CS Department (4th Floor Wing)', 'office', 46, 70, true, {
      roomNumber: '408',
      dimensions: '570x837 cm',
      department: 'Computer Science & Engineering',
      description: 'Head of CS Department chamber (570x837 cm) with 570x355 cm Waiting Area',
    }),
    makeNode(4, 'TUTORIAL-4B', 'Tutorial Room 4B', 'room', 52, 34, true, {
      roomNumber: '410',
      dimensions: '588x1308 cm',
      capacity: 45,
      description: 'Central Wing Tutorial Room (588x1308 cm)',
    }),
    makeNode(4, 'CLASS-403', 'Classroom 403', 'room', 60, 68, true, {
      roomNumber: '411',
      dimensions: '1014x1230 cm',
      capacity: 75,
      description: 'Large 4th Floor Central Lecture Classroom (1014x1230 cm)',
    }),
    makeNode(4, 'TUTORIAL-4C', 'Tutorial Room 4C', 'room', 65, 35, true, {
      roomNumber: '412',
      dimensions: '296x876 cm',
      capacity: 30,
      description: 'East Passage Tutorial & Counseling Room (296x876 cm)',
    }),
    makeNode(4, 'DRAWING-HALL', 'Drawing Hall (4th Floor)', 'hall', 74, 68, true, {
      roomNumber: '415',
      dimensions: '877x876 cm',
      capacity: 65,
      description: '4th Floor East Wing Drawing Hall (877x876 cm)',
    }),
    makeNode(4, 'FACULTY-RM', 'Faculty Room (4th Floor)', 'room', 85, 65, true, {
      roomNumber: '416',
      dimensions: '508x876 cm',
      capacity: 20,
      description: '4th Floor East Wing Faculty Room (508x876 cm)',
    }),
    makeNode(4, 'CLASS-404', 'Classroom 404', 'room', 78, 35, true, {
      roomNumber: '418',
      dimensions: '565x1036 cm',
      capacity: 60,
      description: '4th Floor East Wing Classroom (565x1036 cm)',
    }),
    makeNode(4, 'POWER-RM', 'Power & Electrical Room (4F)', 'office', 89, 36, true, {
      roomNumber: '420',
      dimensions: '298x420 cm',
      description: 'Electrical distribution & UPS power room (298x420 cm)',
    })
  );
  allEdges.push(
    ...f4.edges,
    makeEdge('E_4F_CORRWEST_CLASS401', '4F-CORR-WEST', '4F-CLASS-401', 16.0, true, 'walking', 'Turn right into Classroom 401', 'Exit Classroom 401 into 4th Floor West Corridor'),
    makeEdge('E_4F_CORRWEST_CLASS402', '4F-CORR-WEST', '4F-CLASS-402', 14.0, true, 'walking', 'Enter Classroom 402', 'Exit Classroom 402 into 4th Floor West Corridor'),
    makeEdge('E_4F_CORRWEST_TUT4A', '4F-CORR-WEST', '4F-TUTORIAL-4A', 28.0, true, 'walking', 'Walk down West Corridor to Tutorial Room 4A', 'Exit Tutorial Room 4A to West Corridor'),
    makeEdge('E_4F_CORRWEST_SICKRM', '4F-CORR-WEST', '4F-SICK-ROOM', 22.0, true, 'walking', 'Walk south along West Corridor to the Sick Room', 'Exit Sick Room into 4th Floor West Corridor'),
    makeEdge('E_4F_CORRWEST_STORERM', '4F-CORR-WEST', '4F-STORE-RM', 14.0, true, 'walking', 'Access the 4th Floor Store Room', 'Exit Store Room to West Corridor'),
    makeEdge('E_4F_CORRWEST_RESTROOM', '4F-CORR-WEST', '4F-RESTROOM', 10.0, true, 'walking', 'Enter 4th Floor Restrooms & Disabled Toilet', 'Exit Restrooms into West Corridor'),
    makeEdge('E_4F_CORRCENTRAL_HODCSPG', '4F-CORR-CENTRAL', '4F-HOD-CS-PG', 20.0, true, 'walking', 'Walk through the Waiting Area into Head of CS Department (4F)', 'Exit HOD CS 4F Chamber to Central Junction'),
    makeEdge('E_4F_CORRCENTRAL_TUT4B', '4F-CORR-CENTRAL', '4F-TUTORIAL-4B', 16.0, true, 'walking', 'Turn south into Tutorial Room 4B', 'Exit Tutorial Room 4B to Central Corridor'),
    makeEdge('E_4F_CORRCENTRAL_CLASS403', '4F-CORR-CENTRAL', '4F-CLASS-403', 20.0, true, 'walking', 'Enter Classroom 403', 'Exit Classroom 403 to 4th Floor Central Junction'),
    makeEdge('E_4F_CORREAST_TUT4C', '4F-CORR-EAST', '4F-TUTORIAL-4C', 15.5, true, 'walking', 'Turn south into Tutorial Room 4C', 'Exit Tutorial Room 4C into East Passage'),
    makeEdge('E_4F_CORREAST_DRAWHALL', '4F-CORR-EAST', '4F-DRAWING-HALL', 18.5, true, 'walking', 'Enter the 4th Floor Drawing Hall', 'Exit Drawing Hall into East Passage'),
    makeEdge('E_4F_CORREAST_FACRM', '4F-CORR-EAST', '4F-FACULTY-RM', 21.0, true, 'walking', 'Walk east into the 4th Floor Faculty Room', 'Exit 4th Floor Faculty Room into East Passage'),
    makeEdge('E_4F_CORREAST_CLASS404', '4F-CORR-EAST', '4F-CLASS-404', 17.0, true, 'walking', 'Enter Classroom 404', 'Exit Classroom 404 into East Passage'),
    makeEdge('E_4F_CORREAST_POWERRM', '4F-CORR-EAST', '4F-POWER-RM', 23.0, true, 'walking', 'Reach Power & Electrical Room at the east end', 'Walk back from Power Room to East Passage')
  );

  // =========================================================================
  // 5TH FLOOR (Parsed from BJI_BUILDING PLAN 0002 — FIFTH FLOOR PLAN) — z = 19.5m
  // =========================================================================
  const f5 = buildFloorCoreAndCorridors(5, true);
  allNodes.push(
    ...f5.nodes,
    makeNode(5, 'CLASS-501', 'Classroom 501', 'room', 18, 68, true, {
      roomNumber: '501',
      dimensions: '905x1230 cm',
      department: 'Electrical & Electronics Engineering',
      capacity: 72,
      description: '5th Floor EEE Lecture Classroom (905x1230 cm)',
    }),
    makeNode(5, 'CLASS-502', 'Classroom 502', 'room', 18, 48, true, {
      roomNumber: '502',
      dimensions: '850x1265 cm',
      department: 'Electrical & Electronics Engineering',
      capacity: 70,
      description: '5th Floor EEE Lecture Classroom (850x1265 cm)',
    }),
    makeNode(5, 'TUTORIAL-501', 'Tutorial Room 501', 'room', 20, 28, true, {
      roomNumber: '503',
      dimensions: '1106x990 cm',
      department: 'Electrical & Electronics Engineering',
      capacity: 48,
      description: '5th Floor EEE Tutorial Room (1106x990 cm)',
    }),
    makeNode(5, 'RESTROOM', '5th Floor Restrooms & D.Toilet', 'restroom', 36, 46, true, {
      dimensions: '255x186 cm',
      description: '5th Floor Toilets & Wheelchair Accessible D.Toilet (255x186 cm)',
    }),
    makeNode(5, 'CLASS-503', 'Classroom 503', 'room', 44, 68, true, {
      roomNumber: '505',
      dimensions: '1014x1230 cm',
      department: 'Electrical & Electronics Engineering',
      capacity: 75,
      description: '5th Floor Power Systems Classroom (1014x1230 cm)',
    }),
    makeNode(5, 'EEE-WAITING', 'EEE HOD Waiting Area', 'checkpoint', 55, 59, true, {
      roomNumber: '507',
      dimensions: '570x355 cm',
      department: 'Electrical & Electronics Engineering',
      description: 'Waiting lobby outside Electrical & Electronics HOD Chamber (570x355 cm)',
    }),
    makeNode(
      5,
      'HOD-EEE',
      'Head of Electrical & Electronics Department',
      'office',
      58,
      70,
      true,
      {
        roomNumber: '508',
        dimensions: '570x837 cm',
        department: 'Electrical & Electronics Engineering',
        description: 'Chamber of Head of Electrical & Electronics Dept (570x837 cm)',
      }
    ),
    makeNode(5, 'OPEN-TERRACE', '5th Floor East Open Terrace', 'hall', 80, 62, true, {
      roomNumber: '5T',
      dimensions: 'Open Terrace Deck',
      description: 'Large East Wing Open Terrace accessed via doors D1 & D2',
    })
  );
  allEdges.push(
    ...f5.edges,
    makeEdge('E_5F_CORRWEST_CLASS501', '5F-CORR-WEST', '5F-CLASS-501', 16.0, true, 'walking', 'Turn right into Classroom 501', 'Exit Classroom 501 into 5th Floor West Corridor'),
    makeEdge('E_5F_CORRWEST_CLASS502', '5F-CORR-WEST', '5F-CLASS-502', 14.0, true, 'walking', 'Enter Classroom 502', 'Exit Classroom 502 into 5th Floor West Corridor'),
    makeEdge('E_5F_CORRWEST_TUT501', '5F-CORR-WEST', '5F-TUTORIAL-501', 28.0, true, 'walking', 'Walk down West Corridor to Tutorial Room 501', 'Exit Tutorial Room 501 to West Corridor'),
    makeEdge('E_5F_CORRWEST_RESTROOM', '5F-CORR-WEST', '5F-RESTROOM', 11.0, true, 'walking', 'Enter 5th Floor Restrooms & Disabled Toilet', 'Exit Restrooms into 5th Floor West Corridor'),
    makeEdge('E_5F_CORRCENTRAL_CLASS503', '5F-CORR-CENTRAL', '5F-CLASS-503', 19.0, true, 'walking', 'Walk north into Classroom 503', 'Exit Classroom 503 to 5th Floor Central Junction'),
    makeEdge('E_5F_CORRCENTRAL_EEEWAIT', '5F-CORR-CENTRAL', '5F-EEE-WAITING', 10.5, true, 'walking', 'Step into the Electrical & Electronics HOD Waiting Area', 'Return to 5th Floor Central Junction'),
    makeEdge('E_5F_EEEWAIT_HODEEE', '5F-EEE-WAITING', '5F-HOD-EEE', 11.5, true, 'walking', 'Enter the Head of Electrical & Electronics Department Chamber', 'Exit HOD EEE Chamber into the Waiting Area'),
    makeEdge('E_5F_CORREAST_TERRACE', '5F-CORR-EAST', '5F-OPEN-TERRACE', 15.5, true, 'walking', 'Step through Terrace Door D1 onto the 5th Floor East Open Terrace', 'Re-enter 5th Floor East Passage from the Open Terrace')
  );

  // =========================================================================
  // 6TH FLOOR (Parsed from BJI_BUILDING PLAN 003 — SIXTH FLOOR PLAN) — z = 23.4m
  // =========================================================================
  const f6 = buildFloorCoreAndCorridors(6, true);
  allNodes.push(
    ...f6.nodes,
    makeNode(6, 'SEMINAR-HALL', 'Main Seminar Hall (6th Floor)', 'hall', 20, 66, true, {
      roomNumber: '601',
      dimensions: '1776x1230 cm',
      capacity: 250,
      description: 'Grand 6th Floor Seminar Auditorium (1776x1230 cm) with breakable safety glass panels',
    }),
    makeNode(6, 'SEMINAR-STAGE', 'Seminar Hall Stage & Podium', 'hall', 20, 42, true, {
      roomNumber: '601-S',
      dimensions: '905x1230 cm',
      description: 'Auditorium stage and speaker podium (905x1230 cm)',
    }),
    makeNode(6, 'TUTORIAL-601', 'Tutorial Room 601', 'room', 38, 35, true, {
      roomNumber: '602',
      dimensions: '615x877 cm',
      capacity: 40,
      description: '6th Floor Tutorial Room (615x877 cm) adjacent to Seminar Wing',
    }),
    makeNode(6, 'CLASS-601', 'Classroom 601', 'room', 46, 68, true, {
      roomNumber: '603',
      dimensions: '659x877 cm',
      capacity: 50,
      description: '6th Floor Lecture Classroom (659x877 cm)',
    }),
    makeNode(6, 'RESTROOM', '6th Floor Wash & Restroom Block', 'restroom', 58, 68, true, {
      dimensions: '5x 155x135 cm + 260x142 cm',
      description: '6th Floor multi-stall washroom complex serving Seminar Hall',
    }),
    makeNode(6, 'OPEN-TERRACE', '6th Floor Open Terrace', 'hall', 78, 62, true, {
      roomNumber: '6T',
      dimensions: '1124x1353 cm',
      description: '6th Floor open parapet terrace overlooking 5th Floor open terrace',
    })
  );
  allEdges.push(
    ...f6.edges,
    makeEdge('E_6F_CORRWEST_SEMINAR', '6F-CORR-WEST', '6F-SEMINAR-HALL', 16.5, true, 'walking', 'Enter the Main 6th Floor Seminar Hall through double doors D1', 'Exit Main Seminar Hall into 6th Floor West Foyer'),
    makeEdge('E_6F_SEMINAR_STAGE', '6F-SEMINAR-HALL', '6F-SEMINAR-STAGE', 14.0, true, 'walking', 'Walk down the auditorium aisle to the Seminar Hall Stage', 'Walk back from the Stage into the Main Seminar Hall'),
    makeEdge('E_6F_CORRWEST_TUT601', '6F-CORR-WEST', '6F-TUTORIAL-601', 21.0, true, 'walking', 'Walk south along passage to Tutorial Room 601', 'Exit Tutorial Room 601 to 6th Floor West Foyer'),
    makeEdge('E_6F_CORRCENTRAL_CLASS601', '6F-CORR-CENTRAL', '6F-CLASS-601', 18.5, true, 'walking', 'Walk north into Classroom 601', 'Exit Classroom 601 to 6th Floor Central Lobby'),
    makeEdge('E_6F_CORRCENTRAL_RESTROOM', '6F-CORR-CENTRAL', '6F-RESTROOM', 19.5, true, 'walking', 'Proceed to the 6th Floor Wash & Restroom Block', 'Return from Restroom Block to 6th Floor Central Lobby'),
    makeEdge('E_6F_CORREAST_TERRACE', '6F-CORR-EAST', '6F-OPEN-TERRACE', 14.5, true, 'walking', 'Step outside onto the 6th Floor Open Terrace', 'Enter 6th Floor East Passage from the Open Terrace')
  );

  // =========================================================================
  // 7TH FLOOR (Parsed from BJI_BUILDING PLAN 003 — SEVENTH FLOOR PLAN) — z = 27.3m
  // =========================================================================
  const f7 = buildFloorCoreAndCorridors(7, false);
  allNodes.push(
    ...f7.nodes,
    makeNode(7, 'TERRACE-WEST', '7th Floor West Sky Terrace', 'hall', 26, 60, true, {
      roomNumber: '7T-W',
      dimensions: '1353x1824 cm',
      description: '7th Floor West Wing open terrace deck above Seminar Hall',
    }),
    makeNode(7, 'TERRACE-CENTRAL', '7th Floor Central Rooftop Terrace', 'hall', 55, 66, true, {
      roomNumber: '7T-C',
      dimensions: '1168x1327 cm',
      description: 'Central 7th Floor open rooftop terrace court',
    }),
    makeNode(7, 'TERRACE-EAST', '7th Floor East Rooftop Deck', 'checkpoint', 80, 64, true, {
      roomNumber: '7T-E',
      dimensions: 'Open Terrace',
      description: 'East rooftop deck adjacent to Lift 2 & Fire Escape Staircase B',
    })
  );
  allEdges.push(
    ...f7.edges,
    makeEdge('E_7F_CORRCENTRAL_TERRWEST', '7F-CORR-CENTRAL', '7F-TERRACE-WEST', 26.0, true, 'walking', 'Walk west onto the 7th Floor West Sky Terrace', 'Return east to 7th Floor Central Sky Lobby'),
    makeEdge('E_7F_CORRCENTRAL_TERRCENT', '7F-CORR-CENTRAL', '7F-TERRACE-CENTRAL', 17.0, true, 'walking', 'Step out onto the 7th Floor Central Rooftop Terrace', 'Re-enter 7th Floor Central Sky Lobby'),
    makeEdge('E_7F_CORREAST_TERREAST', '7F-CORR-EAST', '7F-TERRACE-EAST', 17.0, true, 'walking', 'Step onto the 7th Floor East Rooftop Deck', 'Return to 7th Floor East Passage')
  );

  // Add sequential vertical transit links from 1F all the way up to 7F
  allEdges.push(...buildSequentialVerticalEdges());

  return { nodes: allNodes, edges: allEdges };
}

function buildUpperFloorFacultyAndTimetables() {
  const extraTeachers = [
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
      cabinNodeId: '2F-HOD-CIVIL',
      phone: '+91 94476 78901',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
      subjects: ['Architectural Design Studio', 'Urban Planning', 'Sustainable Structures'],
    },
  ];

  const extraTimetables = [
    {
      teacherId: 'TCH-005',
      dayOfWeek: 'Monday',
      startTime: '09:00',
      endTime: '10:30',
      roomNodeId: '5F-CLASS-501',
      subject: 'Power Systems Analysis',
      courseCode: 'EET301',
      semester: 'S5 EEE',
    },
    {
      teacherId: 'TCH-005',
      dayOfWeek: 'Wednesday',
      startTime: '11:00',
      endTime: '12:30',
      roomNodeId: '5F-CLASS-503',
      subject: 'Smart Grids & High Voltage Engineering',
      courseCode: 'EET401',
      semester: 'S7 EEE',
    },
    {
      teacherId: 'TCH-005',
      dayOfWeek: 'Friday',
      startTime: '14:00',
      endTime: '16:00',
      roomNodeId: '6F-SEMINAR-HALL',
      subject: 'IEEE Technical Colloquium & Seminar',
      courseCode: 'EES499',
      semester: 'All Branches',
    },
    {
      teacherId: 'TCH-006',
      dayOfWeek: 'Tuesday',
      startTime: '09:30',
      endTime: '12:30',
      roomNodeId: '3F-ARCH-STUDIO',
      subject: 'Architectural Design Studio IV',
      courseCode: 'ARC301',
      semester: 'S5 B.Arch',
    },
    {
      teacherId: 'TCH-006',
      dayOfWeek: 'Thursday',
      startTime: '13:30',
      endTime: '15:30',
      roomNodeId: '4F-DRAWING-HALL',
      subject: 'Structural Working Drawings',
      courseCode: 'ARC405',
      semester: 'S7 B.Arch',
    },
    {
      teacherId: 'TCH-006',
      dayOfWeek: 'Saturday',
      startTime: '10:00',
      endTime: '12:00',
      roomNodeId: '3F-JURY-HALL',
      subject: 'B.Arch Thesis Design Jury',
      courseCode: 'ARC490',
      semester: 'S9 B.Arch',
    },
  ];

  return { extraTeachers, extraTimetables };
}

/**
 * Merges Ground & 1st Floor base data with Floors 2–7 spatial graph,
 * validates every node/edge and sequential vertical transit shaft, and writes seedData.json.
 */
function syncSeedDataFile() {
  const raw = JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf8'));

  // Keep canonical Floor 0 and Floor 1 nodes
  const baseNodes = raw.nodes.filter((n) => n.floor === 0 || n.floor === 1);
  const baseNodeIds = new Set(baseNodes.map((n) => n.nodeId));

  // Keep canonical Floor 0 and Floor 1 edges (including GF <-> 1F vertical edges)
  const baseEdges = raw.edges.filter(
    (e) => baseNodeIds.has(e.fromNode) && baseNodeIds.has(e.toNode)
  );

  // Ensure horizontal corridor approach to GF stairs allows someone standing at stair QR to route to lift
  baseEdges.forEach((e) => {
    if (e.edgeId === 'E_GF_CORRCENTRAL_STAIRA' || e.edgeId === 'E_GF_CORREAST_STAIRB') {
      e.accessible = true;
    }
  });

  const baseTeachers = raw.teachers.filter((t) =>
    ['TCH-001', 'TCH-002', 'TCH-003', 'TCH-004'].includes(t.teacherId)
  );
  const baseTimetables = raw.timetables.filter((tt) =>
    ['TCH-001', 'TCH-002', 'TCH-003', 'TCH-004'].includes(tt.teacherId)
  );

  const upperGraph = buildUpperFloorsGraph();
  const { extraTeachers, extraTimetables } = buildUpperFloorFacultyAndTimetables();

  const merged = {
    nodes: [...baseNodes, ...upperGraph.nodes],
    edges: [...baseEdges, ...upperGraph.edges],
    teachers: [...baseTeachers, ...extraTeachers],
    timetables: [...baseTimetables, ...extraTimetables],
  };

  // Strict graph integrity check
  const allNodeMap = new Map();
  for (const n of merged.nodes) {
    if (allNodeMap.has(n.nodeId)) {
      throw new Error(`Duplicate nodeId detected: ${n.nodeId}`);
    }
    allNodeMap.set(n.nodeId, n);
  }

  const allEdgeIds = new Set();
  for (const e of merged.edges) {
    if (allEdgeIds.has(e.edgeId)) {
      throw new Error(`Duplicate edgeId detected: ${e.edgeId}`);
    }
    if (!allNodeMap.has(e.fromNode)) {
      throw new Error(`Edge ${e.edgeId} references missing fromNode: ${e.fromNode}`);
    }
    if (!allNodeMap.has(e.toNode)) {
      throw new Error(`Edge ${e.edgeId} references missing toNode: ${e.toNode}`);
    }
    allEdgeIds.add(e.edgeId);
  }

  // Verify sequential vertical transit shafts GF (0) -> 1F -> 2F -> 3F -> 4F -> 5F -> 6F -> 7F
  const shafts = ['STAIR-A', 'STAIR-B', 'LIFT-1', 'LIFT-2'];
  for (const shaft of shafts) {
    for (let f = 0; f < 7; f++) {
      const u = `${f === 0 ? 'GF' : `${f}F`}-${shaft}`;
      const v = `${f + 1}F-${shaft}`;
      const linked = merged.edges.some(
        (e) =>
          (e.fromNode === u && e.toNode === v) ||
          (e.isBidirectional && e.fromNode === v && e.toNode === u)
      );
      if (!linked) {
        throw new Error(`Broken vertical transit link between ${u} and ${v}`);
      }
    }
  }

  fs.writeFileSync(SEED_DATA_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return merged;
}

if (require.main === module) {
  const result = syncSeedDataFile();
  console.log(
    `Generated seedData.json: ${result.nodes.length} nodes, ${result.edges.length} edges across Floors 0–7.`
  );
}

module.exports = { syncSeedDataFile };
