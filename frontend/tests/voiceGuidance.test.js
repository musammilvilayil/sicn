import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getApproachPhrase,
  getArrivalPhrase,
  getFloorArrivalPhrase,
  getRouteIntroPhrase,
  getSegmentPhrase,
  spokenPlace,
} from '../src/utils/voiceGuidance.js';

const route = {
  totalDistance: 99.2,
  estimatedTimeMinutes: 4,
  floorsCovered: [0, 1],
  path: [
    { nodeId: 'GF-ENT', name: 'Main Entrance (Ground Floor)', floor: 0 },
    { nodeId: 'GF-STAIR', name: 'Entrance Steps (Ground Level)', floor: 0 },
    { nodeId: '1F-LAND', name: 'Steps Landing', floor: 1 },
    { nodeId: '1F-HALL', name: 'Conference Hall (Floor 1)', floor: 1 },
  ],
  directions: [
    { type: 'start', instruction: 'Start at Main Entrance (Ground Floor)', distance: 0 },
    { type: 'straight', instruction: 'Walk to the foot of the grand entrance steps', distance: 3.7 },
    { type: 'stairs', instruction: 'Take the stairs up to Floor 1', distance: 11.5, transition: { toFloor: 1 } },
    { type: 'arrive', instruction: 'Arrive at destination: Conference Hall (Floor 1)', distance: 24.4 },
  ],
};

test('reads place names without bracketed suffixes', () => {
  assert.equal(spokenPlace('Main Entrance (Ground Floor)'), 'Main Entrance');
  assert.equal(spokenPlace('Seminar Foyer (west end) — 6th Floor'), 'Seminar Foyer');
});

test('announces the route, each segment and the arrival', () => {
  assert.equal(getRouteIntroPhrase(route), 'Starting route to Conference Hall. About 4 minutes, 99 metres. You will change floors once.');
  assert.equal(getSegmentPhrase(route, 0), 'Walk to the foot of the grand entrance steps, 4 metres.');
  assert.equal(
    getSegmentPhrase(route, 1),
    'Take the stairs up to Floor 1. Scan the QR code at the stairs first, then the landing QR code on Floor 1.'
  );
  assert.equal(getSegmentPhrase(route, 2), 'Your destination, Conference Hall, is ahead in 24 metres.');
  assert.equal(getSegmentPhrase(route, 9), '');
  assert.equal(getArrivalPhrase(route), 'You have arrived at Conference Hall.');
  assert.equal(getFloorArrivalPhrase(0, 'Lobby (GF)'), 'You are on the Ground Floor. Continue to Lobby.');
});

test('warns before a turn, but not for straight junctions', () => {
  assert.equal(getApproachPhrase({ type: 'left', atNodeName: 'West Passage (2F)' }, 4.2), 'In 4 metres, turn left at West Passage.');
  assert.equal(getApproachPhrase({ type: 'right', atNodeName: '' }, 0.6), 'Turn right now.');
  assert.equal(getApproachPhrase({ type: 'u-turn', atNodeName: 'Lobby' }, 3), 'In 3 metres, make a U-turn at Lobby.');
  assert.equal(getApproachPhrase({ type: 'straight', atNodeName: 'Lobby' }, 3), null);
  assert.equal(getApproachPhrase(null, 3), null);
});
