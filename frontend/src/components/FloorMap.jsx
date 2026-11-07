import React, { useState, useMemo, useRef, useEffect } from 'react';

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
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });
  const [selectedPopupNode, setSelectedPopupNode] = useState(null);

  const floorNodes = useMemo(() => {
    return nodes.filter((n) => n.floor === floor);
  }, [nodes, floor]);

  const floorFriends = useMemo(() => {
    return friends.filter((f) => Number(f.floor) === Number(floor) && f.coordinates);
  }, [friends, floor]);

  const otherFloorFriends = useMemo(() => {
    return friends.filter((f) => Number(f.floor) !== Number(floor));
  }, [friends, floor]);

  // Scale node coordinates (0-100 range) to SVG viewBox (1000 x 620)
  const scaleX = (x) => 60 + x * 8.8;
  const scaleY = (y) => 60 + (85 - y) * 5.8;

  // Inverse scale for Admin click-to-place node
  const unscaleCoords = (svgX, svgY) => {
    const x = Math.max(0, Math.min(100, Math.round(((svgX - 60) / 8.8) * 10) / 10));
    const y = Math.max(0, Math.min(100, Math.round((85 - (svgY - 60) / 5.8) * 10) / 10));
    return { x, y };
  };

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

  // Keep floor segments separate; filtering all same-floor nodes can draw
  // a false straight line across an intervening floor transition.
  const pathPolylineSegments = useMemo(() => {
    if (!routeResult?.path || routeResult.path.length < 2) return [];
    const segments = [];
    let current = [];
    routeResult.path.forEach((node, index) => {
      if (node.floor !== floor) {
        if (current.length > 1) segments.push(current);
        current = [];
        return;
      }
      if (index > 0 && routeResult.path[index - 1].floor !== floor && current.length) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
      current.push(`${scaleX(node.coordinates.x)},${scaleY(node.coordinates.y)}`);
      if (index < routeResult.path.length - 1 && routeResult.path[index + 1].floor !== floor) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
    });
    if (current.length > 1) segments.push(current);
    return segments;
  }, [routeResult, floor]);

  const currentPosition = userPosition && Number(userPosition.floor) === Number(floor)
    ? userPosition
    : startNode && Number(startNode.floor) === Number(floor)
      ? { ...startNode.coordinates, floor: startNode.floor }
      : null;

  // Fit the active floor's route into the map viewport when a route/floor changes.
  useEffect(() => {
    if (!routeResult?.path?.length || !setZoom || !setPan || typeof window === 'undefined') return;
    const points = routeResult.path
      .filter((node) => Number(node.floor) === Number(floor))
      .map((node) => ({ x: scaleX(node.coordinates.x), y: scaleY(node.coordinates.y) }));
    if (!points.length) return;
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = Math.max(110, maxX - minX);
    const height = Math.max(90, maxY - minY);
    const pxPerSvgX = Math.min(window.innerWidth, 1380) / 1000;
    const pxPerSvgY = Math.min(window.innerHeight, 860) / 620;
    const fitX = (window.innerWidth - 110) / (width * pxPerSvgX);
    const fitY = (window.innerHeight - 300) / (height * pxPerSvgY);
    const nextZoom = Math.max(1.12, Math.min(2.35, fitX, fitY));
    setZoom(nextZoom);
    setPan({
      x: Math.max(-420, Math.min(420, (500 - centerX) * pxPerSvgX * nextZoom)),
      y: Math.max(-320, Math.min(320, (310 - centerY) * pxPerSvgY * nextZoom)),
    });
  }, [routeResult, floor, setZoom, setPan]);

  // Keep the estimated position near the centre while auto-follow is enabled.
  useEffect(() => {
    if (!autoFollow || !navigationActive || !userPosition || Number(userPosition.floor) !== Number(floor) || !setPan || typeof window === 'undefined') return;
    const pxPerSvgX = Math.min(window.innerWidth, 1380) / 1000;
    const pxPerSvgY = Math.min(window.innerHeight, 860) / 620;
    const x = scaleX(userPosition.x);
    const y = scaleY(userPosition.y);
    setPan({
      x: Math.max(-420, Math.min(420, (500 - x) * pxPerSvgX * zoom)),
      y: Math.max(-320, Math.min(320, (310 - y) * pxPerSvgY * zoom)),
    });
  }, [autoFollow, navigationActive, userPosition, floor, setPan, zoom]);

  // Subtle network edges on current floor (visible in Admin Edit Mode or light guide lines)
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
    setPan?.({
      x: Math.max(-420, Math.min(420, dragStartRef.current.panX + dx)),
      y: Math.max(-320, Math.min(320, dragStartRef.current.panY + dy)),
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    if (!setZoom) return;
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    setZoom((z) => Math.max(0.65, Math.min(2.6, Math.round((z + delta) * 100) / 100)));
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
        const mapCoords = unscaleCoords(svgPt.x, svgPt.y);
        onAdminMapClick(mapCoords);
      }
      return;
    }
    setSelectedPopupNode(null);
  };

  const UPPER_FLOOR_HEADERS = {
    2: '2ND FLOOR PLAN • CIVIL ENGINEERING & COMPUTING LABS (Z = +7.8 M)',
    3: '3RD FLOOR PLAN • MECHANICAL ENGINEERING & B.ARCH STUDIOS (Z = +11.7 M)',
    4: '4TH FLOOR PLAN • CSE WING, DRAWING HALL & SICK ROOM (Z = +15.6 M)',
    5: '5TH FLOOR PLAN • EEE DEPARTMENT & EAST OPEN TERRACE (Z = +19.5 M)',
    6: '6TH FLOOR PLAN • MAIN SEMINAR AUDITORIUM & OPEN TERRACE (Z = +23.4 M)',
    7: '7TH FLOOR PLAN • SKY TRANSIT LOBBY & OPEN ROOFTOP TERRACES (Z = +27.3 M)',
  };

  const getUpperRoomClass = (node) => {
    const id = node.nodeId || '';
    if (id.includes('TERRACE')) return 'room-shape room-terrace';
    if (id.includes('HOD')) return 'room-shape room-hod';
    if (id.includes('FACULTY')) return 'room-shape room-faculty';
    switch (node.type) {
      case 'lab':
        return 'room-shape room-lab';
      case 'office':
        return 'room-shape room-office';
      case 'hall':
        return 'room-shape room-hall';
      case 'restroom':
        return 'room-shape room-general';
      default:
        return 'room-shape room-classroom';
    }
  };

  const getShortBlueprintTitle = (node) => {
    const raw = node.name
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/^Head of\s+/i, 'HOD ')
      .replace(/\s+Department$/i, '')
      .toUpperCase();
    return raw.length > 19 ? `${raw.slice(0, 18)}…` : raw;
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
      default:
        return '#64748b';
    }
  };

  return (
    <div
      className={`sicn-floor-map relative w-full h-full overflow-hidden bg-[#eef2f6] select-none ${adminEditMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
      onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 1) {
          handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
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
          viewBox="0 0 1000 620"
          className="sicn-floor-map-svg w-full h-full max-w-[1380px] max-h-[860px] drop-shadow-md"
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
            <linearGradient id="corridorFill" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f8fafc" />
            </linearGradient>
          </defs>

          {/* Campus Ground Surface */}
          <rect
            x="40"
            y="25"
            width="920"
            height="570"
            rx="22"
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth="2"
          />
          <rect x="40" y="25" width="920" height="570" rx="22" fill="url(#gmapsGrid)" />

          {/* Architectural Blueprint Floor Layouts */}
          {floor === 0 ? (
            <g className="architectural-rooms">
              <rect
                x="80"
                y="50"
                width="840"
                height="520"
                rx="10"
                fill="#ffffff"
                stroke="#cbd5e1"
                strokeWidth="2.5"
              />

              {/* CAD Lab */}
              <rect x="110" y="80" width="200" height="150" rx="8" className="room-shape room-lab" />
              <text x="210" y="145" textAnchor="middle" className="room-label-bold">CAD LAB</text>
              <text x="210" y="165" textAnchor="middle" className="room-dim-text">1783 × 1239 cm</text>

              {/* Drawing Workshop */}
              <rect x="110" y="245" width="200" height="140" rx="8" className="room-shape room-workshop" />
              <text x="210" y="305" textAnchor="middle" className="room-label-bold">DRAWING WORKSHOP</text>
              <text x="210" y="325" textAnchor="middle" className="room-dim-text">891 × 1766 cm</text>

              {/* Students Club */}
              <rect x="110" y="400" width="200" height="130" rx="8" className="room-shape room-general" />
              <text x="210" y="460" textAnchor="middle" className="room-label-bold">STUDENTS CLUB</text>
              <text x="210" y="480" textAnchor="middle" className="room-dim-text">504 × 1215 cm</text>

              {/* Central Passage */}
              <rect x="320" y="245" width="360" height="80" fill="url(#corridorFill)" stroke="#e2e8f0" strokeWidth="1.5" rx="6" />
              <text x="500" y="290" textAnchor="middle" className="corridor-text">2.76 M MAIN CORRIDOR</text>

              {/* Valuation Room */}
              <rect x="440" y="80" width="160" height="150" rx="8" className="room-shape room-general" />
              <text x="520" y="145" textAnchor="middle" className="room-label-bold">VALUATION ROOM</text>
              <text x="520" y="165" textAnchor="middle" className="room-dim-text">1783 × 1239 cm</text>

              {/* Exam Cell */}
              <rect x="325" y="80" width="105" height="150" rx="8" className="room-shape room-office" />
              <text x="377" y="150" textAnchor="middle" className="room-label-bold">EXAM CELL</text>

              {/* Basic Science */}
              <rect x="610" y="80" width="150" height="150" rx="8" className="room-shape room-lab" />
              <text x="685" y="145" textAnchor="middle" className="room-label-bold">BASIC SCIENCE</text>
              <text x="685" y="165" textAnchor="middle" className="room-dim-text">1783 × 1239 cm</text>

              {/* Drawing Hall */}
              <rect x="770" y="80" width="140" height="305" rx="8" className="room-shape room-hall" />
              <text x="840" y="225" textAnchor="middle" className="room-label-bold">DRAWING HALL</text>
              <text x="840" y="245" textAnchor="middle" className="room-dim-text">1476 × 1309 cm</text>

              {/* Public Relations & Visitor */}
              <rect x="590" y="340" width="120" height="120" rx="8" className="room-shape room-office" />
              <text x="650" y="395" textAnchor="middle" className="room-label-bold">PRO OFFICE</text>
              <text x="650" y="415" textAnchor="middle" className="room-dim-text">743 × 775 cm</text>

              <rect x="720" y="340" width="110" height="120" rx="8" className="room-shape room-office" />
              <text x="775" y="405" textAnchor="middle" className="room-label-bold">VISITOR RM</text>

              {/* Main Entrance Porch */}
              <polygon points="425,535 575,535 595,475 405,475" className="entrance-porch-shape" />
              <text x="500" y="510" textAnchor="middle" className="entrance-text">MAIN ENTRANCE & RAMP</text>

              {/* Stairs & Lifts */}
              <rect x="390" y="200" width="70" height="40" className="stair-housing" rx="5" />
              <text x="425" y="224" textAnchor="middle" className="stair-text">STAIR A</text>

              <rect x="470" y="200" width="44" height="40" className="lift-housing" rx="5" />
              <text x="492" y="224" textAnchor="middle" className="lift-text">LIFT 1</text>

              <rect x="690" y="200" width="44" height="40" className="lift-housing" rx="5" />
              <text x="712" y="224" textAnchor="middle" className="lift-text">LIFT 2</text>

              <rect x="840" y="405" width="70" height="45" className="stair-housing" rx="5" />
              <text x="875" y="432" textAnchor="middle" className="stair-text">STAIR B</text>
            </g>
          ) : floor === 1 ? (
            <g className="architectural-rooms">
              <rect
                x="80"
                y="50"
                width="840"
                height="520"
                rx="10"
                fill="#ffffff"
                stroke="#cbd5e1"
                strokeWidth="2.5"
              />

              {/* Class 02 */}
              <rect x="110" y="80" width="200" height="150" rx="8" className="room-shape room-classroom" />
              <text x="210" y="145" textAnchor="middle" className="room-label-bold">CLASS 02</text>
              <text x="210" y="165" textAnchor="middle" className="room-dim-text">876 × 1203 cm • S5 CSE</text>

              {/* Class 03 */}
              <rect x="110" y="245" width="200" height="140" rx="8" className="room-shape room-classroom" />
              <text x="210" y="305" textAnchor="middle" className="room-label-bold">CLASS 03</text>
              <text x="210" y="325" textAnchor="middle" className="room-dim-text">876 × 1203 cm • S7 CSE</text>

              {/* Staff Room */}
              <rect x="110" y="400" width="200" height="130" rx="8" className="room-shape room-faculty" />
              <text x="210" y="460" textAnchor="middle" className="room-label-bold">STAFF ROOM</text>
              <text x="210" y="480" textAnchor="middle" className="room-dim-text">616 × 1235 cm</text>

              {/* 1F Corridor */}
              <rect x="320" y="245" width="360" height="80" fill="url(#corridorFill)" stroke="#e2e8f0" strokeWidth="1.5" rx="6" />
              <text x="500" y="290" textAnchor="middle" className="corridor-text">2.76 M CORRIDOR (1ST FLOOR)</text>

              {/* KTU Exam Cell */}
              <rect x="390" y="80" width="160" height="150" rx="8" className="room-shape room-office" />
              <text x="470" y="145" textAnchor="middle" className="room-label-bold">KTU EXAM CELL</text>
              <text x="470" y="165" textAnchor="middle" className="room-dim-text">1206 × 1223 cm</text>

              {/* Dept Library */}
              <rect x="560" y="80" width="130" height="150" rx="8" className="room-shape room-library" />
              <text x="625" y="145" textAnchor="middle" className="room-label-bold">DEPT LIBRARY</text>
              <text x="625" y="165" textAnchor="middle" className="room-dim-text">585 × 531 cm</text>

              {/* Senior Prof Cabins */}
              <rect x="700" y="80" width="105" height="150" rx="8" className="room-shape room-faculty" />
              <text x="752" y="145" textAnchor="middle" className="room-label-bold">SR. PROF 1</text>
              <text x="752" y="165" textAnchor="middle" className="room-dim-text">Dr. Ananya</text>

              <rect x="815" y="80" width="95" height="150" rx="8" className="room-shape room-faculty" />
              <text x="862" y="150" textAnchor="middle" className="room-label-bold">SR. PROF 2</text>

              {/* Principal & Admin */}
              <rect x="410" y="340" width="110" height="140" rx="8" className="room-shape room-principal" />
              <text x="465" y="405" textAnchor="middle" className="room-label-bold">PRINCIPAL</text>
              <text x="465" y="425" textAnchor="middle" className="room-dim-text">576 × 1044 cm</text>

              <rect x="530" y="340" width="150" height="140" rx="8" className="room-shape room-office" />
              <text x="605" y="405" textAnchor="middle" className="room-label-bold">ADMIN OFFICE</text>
              <text x="605" y="425" textAnchor="middle" className="room-dim-text">1144 × 576 cm</text>

              <rect x="690" y="340" width="120" height="140" rx="8" className="room-shape room-hall" />
              <text x="750" y="405" textAnchor="middle" className="room-label-bold">CONF. HALL</text>
              <text x="750" y="425" textAnchor="middle" className="room-dim-text">587 × 878 cm</text>

              {/* HOD Room */}
              <rect x="820" y="245" width="90" height="160" rx="8" className="room-shape room-hod" />
              <text x="865" y="315" textAnchor="middle" className="room-label-bold">HOD CS</text>
              <text x="865" y="335" textAnchor="middle" className="room-dim-text">Dr. Priya</text>

              {/* Stairs & Lifts */}
              <rect x="390" y="200" width="70" height="40" className="stair-housing" rx="5" />
              <text x="425" y="224" textAnchor="middle" className="stair-text">STAIR A</text>

              <rect x="470" y="200" width="44" height="40" className="lift-housing" rx="5" />
              <text x="492" y="224" textAnchor="middle" className="lift-text">LIFT 1</text>

              <rect x="690" y="200" width="44" height="40" className="lift-housing" rx="5" />
              <text x="712" y="224" textAnchor="middle" className="lift-text">LIFT 2</text>

              <rect x="825" y="415" width="78" height="42" className="stair-housing" rx="5" />
              <text x="864" y="440" textAnchor="middle" className="stair-text">STAIR B</text>
            </g>
          ) : (
            /* Architectural Floor Plans for Floors 2 through 7 (Parsed from BJI Plans 00000, 0002 & 003) */
            <g className="architectural-rooms">
              {/* Outer Building Slab */}
              <rect
                x="80"
                y="50"
                width="840"
                height="520"
                rx="10"
                fill={floor === 7 ? '#f8fafc' : '#ffffff'}
                stroke="#cbd5e1"
                strokeWidth="2.5"
              />

              {/* Blueprint Sheet Header */}
              <text x="500" y="76" textAnchor="middle" className="corridor-text">
                {UPPER_FLOOR_HEADERS[floor] || `FLOOR ${floor} ARCHITECTURAL PLAN`}
              </text>

              {/* Step-back Open Terrace Deck Outlines on 5F, 6F, and 7F */}
              {(floor === 5 || floor === 6) && (
                <rect
                  x="685"
                  y="92"
                  width="215"
                  height="150"
                  rx="10"
                  className="room-shape room-terrace"
                />
              )}
              {floor === 7 && (
                <rect
                  x="110"
                  y="92"
                  width="790"
                  height="210"
                  rx="12"
                  className="room-shape room-terrace"
                />
              )}

              {/* Walkable 2.76m / 2.73m Main Corridor Passages */}
              <rect
                x={floor === 7 ? '400' : '295'}
                y="222"
                width={floor === 7 ? '475' : '580'}
                height="66"
                fill="url(#corridorFill)"
                stroke="#e2e8f0"
                strokeWidth="1.5"
                rx="6"
              />
              <text x="565" y="280" textAnchor="middle" className="corridor-text">
                {floor === 7
                  ? '7TH FLOOR SKY TRANSIT PASSAGE'
                  : `2.76 M / 2.73 M MAIN CORRIDOR (FLOOR ${floor})`}
              </text>

              {/* Continuous Vertical Transit Shafts (Section A-A & Section B-B) */}
              <rect x="394" y="206" width="68" height="36" className="stair-housing" rx="5" />
              <text x="428" y="220" textAnchor="middle" className="stair-text">STAIR A</text>

              <rect x="462" y="232" width="44" height="36" className="lift-housing" rx="5" />
              <text x="484" y="246" textAnchor="middle" className="lift-text">LIFT 1</text>

              <rect x="672" y="232" width="46" height="36" className="lift-housing" rx="5" />
              <text x="695" y="246" textAnchor="middle" className="lift-text">LIFT 2</text>

              <rect x="818" y="232" width="72" height="38" className="stair-housing" rx="5" />
              <text x="854" y="247" textAnchor="middle" className="stair-text">STAIR B</text>

              {/* Architectural Room, Lab, Seminar Hall & Terrace Blocks */}
              {floorNodes
                .filter((n) => !['corridor', 'stair', 'lift'].includes(n.type))
                .map((roomNode) => {
                  const cx = scaleX(roomNode.coordinates.x);
                  const cy = scaleY(roomNode.coordinates.y);
                  const isLargeHall =
                    roomNode.nodeId.includes('SEMINAR') || roomNode.nodeId.includes('TERRACE');
                  const boxW = isLargeHall ? 156 : 108;
                  const boxH = isLargeHall ? 92 : 68;

                  return (
                    <g key={`arch-${roomNode.nodeId}`}>
                      <rect
                        x={cx - boxW / 2}
                        y={cy - boxH / 2}
                        width={boxW}
                        height={boxH}
                        rx="8"
                        className={getUpperRoomClass(roomNode)}
                      />
                      <text
                        x={cx}
                        y={cy - 14}
                        textAnchor="middle"
                        className="room-label-bold"
                      >
                        {getShortBlueprintTitle(roomNode)}
                      </text>
                      {roomNode.metadata?.dimensions && (
                        <text
                          x={cx}
                          y={cy + 23}
                          textAnchor="middle"
                          className="room-dim-text"
                        >
                          {roomNode.metadata.dimensions}
                        </text>
                      )}
                    </g>
                  );
                })}
            </g>
          )}

          {/* Graph Walkable Network Guide Lines (Visible clearly in Admin Mode, subtle otherwise) */}
          <g opacity={adminEditMode ? '0.65' : '0.18'}>
            {floorEdges.map((edge) => (
              <line
                key={edge.edgeId}
                x1={scaleX(edge.u.coordinates.x)}
                y1={scaleY(edge.u.coordinates.y)}
                x2={scaleX(edge.v.coordinates.x)}
                y2={scaleY(edge.v.coordinates.y)}
                stroke={adminEditMode ? '#6366f1' : '#94a3b8'}
                strokeWidth={adminEditMode ? '2.2' : '1.5'}
                strokeDasharray={adminEditMode ? '4 4' : 'none'}
              />
            ))}
          </g>

          {/* Active A* Route Polyline (Google Maps Blue Path) */}
          {pathPolylineSegments.map((segment, index) => {
            const points = segment.join(' ');
            return (
              <g className="rendered-path-layer" key={`floor-route-${floor}-${index}`}>
                <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.28" filter="url(#routeGlow)" />
                <polyline points={points} fill="none" stroke="#1d4ed8" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={points} fill="none" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 10" className="animated-dash-line" />
              </g>
            );
          })}

          {/* Inter-floor Transition Action Pill */}
          {floorTransitionInfo && (
            <g
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSwitchFloor?.(floorTransitionInfo.targetFloor ?? floorTransitionInfo.sourceFloor);
              }}
            >
              <rect
                x={scaleX(floorTransitionInfo.node.coordinates.x) - 82}
                y={scaleY(floorTransitionInfo.node.coordinates.y) - 46}
                width="164"
                height="30"
                rx="15"
                fill="#0f172a"
                stroke="#38bdf8"
                strokeWidth="2"
              />
              <text
                x={scaleX(floorTransitionInfo.node.coordinates.x)}
                y={scaleY(floorTransitionInfo.node.coordinates.y) - 27}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="11"
                fontWeight="700"
              >
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
              const color = getNodeColor(node);

              return (
                <g
                  key={node.nodeId}
                  className="cursor-pointer"
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
                  {(isStart || isDest) && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="20"
                      fill={color}
                      opacity="0.26"
                      className="pulsing-beacon"
                    />
                  )}

                  <circle
                    cx={cx}
                    cy={cy}
                    r={isStart || isDest ? 10.5 : isInPath ? 7 : adminEditMode ? 8 : 5.5}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={isStart || isDest ? 3 : 2}
                  />

                  {/* Custom Admin-created rooms label if outside standard blueprint labels */}
                  {adminEditMode && (
                    <text
                      x={cx}
                      y={cy - 12}
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="700"
                      fill="#334155"
                    >
                      {node.name}
                    </text>
                  )}

                  {isStart && (
                    <g>
                      <rect
                        x={cx - 32}
                        y={cy + 13}
                        width="64"
                        height="19"
                        rx="9.5"
                        fill="#059669"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <text x={cx} y={cy + 26} textAnchor="middle" fill="#fff" fontSize="9.5" fontWeight="800">
                        YOU
                      </text>
                    </g>
                  )}

                  {isDest && (
                    <g>
                      <rect
                        x={cx - 38}
                        y={cy + 13}
                        width="76"
                        height="19"
                        rx="9.5"
                        fill="#dc2626"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <text x={cx} y={cy + 26} textAnchor="middle" fill="#fff" fontSize="9.5" fontWeight="800">
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
            <g className="sicn-phone-position" transform={`translate(${scaleX(currentPosition.x)},${scaleY(currentPosition.y)})`}>
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
                    transform: `translate(${cx}px, ${cy}px)`,
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
