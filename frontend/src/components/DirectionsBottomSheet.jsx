import React, { useRef } from 'react';
import {
  Footprints,
  Clock,
  Layers,
  Accessibility,
  CheckCircle2,
  CornerDownRight,
  ArrowUp,
  Building,
  X,
  ChevronUp,
  ChevronDown,
  Navigation,
  Camera,
} from 'lucide-react';

export default function DirectionsBottomSheet({
  routeResult,
  startNode,
  destinationNode,
  snap = 'peek', // 'closed' | 'peek' | 'half' | 'full'
  setSnap,
  onClearRoute,
  onSwitchFloor,
  accessibleOnly,
  isARMode = false,
  onLaunchAR,
  activeStepIndex = 0,
  onSelectStep,
}) {
  const touchStartYRef = useRef(null);

  if (!routeResult || snap === 'closed') return null;

  const {
    totalDistance,
    estimatedTimeMinutes,
    floorsCovered = [],
    directions = [],
  } = routeResult;

  const handleTouchStart = (e) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartYRef.current === null) return;
    const endY = e.changedTouches[0].clientY;
    const deltaY = touchStartYRef.current - endY; // positive = swipe up, negative = swipe down
    touchStartYRef.current = null;

    if (deltaY > 38) {
      // Swipe UP
      if (snap === 'peek') setSnap('half');
      else if (snap === 'half') setSnap('full');
    } else if (deltaY < -38) {
      // Swipe DOWN
      if (snap === 'full') setSnap('half');
      else if (snap === 'half') setSnap('peek');
    }
  };

  const cycleSnap = () => {
    if (snap === 'peek') setSnap('half');
    else if (snap === 'half') setSnap('full');
    else setSnap('peek');
  };

  const getStepIcon = (type) => {
    switch (type) {
      case 'start':
        return <Footprints size={16} className="text-emerald-600 shrink-0" />;
      case 'stairs':
        return <ArrowUp size={16} className="text-amber-600 shrink-0" />;
      case 'lift':
        return <Building size={16} className="text-cyan-600 shrink-0" />;
      case 'arrive':
        return <CheckCircle2 size={16} className="text-rose-600 shrink-0" />;
      default:
        return <CornerDownRight size={16} className="text-blue-600 shrink-0" />;
    }
  };

  const heightClasses =
    snap === 'full'
      ? 'max-h-[75dvh]'
      : snap === 'half'
      ? 'max-h-[46dvh]'
      : 'max-h-[112px]';

  return (
    <section
      aria-label="Turn-by-turn directions drawer"
      className={`fixed bottom-16 md:bottom-20 inset-x-0 md:left-[260px] md:right-auto md:w-[410px] z-30 bg-white/98 backdrop-blur-xl rounded-t-3xl md:rounded-3xl border border-slate-200/90 shadow-[0_-8px_32px_rgba(15,23,42,0.16)] transition-all duration-300 ease-out flex flex-col overflow-hidden ${heightClasses}`}
    >
      {/* Swipe / Drag Handle Zone */}
      <div
        className="pt-2.5 pb-3 px-4 cursor-pointer select-none touch-none border-b border-slate-100"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={cycleSnap}
      >
        <div className="w-11 h-1.5 bg-slate-300 rounded-full mx-auto mb-2.5" />

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-extrabold text-emerald-600 tracking-tight">
                {estimatedTimeMinutes} min
              </span>
              <span className="text-sm font-semibold text-slate-600">
                ({totalDistance} m)
              </span>
              {accessibleOnly && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  <Accessibility size={11} /> Lift Route
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {startNode?.name || 'Start'} → <strong className="text-slate-800">{destinationNode?.name || 'Destination'}</strong>
            </p>
            {routeResult.distanceQuality?.status && routeResult.distanceQuality.status !== 'field_verified' && routeResult.distanceQuality.status !== 'not_applicable' && (
              <p
                role="status"
                className="mt-1 text-[10px] leading-snug font-semibold text-amber-700"
                title={routeResult.distanceQuality.message}
              >
                <span aria-hidden="true">ⓘ </span>
                {routeResult.distanceQuality.status === 'unverified'
                  ? 'Distance and time are provisional — some segments are unverified'
                  : routeResult.distanceQuality.status === 'plan_derived'
                    ? 'Plan-derived distance — physical site verification pending'
                    : 'Distance and time are approximate — some segments are estimates'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {onLaunchAR && (
              <button
                onClick={onLaunchAR}
                title="Launch Augmented Reality Camera Navigation"
                className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-full shadow-sm transition ${
                  isARMode
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                <Camera size={13} />
                <span>AR Live View</span>
              </button>
            )}

            <button
              onClick={cycleSnap}
              className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-full shadow-sm transition"
            >
              <Navigation size={13} />
              <span>{snap === 'peek' ? 'Steps' : snap === 'half' ? 'Expand' : 'Minimize'}</span>
              {snap === 'full' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>

            <button
              onClick={onClearRoute}
              title="Close route"
              className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Drawer Content (Visible in 'half' and 'full' states) */}
      {snap !== 'peek' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Quick Route Metrics Strip */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-2.5 text-center">
              <Footprints size={15} className="mx-auto text-blue-600 mb-0.5" />
              <div className="text-xs font-bold text-slate-900">{totalDistance} m</div>
              <div className="text-[10px] text-slate-500">Distance</div>
            </div>
            <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-2.5 text-center">
              <Clock size={15} className="mx-auto text-blue-600 mb-0.5" />
              <div className="text-xs font-bold text-slate-900">{estimatedTimeMinutes} min</div>
              <div className="text-[10px] text-slate-500">Walk Time</div>
            </div>
            <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-2.5 text-center">
              <Layers size={15} className="mx-auto text-blue-600 mb-0.5" />
              <div className="text-xs font-bold text-slate-900">
                {floorsCovered.map((f) => (f === 0 ? 'GF' : `F${f}`)).join(' → ')}
              </div>
              <div className="text-[10px] text-slate-500">Floors</div>
            </div>
          </div>

          {/* Step-by-Step Timeline */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Turn-by-Turn Steps
              </h4>
              <span className="text-[11px] font-medium text-slate-400">
                {directions.length} waypoints
              </span>
            </div>

            <div className="space-y-0">
              {directions.map((d, index) => {
                const isTransit = d.type === 'stairs' || d.type === 'lift';
                const isActiveStep = activeStepIndex === Math.max(0, index - 1);
                return (
                  <div
                    key={index}
                    onClick={() => {
                      onSwitchFloor?.(d.floor);
                      onSelectStep?.(Math.max(0, index - 1));
                    }}
                    className={`flex gap-3 py-2.5 px-2 rounded-xl cursor-pointer transition hover:bg-slate-50 ${
                      isTransit
                        ? 'bg-amber-50/60 border border-amber-200/70 my-1'
                        : isActiveStep
                        ? 'bg-blue-50/50'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col items-center pt-0.5">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                        {getStepIcon(d.type)}
                      </div>
                      {index < directions.length - 1 && (
                        <div className="w-0.5 flex-1 bg-slate-200 mt-1 min-h-[14px]" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-slate-800 leading-snug">
                        {d.instruction}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {d.floor === 0 ? 'Ground Floor' : `Floor ${d.floor}`}
                        </span>
                        {d.distance > 0 && (
                          <span className="text-[11px] font-semibold text-slate-500">
                            {d.distance} m
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

