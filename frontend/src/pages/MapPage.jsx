import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Navigation,
  ArrowUpDown,
  ArrowLeft,
  ArrowUp,
  CornerUpRight,
  QrCode,
  Share2,
  Accessibility,
  LocateFixed,
  Wrench,
  X,
  Plus,
  Minus,
  Camera,
  Compass,
  Footprints,
  FileText,
  Layers,
  MapPin,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  FlaskConical,
  Briefcase,
  Presentation,
  Bath,
  BookOpen,
  DoorOpen,
  ArrowUpFromLine,
  Building2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import FloorMap from '../components/FloorMap';
import MapToolsSheet from '../components/MapToolsSheet';
import FloorPlanCalibrationViewer from '../components/FloorPlanCalibrationViewer';
import ARView from '../components/ARView';
import DirectionsBottomSheet from '../components/DirectionsBottomSheet';
import ShareLocationSheet from '../components/ShareLocationSheet';
import AdminNodeModal from '../components/AdminNodeModal';
import IndoorCheckpointScanner from '../components/IndoorCheckpointScanner';
import { api } from '../services/api';
import { useNavigation } from '../context/NavigationContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import usePhoneSensors from '../hooks/usePhoneSensors';
import useVoiceGuidance from '../hooks/useVoiceGuidance';
import { getMapBearing, getRelativeBearing, getSegmentDistance, interpolateRoutePosition, validateRouteCheckpoint, applyPdrStep, matchPositionToRoute, getRouteTurnInstruction, getRouteSegmentBearing, getRouteAlignedNorth } from '../utils/indoorNavigation';
import {
  clampZoom,
  fitPlanToViewport,
  getMapUiInsets,
  getDesktopPanelWidth,
  panToCenter,
  projectX,
  projectY,
  DESKTOP_BREAKPOINT,
  DESKTOP_RAIL_WIDTH,
  PLAN_UP_COMPASS_BEARING,
  MAP_NORTH_STORAGE_KEY,
  MAP_NORTH_CHANGE_EVENT,
  readSavedMapNorth,
} from '../utils/mapProjection';

const CATEGORY_CHIPS = [
  { label: 'Classrooms', type: 'room', icon: GraduationCap },
  { label: 'Labs', type: 'lab', icon: FlaskConical },
  { label: 'Offices', type: 'office', icon: Briefcase },
  { label: 'Halls', type: 'hall', icon: Presentation },
  { label: 'Restrooms', type: 'restroom', icon: Bath },
  { label: 'Library', type: 'library', icon: BookOpen },
];

const PLACE_ICONS = {
  room: GraduationCap,
  lab: FlaskConical,
  office: Briefcase,
  hall: Presentation,
  restroom: Bath,
  library: BookOpen,
  entrance: DoorOpen,
  stair: ArrowUpFromLine,
  lift: Building2,
  checkpoint: QrCode,
};
const getPlaceIcon = (type) => PLACE_ICONS[type] || MapPin;

/** Current window size, updated on resize and rotation. */
function useViewportSize() {
  const read = () => (typeof window === 'undefined'
    ? { width: 1280, height: 800 }
    : { width: window.innerWidth, height: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const update = () => setSize(read());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return size;
}

const FLOOR_DEFS = [
  { f: 0, shortLabel: 'GF', fullLabel: 'Ground Floor' },
  { f: 1, shortLabel: '1F', fullLabel: '1st Floor' },
  { f: 2, shortLabel: '2F', fullLabel: '2nd Floor' },
  { f: 3, shortLabel: '3F', fullLabel: '3rd Floor' },
  { f: 4, shortLabel: '4F', fullLabel: '4th Floor' },
  { f: 5, shortLabel: '5F', fullLabel: '5th Floor' },
  { f: 6, shortLabel: '6F', fullLabel: '6th Floor' },
  { f: 7, shortLabel: '7F', fullLabel: '7th Floor' },
];

export default function MapPage() {
  const navigate = useNavigate();
  const {
    nodes,
    edges,
    refreshMapData,
    currentFloor,
    setCurrentFloor,
    accessibleOnly,
    setAccessibleOnly,
    startNodeId,
    setStartNodeId,
    destinationNodeId,
    setDestinationNodeId,
    startNodeObj,
    destNodeObj,
    routeResult,
    routeLoading,
    computeRoute,
    clearRoute,
    sheetSnap,
    setSheetSnap,
    isARMode,
    activeStepIndex,
    setActiveStepIndex,
    launchARLiveView,
    fallbackTo2DMap,
    showToast,
  } = useNavigation();

  const { user, effectiveRole, canEditMap, canAccessTimetableRouting } = useAuth();

  // Timetable + faculty cabins for the place card (role-restricted on the API).
  const [schedule, setSchedule] = useState({ status: 'locked', teachers: [], timetables: [] });
  useEffect(() => {
    if (!canAccessTimetableRouting) {
      setSchedule({ status: 'locked', teachers: [], timetables: [] });
      return undefined;
    }
    let cancelled = false;
    setSchedule((current) => ({ ...current, status: 'loading' }));
    Promise.all([api.getTeachers(), api.getTimetables()])
      .then(([teachers, timetables]) => {
        if (!cancelled) setSchedule({ status: 'ready', teachers: teachers || [], timetables: timetables || [] });
      })
      .catch(() => {
        if (!cancelled) setSchedule({ status: 'error', teachers: [], timetables: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [canAccessTimetableRouting, user?._id]);
  const { roomCode, roomMembers, friendsInRoom, broadcastCheckpoint } = useSocket();

  // Viewport: phones get a top search bar and a bottom sheet, larger screens a
  // docked side panel next to the navigation rail.
  const viewport = useViewportSize();
  const isDesktop = viewport.width >= DESKTOP_BREAKPOINT;
  // Narrow tablets start with the map uncovered; the panel opens for directions.
  const [panelOpen, setPanelOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const hasRoute = Boolean(routeResult);
  useEffect(() => {
    if (hasRoute) setPanelOpen(true);
  }, [hasRoute]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const panelWidth = getDesktopPanelWidth(viewport.width);
  // Part of the map hidden by floating UI; routes and "my position" are
  // framed inside what is left.
  const mapInsets = useMemo(() => {
    const base = getMapUiInsets(viewport.width, { panelOpen, sheet: routeResult ? sheetSnap : 'none', viewportHeight: viewport.height });
    if (isDesktop) {
      const top = routeResult ? 132 : panelOpen ? base.top : 76;
      return { ...base, top };
    }
    return { ...base, top: routeResult ? 150 : 118 };
  }, [viewport.width, viewport.height, isDesktop, panelOpen, routeResult, sheetSnap]);

  // Map camera state
  // Start with the whole building visible beside the floating controls.
  const getHomeView = (insets) => (typeof window === 'undefined'
    ? { zoom: 1, pan: { x: 0, y: 0 } }
    : fitPlanToViewport(window.innerWidth, window.innerHeight, insets || getMapUiInsets(window.innerWidth, {
      panelOpen: window.innerWidth >= 1024,
      viewportHeight: window.innerHeight,
    })));
  const [zoom, setZoom] = useState(() => getHomeView().zoom);
  const [pan, setPan] = useState(() => getHomeView().pan);
  // Compass bearing of plan-up: the building's known orientation (the main
  // entrance faces West), unless this phone has aligned its own compass.
  const [savedMapNorth, setSavedMapNorth] = useState(readSavedMapNorth);
  const mapNorthHeading = savedMapNorth ?? PLAN_UP_COMPASS_BEARING;
  const setMapNorthHeading = setSavedMapNorth;
  const [strideLengthMeters, setStrideLengthMeters] = useState(() => {
    if (typeof window === 'undefined') return 0.72;
    const saved = Number(window.localStorage.getItem('sicn_stride_length'));
    return Number.isFinite(saved) && saved >= 0.35 && saved <= 1.2 ? saved : 0.72;
  });
  // Walked distance belongs to one segment of one route: if the route or the
  // active segment changes elsewhere (QR scan, stepper, AR view) it restarts at 0.
  const [walkProgress, setWalkProgress] = useState({ routeResult: null, index: 0, meters: 0 });
  const walkedMeters = walkProgress.routeResult === routeResult && walkProgress.index === activeStepIndex
    ? walkProgress.meters
    : 0;
  const setWalkedMeters = useCallback(
    (meters, index = activeStepIndex) => setWalkProgress({ routeResult, index, meters }),
    [routeResult, activeStepIndex]
  );
  // How the last detected step related to the route: forward, backward or sideways.
  const [stepState, setStepState] = useState({ routeResult: null, direction: 'forward' });
  const stepDirection = stepState.routeResult === routeResult ? stepState.direction : 'forward';
  const [calibrationStartSteps, setCalibrationStartSteps] = useState(null);

  // Search & Route Planner UI state
  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showRoutePlanner, setShowRoutePlanner] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [showFloorPlan, setShowFloorPlan] = useState(false);
  const [autoScannerOpen, setAutoScannerOpen] = useState(false);
  const [confirmedTransition, setConfirmedTransition] = useState(null);
  const [headingUp, setHeadingUp] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [routeDeviation, setRouteDeviation] = useState(false);
  const headingDeviationCountRef = useRef(0);

  const transitionPromptRef = useRef(null);
  const handlePdrStep = useCallback((step) => {
    if (calibrationStartSteps !== null || !routeResult?.path?.length) return;
    // The AR view tracks steps itself while it is open.
    if (isARMode && routeResult.path.length >= 2) return;
    // A step only moves the position forward when the phone faces along the
    // route; facing back along it walks the position back, facing across holds.
    const progress = applyPdrStep(routeResult, activeStepIndex, walkedMeters, strideLengthMeters, {
      heading: step?.heading ?? null,
      mapNorthHeading,
    });
    setStepState({ routeResult, direction: progress.direction });
    if (progress.direction === 'sideways') return;
    if (progress.segmentIndex !== activeStepIndex) {
      setActiveStepIndex(progress.segmentIndex);
      transitionPromptRef.current = null;
    }
    setWalkedMeters(progress.walkedMeters, progress.segmentIndex);
    if (progress.blockedByTransition) {
      const edge = routeResult.edges?.[progress.segmentIndex];
      if (edge?.edgeId && transitionPromptRef.current !== edge.edgeId) {
        transitionPromptRef.current = edge.edgeId;
        const from = routeResult.path[progress.segmentIndex];
        const to = routeResult.path[progress.segmentIndex + 1];
        const originAlreadyConfirmed = confirmedTransition?.originNodeId === from?.nodeId &&
          confirmedTransition?.destinationNodeId === to?.nodeId;
        showToast(
          originAlreadyConfirmed
            ? `Origin confirmed. Continue to Floor ${to?.floor} and scan the matching destination QR.`
            : 'You are at a floor transition. Scan the origin QR, then the matching landing QR to continue.',
          'info'
        );
      }
    }
  }, [calibrationStartSteps, routeResult, isARMode, activeStepIndex, walkedMeters, strideLengthMeters, mapNorthHeading, confirmedTransition, setActiveStepIndex, setWalkedMeters, showToast]);

  const { heading, stepCount, status: sensorStatus, error: sensorError, startSensors } = usePhoneSensors(handlePdrStep);

  // The AR view can re-align the compass; keep the 2D map on the same value.
  useEffect(() => {
    const syncMapNorth = () => setSavedMapNorth(readSavedMapNorth());
    window.addEventListener(MAP_NORTH_CHANGE_EVENT, syncMapNorth);
    return () => window.removeEventListener(MAP_NORTH_CHANGE_EVENT, syncMapNorth);
  }, []);

  // Walking should be tracked on the 2D map without first finding a button:
  // start the compass and step sensors straight away where the browser allows
  // it, otherwise on the first tap (iOS only grants motion access from a tap).
  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return undefined;
    const needsGesture = typeof window.DeviceOrientationEvent.requestPermission === 'function'
      || typeof window.DeviceMotionEvent?.requestPermission === 'function';
    if (!needsGesture) {
      startSensors();
      return undefined;
    }
    const removeListeners = () => {
      window.removeEventListener('click', startOnGesture, true);
      window.removeEventListener('touchend', startOnGesture, true);
    };
    function startOnGesture() {
      removeListeners();
      startSensors();
    }
    window.addEventListener('click', startOnGesture, true);
    window.addEventListener('touchend', startOnGesture, true);
    return removeListeners;
  }, [startSensors]);

  // Admin Map Editor state
  const [adminEditMode, setAdminEditMode] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [clickedMapCoords, setClickedMapCoords] = useState({ x: 33, y: 21 });

  const searchResults = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q && !categoryFilter) return [];

    return nodes
      .filter((n) => {
        if (n.type === 'corridor') return false;
        if (categoryFilter && n.type !== categoryFilter) return false;
        if (!q) return true;
        return (
          n.name.toLowerCase().includes(q) ||
          n.nodeId.toLowerCase().includes(q) ||
          (n.metadata?.roomNumber || '').toLowerCase().includes(q) ||
          (n.metadata?.department || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [nodes, searchText, categoryFilter]);

  const handleSelectSearchDestination = (node) => {
    setWalkedMeters(0);
    setDestinationNodeId(node.nodeId);
    setSearchText('');
    setCategoryFilter('');
    setSearchFocused(false);
    computeRoute(startNodeId, node.nodeId, accessibleOnly, nodes);
    setSheetSnap(isDesktop ? 'half' : 'peek');
  };

  const handleMapNodeAction = (node, actionType) => {
    if (actionType === 'start') setWalkedMeters(0);
    if (actionType === 'admin_edit' && canEditMap) {
      setEditingNode(node);
      setAdminModalOpen(true);
      return;
    }

    if (actionType === 'start') {
      setStartNodeId(node.nodeId);
      setCurrentFloor(node.floor);
      broadcastCheckpoint(node.nodeId);
      showToast(`Start set to ${node.name}`, 'success');
      if (destinationNodeId) {
        computeRoute(node.nodeId, destinationNodeId, accessibleOnly, nodes);
      }
    } else {
      setDestinationNodeId(node.nodeId);
      computeRoute(startNodeId, node.nodeId, accessibleOnly, nodes);
      setSheetSnap(isDesktop ? 'half' : 'peek');
    }
  };

  const handleConfirmIndoorCheckpoint = (checkpoint) => {
    const validation = validateRouteCheckpoint(
      routeResult, activeStepIndex, checkpoint, currentFloor, confirmedTransition
    );
    if (!validation.valid) {
      showToast(validation.reason, 'error');
      return false;
    }

    setWalkedMeters(0);
    setRouteDeviation(false);
    headingDeviationCountRef.current = 0;
    transitionPromptRef.current = null;
    api.updateMyLocation(checkpoint.nodeId, checkpoint.qrValue).catch(() => {});
    broadcastCheckpoint(checkpoint.nodeId);

    // Confirming the origin proves the user reached the correct stair/lift
    // entrance. It must NOT change floors, reset the route, or move the
    // confirmed location to the destination landing.
    if (validation.stage === 'transition-origin') {
      const from = routeResult.path[activeStepIndex];
      const to = routeResult.path[activeStepIndex + 1];
      setConfirmedTransition({ originNodeId: from.nodeId, destinationNodeId: to.nodeId });
      showToast(`Staircase confirmed on Floor ${from.floor}. Continue to Floor ${to.floor} and scan the landing QR.`, 'success');
      return 'continue';
    }

    // Only the expected destination landing QR completes a floor transition.
    setConfirmedTransition(null);
    setActiveStepIndex(0);
    setStartNodeId(checkpoint.nodeId);
    // Landing confirmed: switch to the new floor and frame the rest of the route.
    if (Number(validation.floor) !== Number(currentFloor)) {
      setAutoFollow(false);
      if (!isDesktop) setSheetSnap('peek');
    }
    setCurrentFloor(validation.floor);
    if (destinationNodeId && checkpoint.nodeId !== destinationNodeId) {
      computeRoute(checkpoint.nodeId, destinationNodeId, accessibleOnly, nodes);
    } else if (checkpoint.nodeId === destinationNodeId) {
      clearRoute();
    }
    showToast(
      validation.stage === 'off-route-checkpoint'
        ? `Off-route checkpoint confirmed. Recalculating from ${checkpoint.name}.`
        : `Location confirmed: ${checkpoint.name}`,
      'success'
    );
    return true;
  };

  const handleEnableCompass = async () => {
    const enabled = await startSensors();
    if (enabled) showToast('Phone compass and motion sensors enabled', 'success');
    else showToast(sensorError || 'Phone sensors could not be enabled', 'error');
  };

  // With a route active, "calibrating" means: I am standing on the route and
  // facing along the blue line. Without a route it keeps the old meaning: the
  // top of the phone points to the top of the floor plan.
  const handleCalibrateNorth = () => {
    if (heading === null) {
      showToast('No compass reading yet. Hold the phone flat in front of you and try again.', 'info');
      return;
    }
    const routeBearing = routeResult ? getRouteSegmentBearing(routeResult, activeStepIndex, walkedMeters) : null;
    const nextNorth = getRouteAlignedNorth(routeBearing, heading) ?? heading;
    setMapNorthHeading(nextNorth);
    window.localStorage.setItem(MAP_NORTH_STORAGE_KEY, String(nextNorth));
    setStepState({ routeResult, direction: 'forward' });
    setRouteDeviation(false);
    headingDeviationCountRef.current = 0;
    showToast(
      routeBearing !== null
        ? 'Compass aligned: the way you are facing now is the route direction'
        : 'Map direction saved for this device',
      'success'
    );
  };

  const handleStrideCalibration = () => {
    if (calibrationStartSteps === null) {
      setCalibrationStartSteps(stepCount);
      showToast('Walk exactly 10 metres on a measured, straight corridor, then tap Finish 10m calibration.', 'info');
      return;
    }
    const measuredSteps = stepCount - calibrationStartSteps;
    if (measuredSteps < 5) {
      showToast('Not enough steps detected. Walk the measured 10 metres and try again.', 'error');
      return;
    }
    const calibratedStride = Math.max(0.35, Math.min(1.2, 10 / measuredSteps));
    setStrideLengthMeters(calibratedStride);
    window.localStorage.setItem('sicn_stride_length', String(calibratedStride));
    setCalibrationStartSteps(null);
    setWalkedMeters(0);
    showToast(`Walking distance calibrated: ${calibratedStride.toFixed(2)} m per step`, 'success');
  };

  const estimatedPosition = useMemo(() => {
    const interpolated = interpolateRoutePosition(routeResult, activeStepIndex, walkedMeters);
    if (interpolated) {
      const matched = matchPositionToRoute(interpolated, routeResult, {
        preferredSegmentIndex: activeStepIndex,
        maxDistance: 12,
      });
      return matched && matched.segmentIndex === activeStepIndex
        ? { ...interpolated, x: matched.x, y: matched.y, mapMatched: true }
        : interpolated;
    }
    const routeNode = routeResult?.path?.[Math.min(activeStepIndex, (routeResult.path.length || 1) - 1)];
    if (routeNode?.coordinates) return { floor: routeNode.floor, ...routeNode.coordinates, progress: 1 };
    if (startNodeObj?.coordinates) return { floor: startNodeObj.floor, ...startNodeObj.coordinates, progress: 0 };
    return null;
  }, [routeResult, activeStepIndex, walkedMeters, startNodeObj]);

  const activeRouteSegment = routeResult?.path?.[activeStepIndex] && routeResult?.path?.[activeStepIndex + 1]
    ? { from: routeResult.path[activeStepIndex], to: routeResult.path[activeStepIndex + 1] }
    : null;
  // Bearing of the traced walking line at the current progress (door connectors bend).
  const targetBearing = activeRouteSegment
    ? getRouteSegmentBearing(routeResult, activeStepIndex, walkedMeters)
      ?? getMapBearing(activeRouteSegment.from, activeRouteSegment.to)
    : null;
  const relativeTurn = heading !== null && targetBearing !== null
    ? getRelativeBearing(targetBearing, heading, mapNorthHeading)
    : null;

  const segmentDistance = routeResult ? getSegmentDistance(routeResult, activeStepIndex) : 0;
  const remainingDistance = Math.max(0, segmentDistance - walkedMeters);
  const isVerticalTransition = activeRouteSegment && activeRouteSegment.from.floor !== activeRouteSegment.to.floor;
  const nextTurnInstruction = getRouteTurnInstruction(routeResult, activeStepIndex);

  // A sustained heading mismatch is a deviation warning, not a false location fix.
  // The user confirms their actual position with a QR checkpoint before rerouting.
  useEffect(() => {
    if (!routeResult || sensorStatus !== 'active' || relativeTurn === null || isVerticalTransition) {
      headingDeviationCountRef.current = 0;
      return;
    }
    if (Math.abs(relativeTurn) >= 65) {
      headingDeviationCountRef.current += 1;
      if (headingDeviationCountRef.current >= 3) setRouteDeviation(true);
    } else {
      headingDeviationCountRef.current = 0;
      setRouteDeviation(false);
    }
  }, [stepCount, routeResult, sensorStatus, relativeTurn, isVerticalTransition]);
  const isRouteComplete = Boolean(routeResult?.path?.length && activeStepIndex >= routeResult.path.length - 1);

  const voice = useVoiceGuidance({
    routeResult,
    activeStepIndex,
    remainingMeters: sensorStatus === 'active' ? remainingDistance : Number.NaN,
    nextTurn: nextTurnInstruction,
    stepDirection,
    isRouteComplete,
    isVerticalTransition: Boolean(isVerticalTransition),
  });

  // While following, the map shows the floor the user is walking on.
  useEffect(() => {
    if (!autoFollow || !routeResult || !estimatedPosition || isVerticalTransition) return;
    const floor = Number(estimatedPosition.floor);
    if (Number.isFinite(floor) && floor !== Number(currentFloor)) setCurrentFloor(floor);
  }, [autoFollow, routeResult, estimatedPosition, isVerticalTransition, currentFloor, setCurrentFloor]);

  // Zoom buttons keep the map point at the centre of the screen in place.
  const zoomBy = (factor) => {
    const nextZoom = clampZoom(zoom * factor);
    if (nextZoom === zoom) return;
    setPan((current) => ({ x: current.x * (nextZoom / zoom), y: current.y * (nextZoom / zoom) }));
    setZoom(nextZoom);
  };

  const handleAdminMapClick = (coords) => {
    if (!canEditMap) return;
    setEditingNode(null);
    setClickedMapCoords(coords);
    setAdminModalOpen(true);
  };

  const handleSwapEndpoints = () => {
    if (!startNodeId || !destinationNodeId) return;
    const prevStart = startNodeId;
    const prevDest = destinationNodeId;
    setStartNodeId(prevDest);
    setDestinationNodeId(prevStart);
    computeRoute(prevDest, prevStart, accessibleOnly, nodes);
  };

  const groupedFloorNodes = useMemo(() => {
    return FLOOR_DEFS.map((fd) => ({
      ...fd,
      items: nodes.filter((n) => n.floor === fd.f),
    })).filter((g) => g.items.length > 0);
  }, [nodes]);

  const showAROverlay = Boolean(isARMode && routeResult?.path?.length >= 2);
  const floorDef = FLOOR_DEFS.find((item) => item.f === currentFloor) || FLOOR_DEFS[0];
  // On phones the fully expanded directions sheet covers the map.
  const sheetCoversMap = !isDesktop && Boolean(routeResult) && sheetSnap === 'full';
  // The floor picker scrolls instead of running into the map buttons below it.
  const floorDockRef = useRef(null);
  const floorDockTop = mapInsets.top + (isDesktop ? 4 : 10);
  const controlsHeight = 52 + 2 * (40 + 10) + (headingUp ? 50 : 0) + (isDesktop ? 91 : 0);
  const floorDockMaxHeight = Math.max(76, viewport.height - floorDockTop - (mapInsets.bottom + 12 + controlsHeight + 12));
  useEffect(() => {
    const active = floorDockRef.current?.querySelector('.is-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, [currentFloor, isDesktop, floorDockMaxHeight]);
  const sensorsOn = sensorStatus === 'active' || sensorStatus === 'compass-only';
  const showResults = (searchFocused || categoryFilter) && (searchResults.length > 0 || searchText.trim());

  const recenterOnMe = () => {
    const position = estimatedPosition;
    // Second tap while already following: switch to compass (heading-up) mode.
    if (autoFollow && position && heading !== null && routeResult) {
      setHeadingUp((value) => !value);
      return;
    }
    setAutoFollow(true);
    if (!position) {
      const home = getHomeView(mapInsets);
      setZoom(home.zoom);
      setPan(home.pan);
      return;
    }
    if (Number(position.floor) !== Number(currentFloor)) setCurrentFloor(Number(position.floor));
    const nextZoom = clampZoom(Math.max(zoom, 2.2));
    setZoom(nextZoom);
    setPan(panToCenter(projectX(position.x), projectY(position.y), nextZoom, viewport.width, viewport.height, mapInsets));
  };

  const fitBuilding = () => {
    const home = getHomeView(mapInsets);
    setAutoFollow(false);
    setZoom(home.zoom);
    setPan(home.pan);
  };

  const tools = [
    { key: 'ar', label: 'AR Live View', icon: Camera, onClick: launchARLiveView, description: 'Camera guidance with direction arrows' },
    { key: 'qr', label: autoScannerOpen ? 'QR scanning on' : 'Scan QR checkpoint', icon: QrCode, active: autoScannerOpen, onClick: () => setAutoScannerOpen((open) => !open) },
    { key: 'share', label: roomCode ? `Live #${roomCode}` : 'Share location', icon: Share2, active: Boolean(roomCode), onClick: () => setIsShareOpen(true) },
    {
      key: 'compass',
      label: sensorsOn ? (routeResult ? 'Align compass' : savedMapNorth === null ? 'Calibrate compass' : 'Recalibrate compass') : 'Enable compass',
      icon: Compass,
      onClick: sensorsOn ? handleCalibrateNorth : handleEnableCompass,
      description: sensorsOn
        ? (routeResult ? 'Stand on the route, face along the blue line, then tap' : 'Point the top of the phone toward the top of the floor plan, then tap')
        : 'Enable phone compass and motion sensors',
    },
    { key: 'heading', label: headingUp ? 'Heading up' : 'North up', icon: Navigation, active: headingUp, disabled: heading === null || !routeResult, onClick: () => setHeadingUp((value) => !value) },
    { key: 'follow', label: autoFollow ? 'Follow on' : 'Follow off', icon: LocateFixed, active: autoFollow, disabled: !routeResult, onClick: () => setAutoFollow((value) => !value) },
    {
      key: 'steps',
      label: calibrationStartSteps !== null ? 'Finish 10 m walk' : `Step length ${strideLengthMeters.toFixed(2)} m`,
      icon: Footprints,
      active: calibrationStartSteps !== null,
      disabled: sensorStatus !== 'active',
      onClick: handleStrideCalibration,
      description: 'Walk a measured 10 metres to calibrate your step length',
    },
    ...(voice.supported
      ? [{ key: 'voice', label: voice.enabled ? 'Voice on' : 'Voice off', icon: voice.enabled ? Volume2 : VolumeX, active: voice.enabled, onClick: () => voice.setEnabled((value) => !value), description: 'Spoken turn-by-turn directions' }]
      : []),
    { key: 'plan', label: 'Architectural plan', icon: FileText, onClick: () => setShowFloorPlan(true) },
    { key: 'accessible', label: 'Step-free route', icon: Accessibility, active: accessibleOnly, onClick: () => setAccessibleOnly(!accessibleOnly) },
    ...(canEditMap
      ? [
        { key: 'edit', label: adminEditMode ? 'Exit map editor' : 'Edit map', icon: Wrench, tone: 'warning', active: adminEditMode, onClick: () => setAdminEditMode(!adminEditMode) },
        {
          key: 'add',
          label: 'Add node',
          icon: Plus,
          tone: 'warning',
          onClick: () => {
            setEditingNode(null);
            setClickedMapCoords({ x: 33, y: 21 });
            setAdminModalOpen(true);
          },
        },
      ]
      : []),
  ];

  const categoryChips = (
    <div className="sicn-chip-row no-scrollbar" role="toolbar" aria-label="Place categories">
      {CATEGORY_CHIPS.map((cat) => {
        const Icon = cat.icon;
        const active = categoryFilter === cat.type;
        return (
          <button
            key={cat.type}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setCategoryFilter((prev) => (prev === cat.type ? '' : cat.type));
              setSearchFocused(true);
              setShowRoutePlanner(false);
            }}
            className={`sicn-chip ${active ? 'is-active' : ''}`}
          >
            <Icon size={14} />
            <span>{cat.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={accessibleOnly}
        onClick={() => setAccessibleOnly(!accessibleOnly)}
        className={`sicn-chip ${accessibleOnly ? 'is-active is-green' : ''}`}
      >
        <Accessibility size={14} />
        <span>Step-free</span>
      </button>
    </div>
  );

  const searchBox = (
    <div className="sicn-searchbox">
      {searchFocused || searchText || categoryFilter ? (
        <button
          type="button"
          aria-label="Close search"
          onClick={() => {
            setSearchText('');
            setCategoryFilter('');
            setSearchFocused(false);
          }}
          className="sicn-icon-btn"
        >
          <ArrowLeft size={19} />
        </button>
      ) : (
        <span className="sicn-search-glyph" aria-hidden="true"><Search size={18} /></span>
      )}
      <input
        type="search"
        value={searchText}
        onFocus={() => setSearchFocused(true)}
        onChange={(e) => setSearchText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && searchResults[0]) handleSelectSearchDestination(searchResults[0]);
          if (e.key === 'Escape') {
            setSearchFocused(false);
            e.currentTarget.blur();
          }
        }}
        placeholder="Search rooms, labs, offices…"
        aria-label="Search campus places"
        className="sicn-search-input"
      />
      {searchText && (
        <button type="button" aria-label="Clear search" onClick={() => setSearchText('')} className="sicn-icon-btn">
          <X size={17} />
        </button>
      )}
      <span className="sicn-search-divider" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setShowRoutePlanner(true)}
        title="Directions"
        aria-label="Directions"
        className="sicn-icon-btn text-blue-600"
      >
        <Navigation size={18} />
      </button>
      <button
        type="button"
        onClick={() => navigate('/profile')}
        title={`Signed in role: ${effectiveRole}`}
        aria-label="Account"
        className="sicn-avatar-btn"
        style={{ backgroundColor: user?.avatarColor || '#334155' }}
      >
        {user?.name ? user.name[0].toUpperCase() : 'G'}
      </button>
    </div>
  );

  const resultsList = showResults && (
    <div className="sicn-results" role="listbox" aria-label="Search results">
      {searchResults.length === 0 && (
        <p className="px-4 py-5 text-center text-xs text-slate-500">No places match “{searchText.trim()}”.</p>
      )}
      {searchResults.map((n) => {
        const Icon = getPlaceIcon(n.type);
        return (
          <button
            key={n.nodeId}
            type="button"
            role="option"
            aria-selected="false"
            onClick={() => handleSelectSearchDestination(n)}
            className="sicn-result-row"
          >
            <span className="sicn-result-icon"><Icon size={16} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-slate-900">{n.name}</span>
              <span className="block truncate text-[11px] text-slate-500">
                {n.floor === 0 ? 'Ground Floor' : `Floor ${n.floor}`} · {n.type}
                {n.metadata?.department ? ` · ${n.metadata.department}` : ''}
              </span>
            </span>
            <span className="sicn-result-go" aria-hidden="true"><Navigation size={14} /></span>
          </button>
        );
      })}
    </div>
  );

  const routePlanner = (
    <div className="sicn-route-planner animate-fade-in">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setShowRoutePlanner(false)} aria-label="Back" className="sicn-icon-btn">
          <ArrowLeft size={19} />
        </button>
        <span className="text-[13px] font-extrabold text-slate-800">Directions</span>
        <button
          type="button"
          onClick={() => setAccessibleOnly(!accessibleOnly)}
          aria-pressed={accessibleOnly}
          title="Step-free route (lifts and ramps only)"
          className={`sicn-icon-btn ${accessibleOnly ? 'bg-emerald-50 text-emerald-700' : ''}`}
        >
          <Accessibility size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="sicn-route-dots" aria-hidden="true">
          <span className="is-start" />
          <i />
          <span className="is-end" />
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-1.5">
            <select
              value={startNodeId}
              aria-label="Start"
              onChange={(e) => {
                const val = e.target.value;
                setWalkedMeters(0);
                setActiveStepIndex(0);
                setStartNodeId(val);
                broadcastCheckpoint(val);
                if (destinationNodeId) {
                  computeRoute(val, destinationNodeId, accessibleOnly, nodes);
                }
              }}
              className="sicn-route-field"
            >
              {groupedFloorNodes.map((group) => (
                <optgroup key={group.f} label={group.fullLabel}>
                  {group.items.map((n) => (
                    <option key={n.nodeId} value={n.nodeId}>
                      {n.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAutoScannerOpen(true)}
              title="Set start by scanning a QR checkpoint"
              aria-label="Scan QR checkpoint"
              className="sicn-icon-btn bg-indigo-50 text-indigo-700"
            >
              <QrCode size={16} />
            </button>
          </div>
          <select
            value={destinationNodeId}
            aria-label="Destination"
            onChange={(e) => {
              const val = e.target.value;
              setDestinationNodeId(val);
              if (val) {
                computeRoute(startNodeId, val, accessibleOnly, nodes);
                setSheetSnap(isDesktop ? 'half' : 'peek');
              }
            }}
            className="sicn-route-field"
          >
            <option value="">Choose destination</option>
            {[...groupedFloorNodes].reverse().map((group) => (
              <optgroup key={group.f} label={group.fullLabel}>
                {group.items.map((n) => (
                  <option key={n.nodeId} value={n.nodeId}>
                    {n.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button type="button" onClick={handleSwapEndpoints} title="Swap start and destination" aria-label="Swap start and destination" className="sicn-icon-btn">
          <ArrowUpDown size={18} />
        </button>
      </div>

      {!routeResult && (
        <button
          type="button"
          onClick={() => {
            computeRoute(startNodeId, destinationNodeId, accessibleOnly, nodes);
            if (!isDesktop) setShowRoutePlanner(false);
            setSheetSnap(isDesktop ? 'half' : 'peek');
          }}
          disabled={routeLoading || !destinationNodeId}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold py-2.5 rounded-full shadow-sm transition disabled:opacity-50"
        >
          {routeLoading ? 'Finding the best route…' : 'Get directions'}
        </button>
      )}
    </div>
  );

  const guidanceBanner = routeResult && (
    <div className="sicn-guidance" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="sicn-guidance-icon" aria-hidden="true">
          {isRouteComplete ? <MapPin size={22} /> : isVerticalTransition ? <Layers size={22} /> : relativeTurn !== null && Math.abs(relativeTurn) > 18
            ? <CornerUpRight size={22} style={relativeTurn < 0 ? { transform: 'scaleX(-1)' } : undefined} />
            : <ArrowUp size={22} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold leading-snug pr-1">
            {isRouteComplete
              ? 'You have arrived'
              : isVerticalTransition
                ? `Reach ${activeRouteSegment.to.name}, then scan the landing QR`
                : relativeTurn === null
                  ? `Head to ${activeRouteSegment?.to?.name || destNodeObj?.name || 'the next point'}`
                  : Math.abs(relativeTurn) <= 18
                    ? 'Walk straight'
                    : relativeTurn > 0
                      ? `Turn right ${Math.round(Math.abs(relativeTurn))}°`
                      : `Turn left ${Math.round(Math.abs(relativeTurn))}°`}
          </div>
          <div className="mt-0.5 text-[11px] text-white/75">
            {sensorStatus === 'active' ? `${remainingDistance.toFixed(1)} m to next point` : heading === null ? 'Compass off · tap the tools button to enable' : `Facing ${Math.round(heading)}°`}
            {savedMapNorth === null ? '' : ' · compass aligned'}
          </div>
          {nextTurnInstruction && !isVerticalTransition && !isRouteComplete && (
            <div className="mt-1 text-[11px] font-semibold text-white/85">
              Then {nextTurnInstruction.type === 'u-turn' ? 'U-turn' : `turn ${nextTurnInstruction.type}`} at {nextTurnInstruction.atNodeName || nextTurnInstruction.atNodeId}
            </div>
          )}
          {sensorError && <div className="mt-1 text-[10px] text-amber-200">{sensorError}</div>}
        </div>
        {voice.supported && (
          <button
            type="button"
            onClick={() => voice.setEnabled((value) => !value)}
            aria-pressed={voice.enabled}
            aria-label={voice.enabled ? 'Mute voice guidance' : 'Turn on voice guidance'}
            title={voice.enabled ? 'Mute voice guidance' : 'Turn on voice guidance'}
            className="sicn-guidance-voice"
          >
            {voice.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        )}
      </div>
      {stepDirection !== 'forward' && !isVerticalTransition && !isRouteComplete && (
        <div className="sicn-guidance-alert is-danger">
          <span className="flex-1">
            {stepDirection === 'backward'
              ? 'Wrong direction — turn around and follow the blue line.'
              : 'You are walking across the route. Turn to follow the blue line.'}
          </span>
          <button type="button" onClick={handleCalibrateNorth}>Align compass</button>
        </div>
      )}
      {routeDeviation && (
        <div className="sicn-guidance-alert">
          <span className="flex-1">Heading differs from the route. Confirm your position at the nearest QR checkpoint.</span>
          <button type="button" onClick={() => setAutoScannerOpen(true)}>Scan QR</button>
        </div>
      )}
    </div>
  );

  const directionsProps = {
    routeResult,
    startNode: startNodeObj,
    destinationNode: destNodeObj,
    snap: sheetSnap,
    setSnap: setSheetSnap,
    onClearRoute: clearRoute,
    onSwitchFloor: (f) => setCurrentFloor(f),
    accessibleOnly,
    isARMode,
    onLaunchAR: () => (isARMode ? fallbackTo2DMap() : launchARLiveView()),
    activeStepIndex,
    onSelectStep: (idx) => { setWalkedMeters(0); setActiveStepIndex(idx); },
  };

  return (
    <div className={`sicn-map-page fixed inset-0 w-full h-[100dvh] overflow-hidden bg-slate-100 ${isDesktop ? 'is-desktop' : 'is-mobile'}`}>
      {showAROverlay ? (
        <ARView />
      ) : (
        <FloorMap
          floor={currentFloor}
          floorLabel={floorDef.fullLabel}
          nodes={nodes}
          edges={edges}
          routeResult={routeResult}
          startNode={startNodeObj}
          destinationNode={destNodeObj}
          friends={friendsInRoom}
          zoom={zoom}
          setZoom={setZoom}
          userPosition={estimatedPosition}
          userHeading={heading}
          mapNorthHeading={mapNorthHeading}
          navigationActive={Boolean(routeResult)}
          headingUp={headingUp}
          autoFollow={autoFollow}
          onUserPan={() => setAutoFollow(false)}
          pan={pan}
          setPan={setPan}
          uiInsets={mapInsets}
          schedule={schedule}
          adminEditMode={canEditMap && adminEditMode}
          onSelectNode={handleMapNodeAction}
          onAdminMapClick={handleAdminMapClick}
          onSwitchFloor={(f) => setCurrentFloor(f)}
        />
      )}

      {/* ===================== Desktop: docked side panel ===================== */}
      {!showAROverlay && isDesktop && (
        <>
          <aside
            className={`sicn-side-panel ${panelOpen ? 'is-open' : 'is-closed'}`}
            style={{ width: panelWidth }}
            aria-label="Search and directions"
            aria-hidden={!panelOpen}
          >
            <div className="sicn-side-panel-head">
              {showRoutePlanner || routeResult ? routePlanner : searchBox}
              {!showRoutePlanner && !routeResult && categoryChips}
            </div>
            <div className="sicn-side-panel-body">
              {routeResult ? (
                <DirectionsBottomSheet {...directionsProps} variant="panel" />
              ) : showResults ? (
                resultsList
              ) : (
                <div className="sicn-panel-empty">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Explore {floorDef.fullLabel}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {CATEGORY_CHIPS.map((cat) => {
                      const Icon = cat.icon;
                      return (
                        <button
                          key={cat.type}
                          type="button"
                          onClick={() => { setCategoryFilter(cat.type); setSearchFocused(true); }}
                          className="sicn-explore-tile"
                        >
                          <Icon size={17} />
                          <span>{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                    Tap a room on the map to see it, or search above. Drag to move the map, scroll to zoom, double-click to zoom in.
                  </p>
                </div>
              )}
            </div>
          </aside>
          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            className="sicn-panel-toggle"
            style={{ left: (panelOpen ? DESKTOP_RAIL_WIDTH + 12 + panelWidth : DESKTOP_RAIL_WIDTH + 12) }}
            aria-label={panelOpen ? 'Collapse side panel' : 'Expand side panel'}
            title={panelOpen ? 'Collapse side panel' : 'Expand side panel'}
          >
            {panelOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
          {!panelOpen && (
            <div className="sicn-collapsed-search" style={{ left: DESKTOP_RAIL_WIDTH + 44 }}>
              {searchBox}
              {resultsList}
            </div>
          )}
          {guidanceBanner && (
            <div className="sicn-guidance-wrap" style={{ left: mapInsets.left + 12 }}>
              {guidanceBanner}
            </div>
          )}
        </>
      )}

      {/* ===================== Phone: search on top ===================== */}
      {!showAROverlay && !isDesktop && (
        <header className="sicn-mobile-top">
          {routeResult && !showRoutePlanner && !searchFocused ? (
            guidanceBanner
          ) : showRoutePlanner ? (
            routePlanner
          ) : (
            <>
              <div className="sicn-search-card">
                {searchBox}
                {resultsList}
              </div>
              {!showResults && categoryChips}
            </>
          )}
        </header>
      )}

      {/* ===================== Floor picker ===================== */}
      {!showAROverlay && !sheetCoversMap && (
        <div
          ref={floorDockRef}
          className="sicn-floor-dock"
          style={{ top: floorDockTop, maxHeight: floorDockMaxHeight }}
          role="radiogroup"
          aria-label="Floor"
        >
          {[...FLOOR_DEFS].reverse().map((item) => {
            const active = currentFloor === item.f;
            const hasRouteOnFloor = routeResult?.floorsCovered?.includes(item.f);
            return (
              <button
                key={item.f}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  if (routeResult) setAutoFollow(false);
                  setCurrentFloor(item.f);
                }}
                title={item.fullLabel}
                className={`sicn-floor-btn ${active ? 'is-active' : ''}`}
              >
                {item.shortLabel}
                {hasRouteOnFloor && !active && <span className="sicn-floor-route-dot" />}
              </button>
            );
          })}
        </div>
      )}

      {/* ===================== Map controls (bottom right) ===================== */}
      {!showAROverlay && !sheetCoversMap && (
        <div className="sicn-map-controls" style={{ bottom: mapInsets.bottom + 12 }}>
          {headingUp && (
            <button type="button" onClick={() => setHeadingUp(false)} className="sicn-fab sicn-fab-sm" title="Back to north up" aria-label="Reset map rotation">
              <Compass size={18} style={{ transform: heading !== null ? `rotate(${mapNorthHeading - heading}deg)` : undefined }} />
            </button>
          )}
          <button type="button" onClick={() => setToolsOpen(true)} className="sicn-fab sicn-fab-sm" title="Map tools" aria-label="Map tools">
            <Layers size={18} />
          </button>
          {isDesktop && (
            <div className="sicn-zoom-group">
              <button type="button" onClick={() => zoomBy(1.4)} title="Zoom in" aria-label="Zoom in">
                <Plus size={18} />
              </button>
              <span aria-hidden="true" />
              <button type="button" onClick={() => zoomBy(1 / 1.4)} title="Zoom out" aria-label="Zoom out">
                <Minus size={18} />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={fitBuilding}
            className="sicn-fab sicn-fab-sm"
            title="Show whole building"
            aria-label="Show whole building"
          >
            <Maximize2 size={17} />
          </button>
          <button
            type="button"
            onClick={recenterOnMe}
            className={`sicn-fab sicn-fab-locate ${autoFollow && estimatedPosition ? 'is-following' : ''} ${headingUp ? 'is-heading' : ''}`}
            title={estimatedPosition ? 'Show my position' : 'Recenter map'}
            aria-label={estimatedPosition ? 'Show my position' : 'Recenter map'}
          >
            {headingUp ? <Navigation size={20} fill="currentColor" /> : <LocateFixed size={20} />}
          </button>
        </div>
      )}

      {/* Re-open the route sheet on phones after it was closed */}
      {!showAROverlay && !isDesktop && routeResult && sheetSnap === 'closed' && (
        <button
          type="button"
          onClick={() => setSheetSnap('peek')}
          className="sicn-reopen-route"
        >
          <Navigation size={14} />
          <span>Route · {routeResult.estimatedTimeMinutes} min ({routeResult.totalDistance} m)</span>
        </button>
      )}

      {!showAROverlay && !isDesktop && <DirectionsBottomSheet {...directionsProps} variant="sheet" />}

      {!showAROverlay && (
        <IndoorCheckpointScanner
          enabled={autoScannerOpen}
          onClose={() => setAutoScannerOpen(false)}
          onConfirm={handleConfirmIndoorCheckpoint}
        />
      )}

      {!showAROverlay && showFloorPlan && (
        <FloorPlanCalibrationViewer
          floor={currentFloor}
          nodes={nodes}
          routeResult={routeResult}
          userPosition={estimatedPosition}
          adminEnabled={canEditMap}
          onClose={() => setShowFloorPlan(false)}
        />
      )}

      <MapToolsSheet open={toolsOpen} onClose={() => setToolsOpen(false)} tools={tools} />

      <ShareLocationSheet
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

      {canEditMap && (
        <AdminNodeModal
          isOpen={adminModalOpen}
          onClose={() => setAdminModalOpen(false)}
          editingNode={editingNode}
          initialCoords={clickedMapCoords}
          currentFloor={currentFloor}
          allNodes={nodes}
          onSaved={async () => {
            const { fetchedNodes } = await refreshMapData();
            showToast('Map graph updated successfully!', 'success');
            if (startNodeId && destinationNodeId) {
              computeRoute(startNodeId, destinationNodeId, accessibleOnly, fetchedNodes);
            }
          }}
        />
      )}
    </div>
  );
}
