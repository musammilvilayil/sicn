import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Navigation,
  ArrowUpDown,
  QrCode,
  Share2,
  Accessibility,
  ZoomIn,
  ZoomOut,
  LocateFixed,
  Wrench,
  X,
  Plus,
  Sparkles,
  Camera,
  Compass,
  Footprints,
  FileText,
} from 'lucide-react';
import FloorMap from '../components/FloorMap';
import ARView from '../components/ARView';
import DirectionsBottomSheet from '../components/DirectionsBottomSheet';
import ShareLocationSheet from '../components/ShareLocationSheet';
import AdminNodeModal from '../components/AdminNodeModal';
import IndoorCheckpointScanner from '../components/IndoorCheckpointScanner';
import { api } from '../services/api';
import { useNavigation } from '../context/NavigationContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { FLOOR_PLANS } from '../config/floorPlans';
import usePhoneSensors from '../hooks/usePhoneSensors';
import { getMapBearing, getRelativeBearing, getSegmentDistance, interpolateRoutePosition, validateRouteCheckpoint } from '../utils/indoorNavigation';

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

  const { user, effectiveRole, canEditMap } = useAuth();
  const { roomCode, roomMembers, friendsInRoom, broadcastCheckpoint } = useSocket();

  // Map camera state
  const [zoom, setZoom] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 1.12 : 1));
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mapNorthHeading, setMapNorthHeading] = useState(() => {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem('sicn_map_north_heading');
    return saved !== null && Number.isFinite(Number(saved)) ? Number(saved) : null;
  });
  const [strideLengthMeters, setStrideLengthMeters] = useState(() => {
    if (typeof window === 'undefined') return 0.72;
    const saved = Number(window.localStorage.getItem('sicn_stride_length'));
    return Number.isFinite(saved) && saved >= 0.35 && saved <= 1.2 ? saved : 0.72;
  });
  const [walkProgress, setWalkProgress] = useState({ routeResult: null, meters: 0 });
  const walkedMeters = walkProgress.routeResult === routeResult ? walkProgress.meters : 0;
  const setWalkedMeters = useCallback((meters) => setWalkProgress({ routeResult, meters }), [routeResult]);
  const [calibrationStartSteps, setCalibrationStartSteps] = useState(null);

  const handlePdrStep = useCallback(() => {
    if (calibrationStartSteps !== null || !routeResult?.path?.length) return;
    const from = routeResult.path[activeStepIndex];
    const to = routeResult.path[activeStepIndex + 1];
    const edge = routeResult.edges?.[activeStepIndex];
    if (!from || !to || from.floor !== to.floor || ['stairs', 'lift'].includes(edge?.type)) return;
    const distance = getSegmentDistance(routeResult, activeStepIndex);
    if (distance <= 0) return;
    const nextDistance = walkedMeters + strideLengthMeters;
    if (nextDistance >= distance) {
      setActiveStepIndex((index) => Math.min(index + 1, routeResult.path.length - 1));
      setWalkedMeters(0);
    } else {
      setWalkedMeters(nextDistance);
    }
  }, [calibrationStartSteps, routeResult, activeStepIndex, walkedMeters, strideLengthMeters, setActiveStepIndex, setWalkedMeters]);

  const { heading, stepCount, status: sensorStatus, error: sensorError, startSensors } = usePhoneSensors(handlePdrStep);

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

  // Admin Map Editor state
  const [adminEditMode, setAdminEditMode] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [clickedMapCoords, setClickedMapCoords] = useState({ x: 50, y: 50 });

  const searchResults = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q && !categoryFilter) return [];

    return nodes
      .filter((n) => {
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
    setSheetSnap('half');
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
      setSheetSnap('half');
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
    setCurrentFloor(validation.floor);
    if (destinationNodeId && checkpoint.nodeId !== destinationNodeId) {
      computeRoute(checkpoint.nodeId, destinationNodeId, accessibleOnly, nodes);
    } else if (checkpoint.nodeId === destinationNodeId) {
      clearRoute();
    }
    showToast(`Location confirmed: ${checkpoint.name}`, 'success');
    return true;
  };

  const handleEnableCompass = async () => {
    const enabled = await startSensors();
    if (enabled) showToast('Phone compass and motion sensors enabled', 'success');
    else showToast(sensorError || 'Phone sensors could not be enabled', 'error');
  };

  const handleCalibrateNorth = () => {
    if (heading === null) {
      showToast('Enable the phone compass first. Point the top of your phone toward the North direction marked on the floor plan.', 'info');
      return;
    }
    setMapNorthHeading(heading);
    window.localStorage.setItem('sicn_map_north_heading', String(heading));
    showToast('North reference saved for this device', 'success');
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
    if (interpolated) return interpolated;
    const routeNode = routeResult?.path?.[Math.min(activeStepIndex, (routeResult.path.length || 1) - 1)];
    if (routeNode?.coordinates) return { floor: routeNode.floor, ...routeNode.coordinates, progress: 1 };
    if (startNodeObj?.coordinates) return { floor: startNodeObj.floor, ...startNodeObj.coordinates, progress: 0 };
    return null;
  }, [routeResult, activeStepIndex, walkedMeters, startNodeObj]);

  const activeRouteSegment = routeResult?.path?.[activeStepIndex] && routeResult?.path?.[activeStepIndex + 1]
    ? { from: routeResult.path[activeStepIndex], to: routeResult.path[activeStepIndex + 1] }
    : null;
  const targetBearing = activeRouteSegment ? getMapBearing(activeRouteSegment.from, activeRouteSegment.to) : null;
  const relativeTurn = heading !== null && targetBearing !== null
    ? getRelativeBearing(targetBearing, heading, mapNorthHeading ?? 0)
    : null;
  const segmentDistance = routeResult ? getSegmentDistance(routeResult, activeStepIndex) : 0;
  const remainingDistance = Math.max(0, segmentDistance - walkedMeters);
  const isVerticalTransition = activeRouteSegment && activeRouteSegment.from.floor !== activeRouteSegment.to.floor;
  const isRouteComplete = Boolean(routeResult?.path?.length && activeStepIndex >= routeResult.path.length - 1);

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

  return (
    <div className="sicn-map-page fixed inset-0 w-full h-[100dvh] overflow-hidden bg-slate-100">
      {/* ======================================================== */}
      {/* AR CAMERA NAVIGATION MODE OR 2D FLOOR MAP FALLBACK       */}
      {/* ======================================================== */}
      {showAROverlay ? (
        <ARView />
      ) : (
        <FloorMap
          floor={currentFloor}
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
          mapNorthHeading={mapNorthHeading ?? 0}
          navigationActive={Boolean(routeResult)}
          headingUp={headingUp}
          autoFollow={autoFollow}
          onUserPan={() => setAutoFollow(false)}
          pan={pan}
          setPan={setPan}
          adminEditMode={canEditMap && adminEditMode}
          onSelectNode={handleMapNodeAction}
          onAdminMapClick={handleAdminMapClick}
          onSwitchFloor={(f) => setCurrentFloor(f)}
        />
      )}

      {/* ======================================================== */}
      {/* FLOATING TOP SEARCH BAR & ROUTE PLANNER (GOOGLE MAPS UI) */}
      {/* ======================================================== */}
      {!showAROverlay && (
      <header className="fixed top-3 inset-x-3 md:left-[260px] md:right-auto md:w-[410px] z-30 pointer-events-none space-y-2 sicn-map-search">
        {!showRoutePlanner ? (
          /* Collapsed Google Maps Search Pill */
          <div className="pointer-events-auto bg-white/95 backdrop-blur-xl rounded-3xl shadow-[0_8px_28px_rgba(15,23,42,0.14)] border border-slate-200/90 overflow-hidden">
            <div className="flex items-center gap-2 px-3.5 py-2.5">
              <Search size={18} className="text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchText}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search rooms, Seminar Hall, Class 501, CAD Lab..."
                className="flex-1 bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none min-w-0"
              />

              {(searchText || categoryFilter) && (
                <button
                  onClick={() => {
                    setSearchText('');
                    setCategoryFilter('');
                    setSearchFocused(false);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}

              <button
                onClick={() => setShowRoutePlanner(true)}
                title="Open Start & Destination Planner"
                className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition shrink-0"
              >
                <Navigation size={15} />
              </button>

              <button
                onClick={() => navigate('/profile')}
                title={`Signed in role: ${effectiveRole}`}
                className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-xs"
                style={{ backgroundColor: user?.avatarColor || '#334155' }}
              >
                {user?.name ? user.name[0].toUpperCase() : 'V'}
              </button>
            </div>

            {/* Instant Search Autocomplete Results */}
            {(searchFocused || categoryFilter) && searchResults.length > 0 && (
              <div className="border-t border-slate-100 max-h-64 overflow-y-auto divide-y divide-slate-100">
                {searchResults.map((n) => (
                  <button
                    key={n.nodeId}
                    onClick={() => handleSelectSearchDestination(n)}
                    className="w-full px-4 py-2.5 text-left hover:bg-blue-50/70 flex items-center justify-between gap-2 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">{n.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {n.floor === 0 ? 'Ground Floor' : `Floor ${n.floor}`} • {n.type}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-blue-600 shrink-0">
                      Route →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Expanded Google Maps Origin -> Destination Card */
          <div className="pointer-events-auto bg-white/98 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200 p-3.5 space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Indoor Route Planner
              </span>
              <button
                onClick={() => setShowRoutePlanner(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-2 min-w-0">
                {/* Start Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <select
                    value={startNodeId}
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
                    className="flex-1 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 truncate focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    onClick={() => setAutoScannerOpen(true)}
                    title="Scan QR Checkpoint"
                    className="p-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 shrink-0"
                  >
                    <QrCode size={15} />
                  </button>
                </div>

                {/* Destination Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                  <select
                    value={destinationNodeId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDestinationNodeId(val);
                      if (val) {
                        computeRoute(startNodeId, val, accessibleOnly, nodes);
                        setSheetSnap('half');
                      }
                    }}
                    className="flex-1 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 truncate focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select destination...</option>
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
              </div>

              <button
                onClick={handleSwapEndpoints}
                title="Swap Start & Destination"
                className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition shrink-0"
              >
                <ArrowUpDown size={16} />
              </button>
            </div>

            <button
              onClick={() => {
                computeRoute(startNodeId, destinationNodeId, accessibleOnly, nodes);
                setShowRoutePlanner(false);
                setSheetSnap('half');
              }}
              disabled={routeLoading || !destinationNodeId}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl shadow transition disabled:opacity-50"
            >
              {routeLoading ? 'Calculating Optimal Path...' : 'Show Route & Directions'}
            </button>
          </div>
        )}

        {/* Horizontal Scrollable Google Maps Quick Action Chips */}
        <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {/* AR Live View Camera Navigation Quick Button */}
          <button
            onClick={launchARLiveView}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-md border bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 transition"
          >
            <Camera size={13} />
            <span>AR Live View</span>
          </button>

          <button
            onClick={() => setAutoScannerOpen((open) => !open)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-md border transition ${
              autoScannerOpen ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white/95 text-slate-800 border-slate-200 hover:bg-slate-50'
            }`}
            title="Enable automatic QR checkpoint detection"
          >
            <QrCode size={13} />
            <span>{autoScannerOpen ? 'QR Scanning On' : 'Auto QR Checkpoints'}</span>
          </button>

          <button
            onClick={sensorStatus === 'active' || sensorStatus === 'compass-only' ? handleCalibrateNorth : handleEnableCompass}
            title={sensorStatus === 'active' || sensorStatus === 'compass-only' ? 'Point the phone toward the floor plan North arrow, then calibrate' : 'Enable phone compass and motion sensors'}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-md border bg-white/95 text-slate-800 border-slate-200 hover:bg-slate-50 transition"
          >
            <Compass size={13} />
            <span>{sensorStatus === 'active' || sensorStatus === 'compass-only' ? (mapNorthHeading === null ? 'Calibrate North' : 'Recalibrate North') : 'Enable Compass'}</span>
          </button>

          <button
            onClick={() => setShowFloorPlan(true)}
            title="View the original architectural drawing for this floor"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-md border bg-white/95 text-slate-800 border-slate-200 hover:bg-slate-50 transition"
          >
            <FileText size={13} />
            <span>Architectural Plan</span>
          </button>

          <button
            onClick={() => setHeadingUp((value) => !value)}
            disabled={heading === null || !routeResult}
            title="Rotate the floor map to keep your phone heading at the top"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-md border bg-white/95 text-slate-800 border-slate-200 hover:bg-slate-50 transition disabled:opacity-40"
          >
            <Compass size={13} />
            <span>{headingUp ? 'Heading Up' : 'North Up'}</span>
          </button>

          <button
            onClick={() => setAutoFollow((value) => !value)}
            disabled={!routeResult}
            title="Keep the estimated location centred on the map"
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-md border transition ${autoFollow ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/95 text-slate-800 border-slate-200 hover:bg-slate-50'} disabled:opacity-40`}
          >
            <LocateFixed size={13} />
            <span>{autoFollow ? 'Auto-follow On' : 'Auto-follow Off'}</span>
          </button>

          <button
            onClick={handleStrideCalibration}
            disabled={sensorStatus !== 'active'}
            title="Walk a measured 10 metres to calibrate your step length"
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-md border transition ${calibrationStartSteps !== null ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-white/95 text-slate-800 border-slate-200 hover:bg-slate-50'} disabled:opacity-40`}
          >
            <Footprints size={13} />
            <span>{calibrationStartSteps !== null ? 'Finish 10m calibration' : `Calibrate steps · ${strideLengthMeters.toFixed(2)}m`}</span>
          </button>

          {/* Live Share Location Button */}
          <button
            onClick={() => setIsShareOpen(true)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-md border transition ${
              roomCode
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white/95 text-slate-800 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Share2 size={13} />
            <span>{roomCode ? `Live #${roomCode} (${roomMembers.length})` : 'Share Location'}</span>
          </button>

          {/* Wheelchair Accessible Filter Chip */}
          <button
            onClick={() => setAccessibleOnly(!accessibleOnly)}
            className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shadow-md border transition ${
              accessibleOnly
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Accessibility size={13} />
            <span>Accessible</span>
          </button>

          {/* Admin Map Edit Toggle (Visible ONLY to Admin role!) */}
          {canEditMap && (
            <button
              onClick={() => setAdminEditMode(!adminEditMode)}
              className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shadow-md border transition ${
                adminEditMode
                  ? 'bg-amber-500 text-slate-950 border-amber-500'
                  : 'bg-white/95 text-amber-700 border-amber-300 hover:bg-amber-50'
              }`}
            >
              <Wrench size={13} />
              <span>{adminEditMode ? 'Exit Map Editor' : 'Edit Map'}</span>
            </button>
          )}

          {/* Category Quick Filter Pills */}
          {[
            { label: 'Classrooms', type: 'room' },
            { label: 'Labs', type: 'lab' },
            { label: 'Halls & Terraces', type: 'hall' },
            { label: 'Offices', type: 'office' },
            { label: 'Restrooms', type: 'restroom' },
          ].map((cat) => (
            <button
              key={cat.type}
              onClick={() => {
                setCategoryFilter((prev) => (prev === cat.type ? '' : cat.type));
                setShowRoutePlanner(false);
              }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold shadow-md border transition ${
                categoryFilter === cat.type
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        {routeResult && (
          <div className="pointer-events-auto mt-1 mx-auto w-fit max-w-[min(92vw,420px)] rounded-2xl bg-slate-950/90 text-white border border-white/15 shadow-xl px-4 py-2.5 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <Navigation size={16} className="text-blue-300 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-extrabold">
                  {isRouteComplete
                    ? 'You have arrived at your destination'
                    : isVerticalTransition
                    ? `Reach ${activeRouteSegment.to.name}, then scan the destination QR`
                    : relativeTurn === null
                      ? 'Enable compass for live turn guidance'
                      : Math.abs(relativeTurn) <= 18
                        ? 'Walk straight'
                        : relativeTurn > 0
                          ? `Turn right ${Math.round(Math.abs(relativeTurn))}°`
                          : `Turn left ${Math.round(Math.abs(relativeTurn))}°`}
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5">
                  {heading === null ? 'Compass unavailable' : `Facing ${Math.round(heading)}°`}
                  {' · '}{mapNorthHeading === null ? 'North not calibrated' : 'North calibrated'}
                  {' · '}{sensorStatus === 'active' ? `${remainingDistance.toFixed(1)} m to next point` : 'Step tracking inactive'}
                </div>
                {sensorError && <div className="text-[10px] text-amber-200 mt-0.5">{sensorError}</div>}
              </div>
            </div>
          </div>
        )}
      </header>
      )}

      {/* ======================================================== */}
      {/* FLOATING RIGHT-SIDE INDOOR FLOOR PICKER & CAMERA DOCK    */}
      {/* ======================================================== */}
      {!showAROverlay && (
      <aside className="fixed right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 sicn-floor-dock">
        {/* Google Maps Indoor Floor Selector (GF through 7F) */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 p-1 flex flex-col gap-0.5 max-h-[48dvh] overflow-y-auto no-scrollbar">
          {[...FLOOR_DEFS].reverse().map((item) => {
            const active = currentFloor === item.f;
            const hasRouteOnFloor = routeResult?.floorsCovered?.includes(item.f);
            return (
              <button
                key={item.f}
                onClick={() => setCurrentFloor(item.f)}
                title={item.fullLabel}
                className={`relative w-9 h-8 rounded-xl text-[11px] font-extrabold transition flex items-center justify-center shrink-0 ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.shortLabel}
                {hasRouteOnFloor && !active && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Camera Zoom & Recenter Controls */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 p-1 flex flex-col gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(2)))}
            title="Zoom In"
            className="w-10 h-9 rounded-xl text-slate-700 hover:bg-slate-100 flex items-center justify-center"
          >
            <ZoomIn size={17} />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.2).toFixed(2)))}
            title="Zoom Out"
            className="w-10 h-9 rounded-xl text-slate-700 hover:bg-slate-100 flex items-center justify-center"
          >
            <ZoomOut size={17} />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setAutoFollow(true);
              setPan({ x: 0, y: 0 });
            }}
            title="Recenter Map"
            className="w-10 h-9 rounded-xl text-blue-600 hover:bg-blue-50 flex items-center justify-center"
          >
            <LocateFixed size={17} />
          </button>
        </div>

        {/* Admin Quick Add Node Button */}
        {canEditMap && (
          <button
            onClick={() => {
              setEditingNode(null);
              setClickedMapCoords({ x: 50, y: 50 });
              setAdminModalOpen(true);
            }}
            title="Add New Map Node (Admin)"
            className="w-11 h-11 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-xl flex items-center justify-center transition"
          >
            <Plus size={20} strokeWidth={2.6} />
          </button>
        )}
      </aside>
      )}

      {/* Re-open Route Sheet Pill if user minimized/closed it while route exists */}
      {!showAROverlay && routeResult && sheetSnap === 'closed' && (
        <button
          onClick={() => setSheetSnap('peek')}
          className="fixed bottom-20 left-4 md:bottom-6 md:left-[260px] z-20 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-1.5"
        >
          <Sparkles size={14} />
          <span>View Active Route ({routeResult.totalDistance}m)</span>
        </button>
      )}

      {/* ======================================================== */}
      {/* SWIPE-UP BOTTOM SHEET FOR STEP-BY-STEP DIRECTIONS        */}
      {/* ======================================================== */}
      {!showAROverlay && (
        <DirectionsBottomSheet
          routeResult={routeResult}
          startNode={startNodeObj}
          destinationNode={destNodeObj}
          snap={sheetSnap}
          setSnap={setSheetSnap}
          onClearRoute={clearRoute}
          onSwitchFloor={(f) => setCurrentFloor(f)}
          accessibleOnly={accessibleOnly}
          isARMode={isARMode}
          onLaunchAR={() => (isARMode ? fallbackTo2DMap() : launchARLiveView())}
          activeStepIndex={activeStepIndex}
          onSelectStep={(idx) => { setWalkedMeters(0); setActiveStepIndex(idx); }}
        />
      )}

      {!showAROverlay && (
        <IndoorCheckpointScanner
          enabled={autoScannerOpen}
          onClose={() => setAutoScannerOpen(false)}
          onConfirm={handleConfirmIndoorCheckpoint}
        />
      )}

      {!showAROverlay && showFloorPlan && FLOOR_PLANS[currentFloor] && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-slate-950">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3 text-white">
            <div className="min-w-0">
              <div className="text-sm font-extrabold">Original Architectural Drawing</div>
              <div className="text-xs text-slate-300">{FLOOR_PLANS[currentFloor].label} · Source PDF</div>
              <div className="text-[10px] text-amber-200">Reference preview only — this drawing is not yet registered to the live route coordinates.</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={FLOOR_PLANS[currentFloor].url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-white/20 px-3 py-2 text-xs font-bold hover:bg-white/10"
              >
                Open PDF
              </a>
              <button
                type="button"
                onClick={() => setShowFloorPlan(false)}
                className="rounded-xl bg-white/10 p-2 hover:bg-white/20"
                aria-label="Close architectural drawing"
              >
                <X size={18} />
              </button>
            </div>
          </header>
          <iframe
            title={`${FLOOR_PLANS[currentFloor].label} architectural drawing`}
            src={`${FLOOR_PLANS[currentFloor].url}#view=FitH`}
            className="min-h-0 flex-1 w-full bg-white"
          />
        </div>
      )}

      {/* Live Location & 6-Digit Room Sharing Modal */}
      <ShareLocationSheet
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

      {/* Admin RBAC Map & Node Editor Modal */}
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

