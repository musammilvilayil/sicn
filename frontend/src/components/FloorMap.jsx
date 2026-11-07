import React, { useState, useMemo, useRef } from 'react';

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

  // Floor transition badge info
  const floorTransitionInfo = useMemo(() => {
    if (!routeResult?.path) return null;
    const path = routeResult.path;
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
        } else if (v.floor === floor) {
          return {
            type: 'entry',
            node: v,
            sourceFloor: u.floor,
            transitType: v.type === 'lift' ? 'Elevator' : 'Stairs',
          };
        }
      }
    }
    return null;
  }, [routeResult, floor]);

  // Polyline points for active floor route segments
  const pathPolylinePoints = useMemo(() => {
    if (!routeResult?.path || routeResult.path.length < 2) return '';
    return routeResult.path
      .filter((curr) => curr.floor === floor)
      .map((curr) => `${scaleX(curr.coordinates.x)},${scaleY(curr.coordinates.y)}`)
      .join(' ');
  }, [routeResult, floor]);

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
      className={`relative w-full h-full overflow-hidden bg-[#eef2f6] select-none ${
        adminEditMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
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
          className="w-full h-full max-w-[1380px] max-h-[860px] drop-shadow-md"
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

              <rect x="840" y="400" width="70" height="45" className="stair-housing" rx="5" />
              <text x="875" y="427" textAnchor="middle" className="stair-text">STAIR B</text>
            </g>
          ) : (
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
          {pathPolylinePoints && (
            <g className="rendered-path-layer">
              <polyline
                points={pathPolylinePoints}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.28"
                filter="url(#routeGlow)"
              />
              <polyline
                points={pathPolylinePoints}
                fill="none"
                stroke="#1d4ed8"
                strokeWidth="6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={pathPolylinePoints}
                fill="none"
                stroke="#93c5fd"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="8 10"
                className="animated-dash-line"
              />
            </g>
          )}

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
                  ? `↗ ${floorTransitionInfo.transitType} to Floor ${floorTransitionInfo.targetFloor}`
                  : `↘ From Floor ${floorTransitionInfo.sourceFloor === 0 ? 'GF' : floorTransitionInfo.sourceFloor}`}
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
