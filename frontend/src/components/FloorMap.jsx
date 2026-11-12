import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { loadFloorPlan } from '../data/floorplans';
import PlaceCard from './PlaceCard';
import { getRouteSegmentPoints } from '../utils/indoorNavigation';
import {
  MAP_VIEWBOX,
  PLAN_LAYER_TRANSFORM,
  PLAN_UP_COMPASS_BEARING,
  clampPan,
  clampZoom,
  fitPlanToViewport,
  getBaseScale,
  getMapUiInsets,
  getScaleBar,
  panToCenter,
  PX_PER_METER,
  projectX,
  projectY,
  unprojectPoint,
  zoomAroundPoint,
} from '../utils/mapProjection';

const scaleX = projectX;
const scaleY = projectY;
const fmt = (value) => Math.round(value * 10) / 10;

const LABELLED_TYPES = new Set(['room', 'lab', 'office', 'library', 'hall', 'restroom', 'entrance', 'checkpoint', 'stair', 'lift']);

/** Node name without the floor suffix, wrapped onto at most two short lines. */
function getNodeLabelLines(node) {
  const text = String(node.name || '').replace(/\s*\([^)]*\)/g, '').trim();
  const words = text.split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current) lines[lines.length - 1] = word;
    else if ((current + ' ' + word).length <= 16) lines[lines.length - 1] = `${current} ${word}`;
    else if (lines.length < 2) lines.push(word);
    else {
      lines[1] = `${lines[1].slice(0, 13)}…`;
      break;
    }
  }
  return lines;
}

function getEdgePolyline(edge) {
  const traced = edge.geometry?.points;
  const points = Array.isArray(traced) && traced.length >= 2
    ? traced
    : [edge.u.coordinates, edge.v.coordinates];
  return points.map((point) => `${fmt(scaleX(point.x))},${fmt(scaleY(point.y))}`).join(' ');
}

export default function FloorMap({
  floor = 0,
  nodes = [],
  edges = [],
  routeResult = null,
  startNode = null,
  destinationNode = null,
  friends = [],
  zoom = 1,
  setZoom,
  pan = { x: 0, y: 0 },
  setPan,
  adminEditMode = false,
  onSelectNode,
  onAdminMapClick,
  onSwitchFloor,
  userPosition = null,
  userHeading = null,
  mapNorthHeading = PLAN_UP_COMPASS_BEARING,
  navigationActive = false,
  headingUp = false,
  autoFollow = false,
  onUserPan,
  uiInsets = null,
  floorLabel = '',
  schedule = null,
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  // 'gesture' while a finger / mouse moves the map, 'wheel' while zooming with
  // a wheel, 'idle' otherwise (programmatic camera moves then animate smoothly).
  const [motion, setMotion] = useState('idle');
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const movedRef = useRef(false);
  const inertiaRef = useRef(0);
  const lastTapRef = useRef(null);
  const [selectedPopupNode, setSelectedPopupNode] = useState(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [loadedPlan, setLoadedPlan] = useState(null);

  // Floor changes animate like a level switch: the new floor slides in from
  // the direction travelled and its name flashes briefly.
  const previousFloorRef = useRef(floor);
  const [floorFlash, setFloorFlash] = useState(null);
  const [floorEnter, setFloorEnter] = useState('');
  useEffect(() => {
    const previous = previousFloorRef.current;
    previousFloorRef.current = floor;
    if (previous === floor) return undefined;
    const direction = Number(floor) > Number(previous) ? 'up' : 'down';
    setFloorEnter(direction);
    setFloorFlash({ id: Date.now(), direction });
    const timer = setTimeout(() => setFloorFlash(null), 1600);
    return () => clearTimeout(timer);
  }, [floor]);

  // Track the map viewport so zoom limits, panning and label sizes follow it.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const measure = () => setContainerSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Architectural line work of the active floor (generated from the PDFs).
  useEffect(() => {
    let cancelled = false;
    loadFloorPlan(floor)
      .then((data) => {
        if (!cancelled) setLoadedPlan({ floor, data });
      })
      .catch(() => {
        if (!cancelled) setLoadedPlan({ floor, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [floor]);
  const plan = loadedPlan?.floor === floor ? loadedPlan.data : null;
  const planPending = loadedPlan?.floor !== floor;

  const baseScale = getBaseScale(containerSize.width, containerSize.height);
  const screenScale = baseScale * zoom;
  // Keep text near 10–11 screen pixels while zooming, within sane map sizes.
  const labelSize = Math.max(1.4, Math.min(30, 10.5 / screenScale));
  const showNodeLabels = screenScale >= 0.7;
  const showAnnotations = screenScale >= 0.8;
  const markerScale = Math.max(0.16, Math.min(1.15, 1.05 / screenScale));
  const scaleBar = getScaleBar(PX_PER_METER * screenScale);

  const floorNodes = useMemo(() => {
    return nodes.filter((n) => n.floor === floor);
  }, [nodes, floor]);

  const floorFriends = useMemo(() => {
    return friends.filter((f) => Number(f.floor) === Number(floor) && f.coordinates);
  }, [friends, floor]);

  const otherFloorFriends = useMemo(() => {
    return friends.filter((f) => Number(f.floor) !== Number(floor));
  }, [friends, floor]);

  // Floor transition badge info (prioritize outbound transition on pass-through transit floors)
  const floorTransitionInfo = useMemo(() => {
    if (!routeResult?.path) return null;
    const path = routeResult.path;
    let inboundMatch = null;

    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i];
      const v = path[i + 1];
      if (u.floor !== v.floor) {
        if (u.floor === floor) {
          return {
            type: 'exit',
            node: u,
            targetFloor: v.floor,
            transitType: u.type === 'lift' ? 'Elevator' : 'Stairs',
          };
        } else if (v.floor === floor && !inboundMatch) {
          inboundMatch = {
            type: 'entry',
            node: v,
            sourceFloor: u.floor,
            transitType: v.type === 'lift' ? 'Elevator' : 'Stairs',
          };
        }
      }
    }
    return inboundMatch;
  }, [routeResult, floor]);

  // Route drawn along each edge's traced geometry (through doors and along
  // corridor centrelines). Floor changes split the line so a transition never
  // draws a false straight segment across the plan.
  const routeFloorPoints = useMemo(() => {
    const path = routeResult?.path;
    if (!path || path.length < 2) return [];
    const segments = [];
    let current = [];
    for (let index = 0; index < path.length - 1; index += 1) {
      const sameFloor = Number(path[index].floor) === Number(floor) && Number(path[index + 1].floor) === Number(floor);
      if (!sameFloor) {
        if (current.length > 1) segments.push(current);
        current = [];
        continue;
      }
      const points = getRouteSegmentPoints(routeResult, index);
      points.forEach((point, pointIndex) => {
        if (pointIndex === 0 && current.length) return;
        current.push({ x: scaleX(point.x), y: scaleY(point.y) });
      });
    }
    if (current.length > 1) segments.push(current);
    return segments;
  }, [routeResult, floor]);

  const pathPolylineSegments = useMemo(
    () => routeFloorPoints.map((segment) => segment.map((point) => `${fmt(point.x)},${fmt(point.y)}`)),
    [routeFloorPoints]
  );

  const currentPosition = userPosition && Number(userPosition.floor) === Number(floor)
    ? userPosition
    : startNode && Number(startNode.floor) === Number(floor)
      ? { ...startNode.coordinates, floor: startNode.floor }
      : null;

  // Screen space covered by the floating search bar, side panel and sheets.
  const insets = uiInsets || getMapUiInsets(containerSize.width);
  const insetKey = `${insets.left}|${insets.right}|${insets.top}|${insets.bottom}`;
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

  // Fit the active floor's route into the visible part of the map when a route/floor changes.
  useEffect(() => {
    if (!setZoom || !setPan || !containerSize.width) return;
    const points = routeFloorPoints.flat();
    if (!points.length) return;
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const width = Math.max(110, maxX - minX);
    const height = Math.max(90, maxY - minY);
    const base = getBaseScale(containerSize.width, containerSize.height);
    const fitInsets = insetsRef.current;
    const fitX = (containerSize.width - fitInsets.left - fitInsets.right - 48) / (width * base);
    const fitY = (containerSize.height - fitInsets.top - fitInsets.bottom - 32) / (height * base);
    const home = fitPlanToViewport(containerSize.width, containerSize.height, fitInsets);
    const nextZoom = clampZoom(Math.max(home.zoom, Math.min(3.4, fitX, fitY)));
    setZoom(nextZoom);
    setPan(panToCenter((minX + maxX) / 2, (minY + maxY) / 2, nextZoom, containerSize.width, containerSize.height, fitInsets));
  }, [routeFloorPoints, containerSize.width, containerSize.height, insetKey, setZoom, setPan]);

  // Keep the estimated position near the centre while auto-follow is enabled.
  useEffect(() => {
    if (!autoFollow || !navigationActive || !userPosition || Number(userPosition.floor) !== Number(floor) || !setPan || !containerSize.width) return;
    setPan(panToCenter(scaleX(userPosition.x), scaleY(userPosition.y), zoom, containerSize.width, containerSize.height, insetsRef.current));
  }, [autoFollow, navigationActive, userPosition, floor, setPan, zoom, containerSize.width, containerSize.height, insetKey]);

  // Walkable network on the current floor (clear in Admin Edit Mode, subtle otherwise)
  const floorEdges = useMemo(() => {
    const nodeMap = new Map(floorNodes.map((n) => [n.nodeId, n]));
    return edges
      .filter((e) => nodeMap.has(e.fromNode) && nodeMap.has(e.toNode))
      .map((e) => ({
        ...e,
        u: nodeMap.get(e.fromNode),
        v: nodeMap.get(e.toNode),
      }));
  }, [edges, floorNodes]);

  // ------------------------------------------------------------------
  // Map camera gestures, modelled on how a web map behaves:
  //  - one finger / mouse drag pans, and a quick release keeps gliding
  //  - pinch zooms around the middle of the two fingers and pans with them
  //  - mouse wheel / trackpad pinch zooms around the cursor
  //  - double tap / double click zooms in at that point, two-finger tap zooms out
  //  - arrow keys pan, + / - zoom when the map has keyboard focus
  // ------------------------------------------------------------------
  const viewRef = useRef({ zoom, pan });
  useEffect(() => {
    if (!pointersRef.current.size && !inertiaRef.current) viewRef.current = { zoom, pan };
  }, [zoom, pan]);

  const setView = useCallback((nextZoom, nextPan) => {
    const z = clampZoom(nextZoom);
    const p = clampPan(nextPan, z, containerSize.width, containerSize.height);
    viewRef.current = { zoom: z, pan: p };
    setZoom?.(z);
    setPan?.(p);
  }, [setZoom, setPan, containerSize.width, containerSize.height]);

  const anchorFrom = useCallback((clientX, clientY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }, []);

  const zoomAt = useCallback((anchor, nextZoom) => {
    const { zoom: z1, pan: p1 } = viewRef.current;
    const z2 = clampZoom(nextZoom);
    if (z2 === z1) return;
    setView(z2, zoomAroundPoint(p1, z1, z2, anchor));
  }, [setView]);

  const stopInertia = useCallback(() => {
    if (inertiaRef.current) cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = 0;
  }, []);
  useEffect(() => stopInertia, [stopInertia]);

  const startInertia = useCallback((vx, vy) => {
    stopInertia();
    if (Math.hypot(vx, vy) < 0.15) {
      setMotion('idle');
      return;
    }
    let last = performance.now();
    let velocity = { x: vx, y: vy };
    const tick = (now) => {
      const dt = Math.min(40, now - last);
      last = now;
      const { zoom: z, pan: p } = viewRef.current;
      setView(z, { x: p.x + velocity.x * dt, y: p.y + velocity.y * dt });
      const decay = Math.pow(0.994, dt);
      velocity = { x: velocity.x * decay, y: velocity.y * decay };
      if (Math.hypot(velocity.x, velocity.y) < 0.02) {
        inertiaRef.current = 0;
        setMotion('idle');
        return;
      }
      inertiaRef.current = requestAnimationFrame(tick);
    };
    inertiaRef.current = requestAnimationFrame(tick);
  }, [setView, stopInertia]);

  const pointerList = () => [...pointersRef.current.values()];
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const beginDrag = (point) => {
    gestureRef.current = {
      type: 'drag',
      startX: point.x,
      startY: point.y,
      startPan: viewRef.current.pan,
      samples: [{ x: point.x, y: point.y, t: performance.now() }],
      startedAt: performance.now(),
    };
  };

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopInertia();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = pointerList();
    if (points.length === 1) {
      movedRef.current = false;
      beginDrag(points[0]);
    } else if (points.length === 2) {
      const [a, b] = points;
      gestureRef.current = {
        type: 'pinch',
        startDistance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        startZoom: viewRef.current.zoom,
        startPan: viewRef.current.pan,
        startMid: anchorFrom(midpoint(a, b).x, midpoint(a, b).y),
        startedAt: performance.now(),
        travelled: 0,
      };
    }
    setMotion('gesture');
  };

  const handlePointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.type === 'drag') {
      const dx = e.clientX - gesture.startX;
      const dy = e.clientY - gesture.startY;
      if (!movedRef.current && Math.hypot(dx, dy) > 5) {
        movedRef.current = true;
        onUserPan?.();
      }
      if (!movedRef.current) return;
      const now = performance.now();
      gesture.samples.push({ x: e.clientX, y: e.clientY, t: now });
      while (gesture.samples.length > 2 && now - gesture.samples[0].t > 90) gesture.samples.shift();
      setView(viewRef.current.zoom, { x: gesture.startPan.x + dx, y: gesture.startPan.y + dy });
      return;
    }
    const points = pointerList();
    if (gesture.type === 'pinch' && points.length >= 2) {
      const [a, b] = points;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = anchorFrom(midpoint(a, b).x, midpoint(a, b).y);
      const nextZoom = clampZoom(gesture.startZoom * (distance / gesture.startDistance));
      const zoomed = zoomAroundPoint(gesture.startPan, gesture.startZoom, nextZoom, gesture.startMid);
      gesture.travelled = Math.max(
        gesture.travelled,
        Math.abs(distance - gesture.startDistance),
        Math.hypot(mid.x - gesture.startMid.x, mid.y - gesture.startMid.y)
      );
      if (!movedRef.current && gesture.travelled > 6) onUserPan?.();
      movedRef.current = true;
      setView(nextZoom, {
        x: zoomed.x + (mid.x - gesture.startMid.x),
        y: zoomed.y + (mid.y - gesture.startMid.y),
      });
    }
  };

  const handlePointerEnd = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.delete(e.pointerId);
    const gesture = gestureRef.current;
    const remaining = pointerList();
    const now = performance.now();

    if (gesture?.type === 'pinch') {
      // A quick two-finger tap zooms out, like on a phone map.
      if (gesture.travelled < 8 && now - gesture.startedAt < 300 && remaining.length === 1) {
        zoomAt(gesture.startMid, viewRef.current.zoom / 2);
        gestureRef.current = { type: 'done' };
        setMotion('idle');
        return;
      }
      if (remaining.length === 1) {
        beginDrag(remaining[0]);
        return;
      }
    }

    if (remaining.length) return;
    gestureRef.current = null;

    if (gesture?.type === 'drag' && movedRef.current) {
      const samples = gesture.samples;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      if (dt > 0 && now - last.t < 60) startInertia((last.x - first.x) / dt, (last.y - first.y) / dt);
      else setMotion('idle');
      return;
    }

    if (gesture?.type === 'drag' && !movedRef.current && e.type === 'pointerup') {
      // Double tap / double click zooms in around the tapped point.
      const tap = { x: e.clientX, y: e.clientY, t: now };
      const previous = lastTapRef.current;
      if (previous && tap.t - previous.t < 320 && Math.hypot(tap.x - previous.x, tap.y - previous.y) < 30) {
        lastTapRef.current = null;
        setMotion('idle');
        zoomAt(anchorFrom(tap.x, tap.y), viewRef.current.zoom * 2);
        return;
      }
      lastTapRef.current = tap;
    }
    setMotion('idle');
  };

  // Wheel and trackpad zoom need a non-passive listener to keep the page still.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    let timer = 0;
    const onWheel = (event) => {
      event.preventDefault();
      stopInertia();
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 400 : 1;
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
      // ctrlKey is set for trackpad pinch gestures; they report small deltas.
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.012 : 0.0025));
      onUserPan?.();
      setMotion('wheel');
      zoomAt(anchorFrom(event.clientX, event.clientY), viewRef.current.zoom * factor);
      clearTimeout(timer);
      timer = setTimeout(() => setMotion('idle'), 160);
    };
    const preventGesture = (event) => event.preventDefault();
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('gesturestart', preventGesture);
    return () => {
      clearTimeout(timer);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', preventGesture);
    };
  }, [zoomAt, anchorFrom, stopInertia, onUserPan]);

  const handleKeyDown = (e) => {
    const step = 90;
    const { zoom: z, pan: p } = viewRef.current;
    const moves = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    if (moves[e.key]) {
      e.preventDefault();
      onUserPan?.();
      setView(z, { x: p.x + moves[e.key].x, y: p.y + moves[e.key].y });
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomAt({ x: 0, y: 0 }, z * 1.5);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomAt({ x: 0, y: 0 }, z / 1.5);
    }
  };

  const handleSvgBackgroundClick = (e) => {
    if (movedRef.current) return;
    if (adminEditMode && onAdminMapClick && svgRef.current) {
      const pt = svgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svgRef.current.getScreenCTM();
      if (ctm) {
        const svgPt = pt.matrixTransform(ctm.inverse());
        onAdminMapClick(unprojectPoint(svgPt.x, svgPt.y));
      }
      return;
    }
    setSelectedPopupNode(null);
  };

  const getNodeColor = (node) => {
    const isStart = startNode?.nodeId === node.nodeId;
    const isDest = destinationNode?.nodeId === node.nodeId;
    const isPath = routeResult?.nodeIds?.includes(node.nodeId);

    if (isStart) return '#10b981';
    if (isDest) return '#ef4444';
    if (isPath) return '#2563eb';

    switch (node.type) {
      case 'entrance':
        return '#059669';
      case 'checkpoint':
        return '#8b5cf6';
      case 'stair':
        return '#f59e0b';
      case 'lift':
        return '#06b6d4';
      case 'room':
        return '#4f46e5';
      case 'lab':
        return '#0284c7';
      case 'office':
        return '#d97706';
      case 'library':
        return '#0d9488';
      case 'hall':
        return '#7c3aed';
      case 'restroom':
        return '#0891b2';
      default:
        return '#64748b';
    }
  };

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={`Floor map${floorLabel ? `, ${floorLabel}` : ''}. Drag to move, pinch or scroll to zoom, double tap to zoom in.`}
      tabIndex={0}
      className={`sicn-floor-map relative w-full h-full overflow-hidden bg-[#eef2f6] select-none outline-none ${adminEditMode ? 'cursor-crosshair' : motion === 'gesture' ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') handlePointerEnd(e); }}
      onKeyDown={handleKeyDown}
    >
      {/* Interactive Pan/Zoom Canvas */}
      <div
        className="sicn-map-camera w-full h-full flex items-center justify-center"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: motion === 'gesture'
            ? 'none'
            : motion === 'wheel'
              ? 'transform 110ms ease-out'
              : 'transform 320ms cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
          className="sicn-floor-map-svg w-full h-full max-w-[1380px] max-h-[860px]"
          style={{
            transform: headingUp && navigationActive && userHeading !== null
              ? `rotate(${mapNorthHeading - userHeading}deg)`
              : undefined,
            transformOrigin: 'center center',
            transition: 'transform 180ms ease-out',
          }}
          onClick={handleSvgBackgroundClick}
        >
          <defs>
            <pattern id="gmapsGrid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#e2e8f0" strokeWidth="0.9" />
            </pattern>
            <filter id="routeGlow" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="4.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <radialGradient id="headingBeam" cx="0.5" cy="1" r="1" fx="0.5" fy="1">
              <stop offset="0%" stopColor="#1a73e8" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#1a73e8" stopOpacity="0" />
            </radialGradient>
            <filter id="dotShadow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.6" floodColor="#0f172a" floodOpacity="0.35" />
            </filter>
            <filter id="planSlabShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.12" />
            </filter>
          </defs>

          {/* Site surface */}
          <rect x="-600" y="-400" width="2200" height="1420" fill="#eef2f6" />
          <rect x="-600" y="-400" width="2200" height="1420" fill="url(#gmapsGrid)" />

          <g key={`floor-layer-${floor}`} className={`sicn-floor-layer ${floorEnter ? `enter-${floorEnter}` : ''}`}>

          {/* Architectural floor plan traced from the source PDF (1:100, metres) */}
          {plan ? (
            <g className="sicn-plan-layer" transform={PLAN_LAYER_TRANSFORM}>
              <path d={plan.hull} className="plan-slab" filter="url(#planSlabShadow)" />
              <path d={plan.layers.fine} className="plan-line plan-fine" />
              <path d={plan.layers.detail} className="plan-line plan-detail" />
              <path d={plan.layers.wall} className="plan-line plan-wall" />
              {plan.layers.solid && <path d={plan.layers.solid} className="plan-solid" />}
            </g>
          ) : (
            <text x={MAP_VIEWBOX.width / 2} y={MAP_VIEWBOX.height / 2} textAnchor="middle" className="plan-annotation" fontSize="12">
              {planPending ? 'Loading floor plan…' : 'Floor plan drawing unavailable for this floor'}
            </text>
          )}

          {/* Names printed on the drawing for spaces that are not navigation destinations */}
          {plan && showAnnotations && (
            <g className="plan-annotation-layer" pointerEvents="none">
              {plan.labels.map((label, index) => (
                <text
                  key={`${label.text}-${index}`}
                  x={scaleX(label.x)}
                  y={scaleY(label.y)}
                  textAnchor="middle"
                  className="plan-annotation"
                  fontSize={fmt(labelSize * 0.82)}
                >
                  {label.text}
                </text>
              ))}
            </g>
          )}

          {/* North arrow: where compass North lies on this plan (entrance side faces West) */}
          <g
            className="plan-north-arrow"
            pointerEvents="none"
            transform={`translate(${fmt(scaleX(60.5))} ${fmt(scaleY(38))}) scale(${fmt(markerScale)})`}
          >
            <circle r="15" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.2" />
            <g transform={`rotate(${fmt(-mapNorthHeading)})`}>
              <path d="M0 -11.5 L4.6 2.5 L0 0 L-4.6 2.5 Z" fill="#dc2626" />
              <path d="M0 11.5 L4.6 -2.5 L0 0 L-4.6 -2.5 Z" fill="#cbd5e1" />
            </g>
            <text
              x={fmt(22 * Math.sin((-mapNorthHeading * Math.PI) / 180))}
              y={fmt(-22 * Math.cos((-mapNorthHeading * Math.PI) / 180) + 3.2)}
              textAnchor="middle"
              fontSize="9"
              fontWeight="800"
              fill="#dc2626"
            >
              N
            </text>
          </g>

          {/* Walkable network (clear in Admin Mode, subtle otherwise) */}
          <g opacity={adminEditMode ? '0.7' : '0.22'} pointerEvents="none">
            {floorEdges.map((edge) => (
              <polyline
                key={edge.edgeId}
                points={getEdgePolyline(edge)}
                fill="none"
                stroke={adminEditMode ? '#6366f1' : '#94a3b8'}
                strokeWidth={fmt((adminEditMode ? 1.8 : 1.1) * markerScale)}
                strokeLinejoin="round"
                strokeDasharray={adminEditMode ? '4 4' : `${fmt(3 * markerScale)} ${fmt(3 * markerScale)}`}
              />
            ))}
          </g>

          {/* Active A* Route Polyline (Google Maps Blue Path) */}
          {pathPolylineSegments.map((segment, index) => {
            const points = segment.join(' ');
            return (
              <g className="rendered-path-layer" key={`floor-route-${floor}-${index}`} pointerEvents="none">
                <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth={fmt(11 * markerScale)} strokeLinecap="round" strokeLinejoin="round" opacity="0.28" filter="url(#routeGlow)" />
                <polyline points={points} fill="none" stroke="#1d4ed8" strokeWidth={fmt(5.5 * markerScale)} strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={points} fill="none" stroke="#93c5fd" strokeWidth={fmt(2.4 * markerScale)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 10" className="animated-dash-line" />
              </g>
            );
          })}

          {/* Inter-floor Transition Action Pill */}
          {floorTransitionInfo && (
            <g
              className="cursor-pointer"
              transform={`translate(${fmt(scaleX(floorTransitionInfo.node.coordinates.x))} ${fmt(scaleY(floorTransitionInfo.node.coordinates.y))}) scale(${fmt(markerScale)})`}
              onClick={(e) => {
                e.stopPropagation();
                onSwitchFloor?.(floorTransitionInfo.targetFloor ?? floorTransitionInfo.sourceFloor);
              }}
            >
              <rect x="-82" y="-46" width="164" height="30" rx="15" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
              <text x="0" y="-27" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700">
                {floorTransitionInfo.type === 'exit'
                  ? `↗ ${floorTransitionInfo.transitType} to ${floorTransitionInfo.targetFloor === 0
                    ? 'GF'
                    : `Floor ${floorTransitionInfo.targetFloor}`
                  }`
                  : `↘ From ${floorTransitionInfo.sourceFloor === 0
                    ? 'GF'
                    : `Floor ${floorTransitionInfo.sourceFloor}`
                  }`}
              </text>
            </g>
          )}

          {/* Map Nodes */}
          <g className="nodes-layer">
            {floorNodes.map((node) => {
              const cx = scaleX(node.coordinates.x);
              const cy = scaleY(node.coordinates.y);
              const isStart = startNode?.nodeId === node.nodeId;
              const isDest = destinationNode?.nodeId === node.nodeId;
              const isInPath = routeResult?.nodeIds?.includes(node.nodeId);
              const isWaypoint = node.type === 'corridor';
              const color = getNodeColor(node);
              const emphasised = isStart || isDest;
              const radius = (emphasised ? 9 : isInPath ? (isWaypoint ? 3.4 : 6) : adminEditMode ? 6 : isWaypoint ? 2.2 : 4.6) * markerScale;
              const labelLines = !isWaypoint && LABELLED_TYPES.has(node.type) && (showNodeLabels || emphasised)
                ? getNodeLabelLines(node)
                : null;

              return (
                <g
                  key={node.nodeId}
                  className="cursor-pointer"
                  opacity={isWaypoint && !adminEditMode && !isInPath && !emphasised ? 0.55 : 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (movedRef.current) return;
                    if (adminEditMode) {
                      onSelectNode?.(node, 'admin_edit');
                    } else {
                      setSelectedPopupNode(node);
                    }
                  }}
                >
                  {/* Generous invisible tap target */}
                  <circle cx={cx} cy={cy} r={fmt(Math.max(radius, 12 / Math.max(0.05, screenScale)))} fill="transparent" />

                  {emphasised && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={fmt(18 * markerScale)}
                      fill={color}
                      opacity="0.26"
                      className="pulsing-beacon"
                    />
                  )}

                  <circle
                    cx={cx}
                    cy={cy}
                    r={fmt(radius)}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={fmt((emphasised ? 2.6 : isWaypoint ? 0.8 : 1.5) * markerScale)}
                  />

                  {labelLines && !adminEditMode && (
                    <text
                      x={cx}
                      y={fmt(cy + radius + labelSize * 0.95)}
                      textAnchor="middle"
                      className={`plan-node-label plan-node-label-${node.type}`}
                      fontSize={fmt(labelSize)}
                    >
                      {labelLines.map((line, lineIndex) => (
                        <tspan key={line + lineIndex} x={cx} dy={lineIndex === 0 ? 0 : fmt(labelSize * 1.08)}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )}

                  {/* Full names while editing the graph */}
                  {adminEditMode && (
                    <text
                      x={cx}
                      y={fmt(cy - radius - 3 * markerScale)}
                      textAnchor="middle"
                      fontSize={fmt(Math.max(4, labelSize * 0.85))}
                      fontWeight="700"
                      fill="#334155"
                    >
                      {node.name}
                    </text>
                  )}

                  {isDest && (
                    <g className="sicn-dest-pin" transform={`translate(${fmt(cx)} ${fmt(cy)}) scale(${fmt(markerScale)})`} pointerEvents="none">
                      <ellipse cx="0" cy="1" rx="7" ry="2.6" fill="#0f172a" opacity="0.22" />
                      <path
                        d="M0 0 C -4 -9 -13 -15 -13 -26 A 13 13 0 1 1 13 -26 C 13 -15 4 -9 0 0 Z"
                        fill="#e5383b"
                        stroke="#ffffff"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <circle cx="0" cy="-26" r="5" fill="#7a0f12" />
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* ======================================================== */}
          {/* Phone compass marker. Rotation is relative to the calibrated PDF north. */}
          {currentPosition && (
            <g
              className="sicn-phone-position"
              aria-label={userPosition?.mapMatched ? 'Your estimated position' : 'Your position'}
              transform={`translate(${fmt(scaleX(currentPosition.x))},${fmt(scaleY(currentPosition.y))}) scale(${fmt(markerScale)})`}
              pointerEvents="none"
            >
              {/* Accuracy halo: wider while the position is only a step estimate */}
              <circle r={userPosition && !userPosition.confirmed ? 30 : 22} fill="#1a73e8" opacity="0.13" className="sicn-accuracy-halo" />
              {/* Heading beam: the way the phone is pointing */}
              {userHeading !== null && (
                <g transform={`rotate(${fmt(userHeading - mapNorthHeading)})`}>
                  <path d="M0 0 L-15 -40 A 43 43 0 0 1 15 -40 Z" fill="url(#headingBeam)" />
                </g>
              )}
              <circle r="10.5" fill="#ffffff" filter="url(#dotShadow)" />
              <circle r="7.6" fill="#1a73e8" />
            </g>
          )}

          {/* REAL-TIME SOCKET.IO LIVE FRIEND AVATARS                  */}
          {/* ======================================================== */}
          <g className="live-friends-layer">
            {floorFriends.map((friend, idx) => {
              // Slight offset if multiple friends stand at the exact same checkpoint
              const offsetAngle = idx * 0.9;
              const cx = scaleX(friend.coordinates.x) + (idx > 0 ? Math.cos(offsetAngle) * 14 : 0);
              const cy = scaleY(friend.coordinates.y) + (idx > 0 ? Math.sin(offsetAngle) * 14 : 0);
              const initials = (friend.userName || 'F')
                .split(' ')
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <g
                  key={friend.socketId}
                  className="friend-avatar-glide cursor-pointer"
                  style={{
                    transform: `translate(${cx}px, ${cy}px) scale(${fmt(markerScale)})`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const friendNode = nodes.find((n) => n.nodeId === friend.nodeId);
                    if (friendNode) {
                      onSelectNode?.(friendNode, 'destination');
                    }
                  }}
                >
                  <circle
                    cx="0"
                    cy="0"
                    r="22"
                    fill={friend.avatarColor || '#8b5cf6'}
                    opacity="0.25"
                    className="pulsing-beacon"
                  />
                  <circle
                    cx="0"
                    cy="0"
                    r="13"
                    fill={friend.avatarColor || '#8b5cf6'}
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="800"
                  >
                    {initials}
                  </text>
                  {/* Floating Name Pill */}
                  <rect
                    x="-48"
                    y="-32"
                    width="96"
                    height="17"
                    rx="8.5"
                    fill="#0f172a"
                    opacity="0.92"
                  />
                  <text
                    x="0"
                    y="-20.5"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="700"
                  >
                    {friend.userName.slice(0, 12)}
                  </text>
                </g>
              );
            })}
          </g>
          </g>
        </svg>
      </div>

      {/* Scale bar, bottom-left of the visible map area */}
      {containerSize.width > 0 && (
        <div
          className="sicn-scale-bar pointer-events-none absolute z-10"
          style={{ left: insets.left + 12, bottom: insets.bottom + 12 }}
          aria-hidden="true"
        >
          <span>{scaleBar.metres} m</span>
          <i style={{ width: scaleBar.width }} />
        </div>
      )}

      {/* Place card for a tapped room */}
      {selectedPopupNode && !adminEditMode && (
        <PlaceCard
          node={selectedPopupNode}
          nodes={nodes}
          schedule={schedule}
          onClose={() => setSelectedPopupNode(null)}
          onDirections={(target) => {
            onSelectNode?.(target, 'destination');
            setSelectedPopupNode(null);
          }}
          onSetStart={(target) => {
            onSelectNode?.(target, 'start');
            setSelectedPopupNode(null);
          }}
          style={{
            left: insets.left + Math.max(0, (containerSize.width - insets.left - insets.right) / 2),
            bottom: insets.bottom + 14,
            width: Math.min(384, Math.max(240, containerSize.width - insets.left - insets.right - 24)),
          }}
        />
      )}

      {/* Floor name flashes when the floor changes */}
      {floorFlash && (
        <div
          key={floorFlash.id}
          className="sicn-floor-flash"
          style={{ top: insets.top + 14, left: insets.left + (containerSize.width - insets.left - insets.right) / 2 }}
          role="status"
          aria-live="polite"
        >
          {floorFlash.direction === 'up' ? '↑' : '↓'} {floorLabel || (floor === 0 ? 'Ground Floor' : `Floor ${floor}`)}
        </div>
      )}

      {/* Friends on another floor indicator pill */}
      {otherFloorFriends.length > 0 && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onSwitchFloor?.(otherFloorFriends[0].floor)}
          style={{ top: insets.top + 12, left: insets.left + 12 }}
          className="absolute z-20 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 transition"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
          <span>
            {otherFloorFriends.length} friend{otherFloorFriends.length > 1 ? 's' : ''} on{' '}
            {otherFloorFriends[0].floor === 0 ? 'Ground Floor' : `Floor ${otherFloorFriends[0].floor}`}
          </span>
        </button>
      )}

      {/* Admin Edit Mode Banner */}
      {adminEditMode && (
        <div
          style={{ top: insets.top + 12, left: insets.left + (containerSize.width - insets.left - insets.right) / 2 }}
          className="absolute -translate-x-1/2 z-20 max-w-[90vw] text-center bg-amber-500 text-slate-950 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg pointer-events-none">
          Admin Map Editor: Tap empty space to Add Node • Tap node to Edit/Delete
        </div>
      )}
    </div>
  );
}
