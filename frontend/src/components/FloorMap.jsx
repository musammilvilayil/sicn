import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { loadFloorPlan } from '../data/floorplans';
import { getRouteSegmentPoints } from '../utils/indoorNavigation';
import {
  MAP_VIEWBOX,
  PLAN_LAYER_TRANSFORM,
  clampPan,
  clampZoom,
  fitPlanToViewport,
  getBaseScale,
  getMapUiInsets,
  panToCenter,
  projectX,
  projectY,
  unprojectPoint,
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
  mapNorthHeading = 0,
  navigationActive = false,
  headingUp = false,
  autoFollow = false,
  onUserPan,
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });
  const pinchRef = useRef(null);
  const [selectedPopupNode, setSelectedPopupNode] = useState(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [loadedPlan, setLoadedPlan] = useState(null);

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
  const labelSize = Math.max(3.4, Math.min(11.5, 10.5 / screenScale));
  const showNodeLabels = labelSize * screenScale >= 4.8;
  const showAnnotations = screenScale >= 0.8;
  const markerScale = Math.max(0.45, Math.min(1.15, 1.05 / screenScale));

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
    // Leave room for the search bar on top and the directions sheet below.
    const insets = { ...getMapUiInsets(containerSize.width), top: 110, bottom: 190 };
    const fitX = (containerSize.width - insets.left - insets.right - 70) / (width * base);
    const fitY = (containerSize.height - insets.top - insets.bottom) / (height * base);
    const home = fitPlanToViewport(containerSize.width, containerSize.height, getMapUiInsets(containerSize.width));
    const nextZoom = clampZoom(Math.max(home.zoom, Math.min(3.4, fitX, fitY)));
    setZoom(nextZoom);
    setPan(panToCenter((minX + maxX) / 2, (minY + maxY) / 2, nextZoom, containerSize.width, containerSize.height, insets));
  }, [routeFloorPoints, containerSize.width, containerSize.height, setZoom, setPan]);

  // Keep the estimated position near the centre while auto-follow is enabled.
  useEffect(() => {
    if (!autoFollow || !navigationActive || !userPosition || Number(userPosition.floor) !== Number(floor) || !setPan || !containerSize.width) return;
    const insets = { ...getMapUiInsets(containerSize.width), top: 110, bottom: 190 };
    setPan(panToCenter(scaleX(userPosition.x), scaleY(userPosition.y), zoom, containerSize.width, containerSize.height, insets));
  }, [autoFollow, navigationActive, userPosition, floor, setPan, zoom, containerSize.width, containerSize.height]);

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

  // Zoom while keeping the map point at the centre of the screen in place.
  const applyZoom = useCallback((computeNext) => {
    if (!setZoom) return;
    const nextZoom = clampZoom(computeNext(zoom));
    if (nextZoom === zoom) return;
    setZoom(nextZoom);
    setPan?.(clampPan(
      { x: pan.x * (nextZoom / zoom), y: pan.y * (nextZoom / zoom) },
      nextZoom,
      containerSize.width,
      containerSize.height
    ));
  }, [zoom, pan, setZoom, setPan, containerSize.width, containerSize.height]);

  // Pointer / Touch Drag Handlers for Google Maps Panning
  const handlePointerDown = (clientX, clientY) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
  };

  const handlePointerMove = (clientX, clientY) => {
    if (!isDragging) return;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      if (!dragStartRef.current.moved) onUserPan?.();
      dragStartRef.current.moved = true;
    }
    setPan?.(clampPan(
      { x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy },
      zoom,
      containerSize.width,
      containerSize.height
    ));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    pinchRef.current = null;
  };

  const handleWheel = (e) => {
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    applyZoom((z) => z * factor);
  };

  const touchDistance = (touches) => Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY
  );

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      setIsDragging(false);
      pinchRef.current = { distance: touchDistance(e.touches), zoom, pan };
      dragStartRef.current.moved = true;
    } else if (e.touches.length === 1) {
      handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current && setZoom) {
      const start = pinchRef.current;
      const nextZoom = clampZoom(start.zoom * (touchDistance(e.touches) / Math.max(1, start.distance)));
      onUserPan?.();
      setZoom(nextZoom);
      setPan?.(clampPan(
        { x: start.pan.x * (nextZoom / start.zoom), y: start.pan.y * (nextZoom / start.zoom) },
        nextZoom,
        containerSize.width,
        containerSize.height
      ));
    } else if (e.touches.length === 1) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleSvgBackgroundClick = (e) => {
    if (dragStartRef.current.moved) return;
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
      className={`sicn-floor-map relative w-full h-full overflow-hidden bg-[#eef2f6] select-none ${adminEditMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
      onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Interactive Pan/Zoom Canvas */}
      <div
        className="w-full h-full flex items-center justify-center transition-transform duration-75 ease-out"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: 'center center',
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
            <filter id="planSlabShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.12" />
            </filter>
          </defs>

          {/* Site surface */}
          <rect x="-600" y="-400" width="2200" height="1420" fill="#eef2f6" />
          <rect x="-600" y="-400" width="2200" height="1420" fill="url(#gmapsGrid)" />

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
                    if (dragStartRef.current.moved) return;
                    if (adminEditMode) {
                      onSelectNode?.(node, 'admin_edit');
                    } else {
                      setSelectedPopupNode(node);
                    }
                  }}
                >
                  {/* Generous invisible tap target */}
                  <circle cx={cx} cy={cy} r={fmt(Math.max(radius, 9 * markerScale))} fill="transparent" />

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
                    <g transform={`translate(${fmt(cx)} ${fmt(cy)}) scale(${fmt(markerScale)})`}>
                      <rect x="-38" y="-34" width="76" height="19" rx="9.5" fill="#dc2626" stroke="#ffffff" strokeWidth="1.5" />
                      <text x="0" y="-21" textAnchor="middle" fill="#fff" fontSize="9.5" fontWeight="800">
                        TARGET
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* ======================================================== */}
          {/* Phone compass marker. Rotation is relative to the calibrated PDF north. */}
          {currentPosition && (
            <g className="sicn-phone-position" transform={`translate(${fmt(scaleX(currentPosition.x))},${fmt(scaleY(currentPosition.y))}) scale(${fmt(markerScale)})`}>
              <circle r="25" fill="#2563eb" opacity="0.14" />
              <circle r="13" fill="#2563eb" stroke="#ffffff" strokeWidth="3" />
              {navigationActive && userHeading !== null && (
                <g transform={`rotate(${userHeading - mapNorthHeading})`}>
                  <path d="M0 -39 L10 -12 L0 -18 L-10 -12 Z" fill="#1d4ed8" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
                </g>
              )}
              <circle r="4" fill="#ffffff" />
              <rect x="-23" y="17" width="46" height="16" rx="8" fill="#1d4ed8" stroke="#ffffff" strokeWidth="1.5" />
              <text x="0" y="28" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="800">YOU</text>
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
        </svg>
      </div>

      {/* Google Maps-style Tap Pin Action Card */}
      {selectedPopupNode && !adminEditMode && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-28 md:bottom-24 z-30 w-[92%] max-w-sm bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl p-3.5 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 mb-1">
                {selectedPopupNode.floor === 0 ? 'Ground Floor' : `Floor ${selectedPopupNode.floor}`} • {selectedPopupNode.type}
              </span>
              <h4 className="text-sm font-bold text-slate-900 leading-snug">
                {selectedPopupNode.name}
              </h4>
              {selectedPopupNode.metadata?.description && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                  {selectedPopupNode.metadata.description}
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedPopupNode(null)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1.5 py-0.5"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => {
                onSelectNode?.(selectedPopupNode, 'destination');
                setSelectedPopupNode(null);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3 rounded-xl transition"
            >
              Directions Here
            </button>
            <button
              onClick={() => {
                onSelectNode?.(selectedPopupNode, 'start');
                setSelectedPopupNode(null);
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold py-2 px-3 rounded-xl transition"
            >
              Set as Start
            </button>
          </div>
        </div>
      )}

      {/* Friends on another floor indicator pill */}
      {otherFloorFriends.length > 0 && (
        <button
          onClick={() => onSwitchFloor?.(otherFloorFriends[0].floor)}
          className="absolute top-36 left-4 z-20 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 transition"
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
        <div className="absolute top-36 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-slate-950 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg pointer-events-none">
          Admin Map Editor: Tap empty space to Add Node • Tap node to Edit/Delete
        </div>
      )}
    </div>
  );
}
