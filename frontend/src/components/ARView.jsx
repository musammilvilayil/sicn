import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Compass,
  Map as MapIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ArrowUp,
  Navigation,
  Sparkles,
  Camera,
  ShieldAlert,
  Play,
  Loader2,
  Smartphone,
} from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';

// Singleton promise so A-Frame + AR.js custom elements & components register once per session
let aframeBootstrapPromise = null;

async function ensureAFrameAndARJS() {
  if (typeof window === 'undefined') return null;
  if (aframeBootstrapPromise) return aframeBootstrapPromise;

  aframeBootstrapPromise = (async () => {
    const aframeModule = await import('aframe');
    const AFRAME = window.AFRAME || aframeModule.default || aframeModule;

    if (AFRAME && !window.AFRAME) {
      window.AFRAME = AFRAME;
    }
    if (AFRAME?.THREE && !window.THREE) {
      window.THREE = AFRAME.THREE;
    }

    // Load AR.js location/orientation module on top of A-Frame
    try {
      await import('@ar-js-org/ar.js/aframe/build/aframe-ar-location-only.js');
    } catch (err) {
      console.warn('AR.js optional extension warning:', err);
    }

    // Register custom smooth 3D directional arrow component on A-Frame
    if (AFRAME && !AFRAME.components['ar-nav-arrow']) {
      AFRAME.registerComponent('ar-nav-arrow', {
        schema: {
          yaw: { type: 'number', default: 0 },
          pitch: { type: 'number', default: 0 },
          color: { type: 'string', default: '#3b82f6' },
        },
        init() {
          this.currentYaw = this.data.yaw;
          this.currentPitch = this.data.pitch;
          this.pulsePhase = 0;
          this.applyColors(this.data.color);
        },
        update(oldData) {
          if (oldData.color !== this.data.color) {
            this.applyColors(this.data.color);
          }
        },
        applyColors(hexColor) {
          const meshes = this.el.querySelectorAll('[data-arrow-tint]');
          meshes.forEach((meshEl) => {
            meshEl.setAttribute('material', 'color', hexColor);
            meshEl.setAttribute('material', 'emissive', hexColor);
          });
        },
        tick(_time, timeDelta) {
          const dt = Math.min((timeDelta || 16) / 1000, 0.1);
          // Shortest angular delta in [-180, 180] for smooth compass wraparound
          const deltaYaw = ((this.data.yaw - this.currentYaw + 540) % 360) - 180;
          this.currentYaw = (this.currentYaw + deltaYaw * Math.min(1, dt * 10) + 360) % 360;

          const deltaPitch = this.data.pitch - this.currentPitch;
          this.currentPitch += deltaPitch * Math.min(1, dt * 8);

          // Subtle floating hover animation in 3D space
          this.pulsePhase += dt * 3.2;
          const bobOffset = Math.sin(this.pulsePhase) * 0.045;

          this.el.object3D.position.set(0, -0.32 + bobOffset, -2.6);
          this.el.object3D.rotation.set(
            (this.currentPitch * Math.PI) / 180,
            (this.currentYaw * Math.PI) / 180,
            0,
            'YXZ'
          );
        },
      });
    }

    return AFRAME;
  })();

  return aframeBootstrapPromise;
}

/**
 * Tilt-compensated compass heading [0, 360) clockwise from North
 * Handles upright phone camera posture (W3C DeviceOrientation / AR.js math)
 */
function extractCompassHeading(event) {
  if (typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) {
    return (event.webkitCompassHeading + 360) % 360;
  }

  if (event.alpha === null || event.alpha === undefined || !Number.isFinite(event.alpha)) {
    return null;
  }

  const degToRad = Math.PI / 180;
  const alphaRad = event.alpha * degToRad;
  const betaRad = (event.beta || 0) * degToRad;
  const gammaRad = (event.gamma || 0) * degToRad;

  const cZ = Math.cos(alphaRad);
  const sZ = Math.sin(alphaRad);
  const sX = Math.sin(betaRad);
  const cY = Math.cos(gammaRad);
  const sY = Math.sin(gammaRad);

  const Vx = -cZ * sY - sZ * sX * cY;
  const Vy = -sZ * sY + cZ * sX * cY;

  // Use tilt-compensated vector when device is held upright; fallback to flat alpha when horizontal
  if (Math.hypot(Vx, Vy) > 0.08) {
    let headingRad = Math.atan(Vx / Vy);
    if (Vy < 0) {
      headingRad += Math.PI;
    } else if (Vx < 0) {
      headingRad += 2 * Math.PI;
    }
    return ((headingRad * 180) / Math.PI + 360) % 360;
  }

  const screenAngle = window.screen?.orientation?.angle || window.orientation || 0;
  return (360 - event.alpha + screenAngle + 360) % 360;
}

function formatCardinal(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export default function ARView() {
  const {
    routeResult,
    activeStepIndex,
    setActiveStepIndex,
    setCurrentFloor,
    fallbackTo2DMap,
  } = useNavigation();

  const videoRef = useRef(null);
  const arrowRigRef = useRef(null);
  const streamRef = useRef(null);
  const orientationCleanupRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // 'prompt' -> 'requesting' -> 'active' | 'denied'
  const [sessionState, setSessionState] = useState('prompt');
  const [errorMessage, setErrorMessage] = useState('');
  const [aframeReady, setAframeReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [userHeading, setUserHeading] = useState(null);
  const [orientationAvailable, setOrientationAvailable] = useState(false);

  const cleanupMediaAndSensors = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (orientationCleanupRef.current) {
      orientationCleanupRef.current();
      orientationCleanupRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const showDeniedAndFallback = useCallback(
    (msg) => {
      if (!mountedRef.current) return;
      cleanupMediaAndSensors();
      const displayMsg = msg || 'Camera or Motion blocked. Enable them in browser settings.';
      setErrorMessage(displayMsg);
      setSessionState('denied');

      fallbackTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          fallbackTo2DMap(displayMsg, 'error');
        }
      }, 3200);
    },
    [cleanupMediaAndSensors, fallbackTo2DMap]
  );

  // Preload A-Frame & AR.js custom elements in background while user views the Start AR Session prompt
  useEffect(() => {
    mountedRef.current = true;
    ensureAFrameAndARJS()
      .then(() => {
        if (mountedRef.current) setAframeReady(true);
      })
      .catch((err) => {
        console.error('Failed to initialize A-Frame/AR.js:', err);
      });

    return () => {
      mountedRef.current = false;
      cleanupMediaAndSensors();
    };
  }, [cleanupMediaAndSensors]);

  // Attach DeviceOrientation (compass / gyroscope) listeners once user grants permission
  const attachOrientationListeners = useCallback(() => {
    if (orientationCleanupRef.current) {
      orientationCleanupRef.current();
    }

    let receivedValidReading = false;

    const handleOrientation = (event) => {
      const heading = extractCompassHeading(event);
      if (heading === null) return;

      receivedValidReading = true;
      setUserHeading(heading);
      setOrientationAvailable(true);
    };

    const sensorWatchdog = setTimeout(() => {
      if (!receivedValidReading && mountedRef.current) {
        // Camera guidance is still useful on devices without a browser compass.
        setOrientationAvailable(false);
        setErrorMessage('Compass sensor is unavailable. Follow the step instructions and scan QR checkpoints to recalibrate.');
      }
    }, 2600);

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);

    orientationCleanupRef.current = () => {
      clearTimeout(sensorWatchdog);
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [showDeniedAndFallback]);

  /**
   * Explicit User Gesture Handler triggered by clicking "Start AR Session".
   * Sequentially requests Gyroscope/Compass (crucial synchronous iOS 13+ trigger)
   * and WebRTC Camera permissions.
   */
  const handleStartARSession = async () => {
    setErrorMessage('');
    setSessionState('requesting');

    try {
      let orientationPermissionGranted = true;
      // 1. Crucial for iOS 13+: Trigger DeviceOrientationEvent.requestPermission()
      // directly from this exact button click BEFORE any prior async await expires
      // Safari WebKit's transient user-gesture activation token.
      if (typeof window === 'undefined') {
        throw new Error('This feature requires a supported browser.');
      }

      // Compass permission is optional; camera guidance still works without it.
      if (
        'DeviceOrientationEvent' in window &&
        typeof window.DeviceOrientationEvent.requestPermission === 'function'
      ) {
        try {
          const motionPermission = await window.DeviceOrientationEvent.requestPermission();
          orientationPermissionGranted = motionPermission === 'granted';
        } catch {
          orientationPermissionGranted = false;
        }
      }

      // 2. Sequentially request Rear Camera via WebRTC (navigator.mediaDevices.getUserMedia)
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Camera or Motion blocked. Use the secure HTTPS URL and enable permissions in browser settings.'
        );
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (camErr) {
        // Do not retry if the user or browser explicitly denied camera permission
        if (
          camErr?.name === 'NotAllowedError' ||
          camErr?.name === 'PermissionDeniedError' ||
          camErr?.name === 'SecurityError'
        ) {
          throw new Error('Camera or Motion blocked. Enable them in browser settings.');
        }
        // Fallback to generic camera constraint (e.g. single-lens device)
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);

      // 3. Subscribe to live compass/gyroscope orientation stream & activate AR HUD
      if ('DeviceOrientationEvent' in window && orientationPermissionGranted) {
        attachOrientationListeners();
      } else {
        setOrientationAvailable(false);
        setErrorMessage('This device does not expose a browser compass. Camera guidance is available; follow the step card and scan QR checkpoints to recalibrate.');
      }
      setSessionState('active');
    } catch (err) {
      console.warn('AR Session permission error:', err);
      const deniedMsg =
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          ? 'Camera or Motion blocked. Enable them in browser settings.'
          : err?.message || 'Camera or Motion blocked. Enable them in browser settings.';
      showDeniedAndFallback(deniedMsg);
    }
  };

  // Derive current & next A* path nodes, target bearing, and 3D arrow orientation
  const navMetrics = useMemo(() => {
    const path = routeResult?.path || [];
    const directions = routeResult?.directions || [];
    if (path.length < 2) return null;

    const maxStartIdx = path.length - 2;
    const idx = Math.max(0, Math.min(activeStepIndex, maxStartIdx));
    const isFinalLeg = idx >= maxStartIdx;

    const currNode = path[idx];
    const nextNode = path[idx + 1];

    // Map coordinate system: +x = East, +y = North
    const dx = (nextNode?.coordinates?.x ?? 0) - (currNode?.coordinates?.x ?? 0);
    const dy = (nextNode?.coordinates?.y ?? 0) - (currNode?.coordinates?.y ?? 0);

    // Bearing clockwise from North [0, 360)
    const targetBearing =
      Math.hypot(dx, dy) > 0.001
        ? ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
        : 0;

    const effectiveHeading = userHeading ?? 0;
    // Relative angle in [-180, +180]: positive = turn right, negative = turn left
    const relativeAngle = ((targetBearing - effectiveHeading + 540) % 360) - 180;

    // Floor transition pitch (upstairs/lift up = +32 deg, downstairs/lift down = -32 deg)
    const floorDelta = (nextNode?.floor ?? 0) - (currNode?.floor ?? 0);
    const pitch = floorDelta > 0 ? 32 : floorDelta < 0 ? -32 : 0;

    const isAligned = userHeading !== null && Math.abs(relativeAngle) <= 20;
    const isFloorChange = floorDelta !== 0;

    const arrowColor = isFloorChange
      ? '#f59e0b'
      : isAligned
      ? '#10b981'
      : '#3b82f6';

    const stepDirection =
      directions[idx + 1] ||
      directions[idx] || {
        instruction: `Proceed toward ${nextNode?.name || 'next checkpoint'}`,
        distance: Math.round(Math.hypot(dx, dy)),
        floor: nextNode?.floor ?? 0,
      };

    return {
      idx,
      totalWaypoints: path.length,
      currNode,
      nextNode,
      targetBearing,
      relativeAngle,
      aframeYaw: -relativeAngle,
      aframePitch: pitch,
      arrowColor,
      isAligned,
      isFloorChange,
      floorDelta,
      isFinalLeg,
      stepDirection,
    };
  }, [routeResult, activeStepIndex, userHeading]);

  // Sync updated yaw/pitch/color attributes into A-Frame custom component
  useEffect(() => {
    if (sessionState !== 'active' || !aframeReady || !arrowRigRef.current || !navMetrics) return;
    arrowRigRef.current.setAttribute(
      'ar-nav-arrow',
      `yaw: ${navMetrics.aframeYaw.toFixed(2)}; pitch: ${navMetrics.aframePitch.toFixed(
        2
      )}; color: ${navMetrics.arrowColor}`
    );
  }, [sessionState, aframeReady, navMetrics]);

  if (!navMetrics) return null;

  const turnGuidance = navMetrics.isFloorChange
    ? navMetrics.floorDelta > 0
      ? 'Take Stairs / Lift Up'
      : 'Take Stairs / Lift Down'
    : !orientationAvailable
    ? (navMetrics.stepDirection?.instruction || 'Follow the next navigation step')
    : navMetrics.isAligned
    ? 'Aligned • Walk Straight'
    : navMetrics.relativeAngle > 0
    ? `Turn Right ${Math.round(Math.abs(navMetrics.relativeAngle))}°`
    : `Turn Left ${Math.round(Math.abs(navMetrics.relativeAngle))}°`;

  const handleStepChange = (nextIdx) => {
    const path = routeResult?.path || [];
    const clamped = Math.max(0, Math.min(nextIdx, Math.max(0, path.length - 2)));
    setActiveStepIndex(clamped);
    if (path[clamped]) {
      setCurrentFloor(path[clamped].floor);
    }
  };

  return (
    <div className="fixed inset-0 z-20 bg-slate-950 overflow-hidden select-none">
      {/* Live WebRTC Rear Camera Video Element (kept mounted so iOS Safari play() inherits user gesture) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          sessionState === 'active' && cameraReady ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* ======================================================== */}
      {/* EXPLICIT USER-GESTURE "START AR SESSION" OVERLAY         */}
      {/* ======================================================== */}
      {(sessionState === 'prompt' || sessionState === 'requesting') && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl">
          <div className="w-full max-w-sm bg-slate-900 border border-white/15 rounded-3xl p-6 text-white shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
                <Smartphone size={24} className="text-indigo-400" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400">
                  3D Camera Wayfinding
                </span>
                <h2 className="text-lg font-extrabold tracking-tight text-white">
                  Start AR Session
                </h2>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Point your phone down the hallway to follow a live 3D directional arrow toward{' '}
              <strong className="text-white">{navMetrics.nextNode?.name}</strong>. Tap below to
              grant access to:
            </p>

            <div className="space-y-2.5">
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5">
                <Camera size={17} className="text-blue-400 shrink-0" />
                <div className="text-xs">
                  <div className="font-bold text-white">Rear Camera Feed</div>
                  <div className="text-[11px] text-slate-400">Live hallway video overlay (WebRTC)</div>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5">
                <Compass size={17} className="text-emerald-400 shrink-0" />
                <div className="text-xs">
                  <div className="font-bold text-white">Compass & Gyroscope</div>
                  <div className="text-[11px] text-slate-400">
                    Motion & Orientation tracking (iOS / Android)
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleStartARSession}
                disabled={sessionState === 'requesting'}
                className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-60 text-white text-sm font-extrabold py-3.5 px-4 rounded-2xl shadow-lg shadow-indigo-600/30 transition"
              >
                {sessionState === 'requesting' ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    <span>Requesting Permissions...</span>
                  </>
                ) : (
                  <>
                    <Play size={16} fill="currentColor" />
                    <span>Start AR Session</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => fallbackTo2DMap()}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-bold py-2.5 px-4 rounded-2xl transition"
              >
                <MapIcon size={14} />
                <span>Use Standard 2D Map Instead</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PERMISSION BLOCKED / SENSOR ERROR OVERLAY -> 2D FALLBACK */}
      {/* ======================================================== */}
      {sessionState === 'denied' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl">
          <div className="w-full max-w-sm bg-slate-900 border border-rose-500/40 rounded-3xl p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center shrink-0">
                <ShieldAlert size={24} className="text-rose-400" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">
                  AR Permissions Blocked
                </span>
                <h2 className="text-base font-extrabold text-white">
                  Unable to Start AR View
                </h2>
              </div>
            </div>

            <div className="bg-rose-500/15 border border-rose-500/30 rounded-2xl p-3.5 text-xs font-semibold text-rose-200 leading-relaxed">
              {errorMessage || 'Camera or Motion blocked. Enable them in browser settings.'}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Check your browser site permissions (Camera &amp; Motion/Orientation) and reload if
              needed. Returning smoothly to the 2D Floor Map...
            </p>

            <button
              type="button"
              onClick={() => {
                cleanupMediaAndSensors();
                fallbackTo2DMap(
                  errorMessage || 'Camera or Motion blocked. Enable them in browser settings.',
                  'error'
                );
              }}
              className="w-full inline-flex items-center justify-center gap-2 bg-white text-slate-900 hover:bg-slate-100 text-xs font-extrabold py-3 px-4 rounded-2xl shadow transition"
            >
              <MapIcon size={15} />
              <span>Return to 2D Map Now</span>
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ACTIVE AR SESSION: 3D ARROW SCENE & NAVIGATION HUD       */}
      {/* ======================================================== */}
      {sessionState === 'active' && (
        <>
          {/* Subtle Vignette for HUD Contrast over bright hallways */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-slate-950/65 via-transparent to-slate-950/75" />

          {/* Transparent Embedded A-Frame + AR.js 3D Directional Arrow Scene */}
          {aframeReady && orientationAvailable && (
            <div className="absolute inset-0 pointer-events-none">
              <a-scene
                embedded
                vr-mode-ui="enabled: false"
                xr-mode-ui="enabled: false"
                device-orientation-permission-ui="enabled: false"
                renderer="alpha: true; antialias: true; colorManagement: true;"
                style={{ width: '100%', height: '100%' }}
              >
                <a-light type="ambient" color="#ffffff" intensity="0.95" />
                <a-light type="directional" color="#ffffff" intensity="1.15" position="1 3 2" />

                <a-camera
                  position="0 0 0"
                  look-controls="enabled: false"
                  wasd-controls="enabled: false"
                />

                {/* 3D Floating Directional Arrow Rig */}
                <a-entity
                  ref={arrowRigRef}
                  position="0 -0.32 -2.6"
                  ar-nav-arrow={`yaw: ${navMetrics.aframeYaw}; pitch: ${navMetrics.aframePitch}; color: ${navMetrics.arrowColor}`}
                >
                  {/* Glowing Horizon Compass Halo */}
                  <a-ring
                    rotation="-90 0 0"
                    position="0 -0.22 0"
                    radius-inner="0.48"
                    radius-outer="0.56"
                    material="color: #ffffff; opacity: 0.35; transparent: true; side: double"
                  />
                  <a-torus
                    data-arrow-tint="true"
                    rotation="90 0 0"
                    position="0 -0.22 0"
                    radius="0.52"
                    radius-tubular="0.018"
                    material={`color: ${navMetrics.arrowColor}; emissive: ${navMetrics.arrowColor}; emissiveIntensity: 0.45; opacity: 0.85; transparent: true`}
                  />

                  {/* 3D Arrow Shaft pointing along -Z (forward into camera view) */}
                  <a-cylinder
                    data-arrow-tint="true"
                    position="0 0 0.18"
                    rotation="90 0 0"
                    radius="0.095"
                    height="0.68"
                    material={`color: ${navMetrics.arrowColor}; emissive: ${navMetrics.arrowColor}; emissiveIntensity: 0.3; metalness: 0.25; roughness: 0.3`}
                  />

                  {/* 3D Arrowhead Cone pointing toward -Z */}
                  <a-cone
                    data-arrow-tint="true"
                    position="0 0 -0.34"
                    rotation="-90 0 0"
                    radius-bottom="0.26"
                    radius-top="0.005"
                    height="0.48"
                    material={`color: ${navMetrics.arrowColor}; emissive: ${navMetrics.arrowColor}; emissiveIntensity: 0.38; metalness: 0.25; roughness: 0.25`}
                  />

                  {/* Tail Stabilizer Accent Ring */}
                  <a-torus
                    position="0 0 0.48"
                    radius="0.11"
                    radius-tubular="0.02"
                    material="color: #f8fafc; opacity: 0.9; transparent: true"
                  />
                </a-entity>
              </a-scene>
            </div>
          )}

          {/* Initializing Compass Sensor Calibration Indicator */}
          {!orientationAvailable && (
            <div className="absolute top-28 inset-x-4 z-20 flex justify-center pointer-events-none">
              <div className="max-w-md bg-slate-950/80 backdrop-blur-md text-white px-4 py-3 rounded-2xl border border-amber-300/30 shadow-xl text-center">
                <div className="text-xs font-bold text-amber-200">Camera guidance mode</div>
                <p className="text-[11px] text-slate-200 mt-1">
                  Compass is not available on this device. Follow the step instructions below and scan a QR checkpoint to recalibrate.
                </p>
              </div>
            </div>
          )}

          {/* TOP AR COMPASS & EXIT HUD */}
          <div className="fixed top-3 inset-x-3 md:left-1/2 md:-translate-x-1/2 md:w-[460px] z-40 flex flex-col gap-2">
            <div className="bg-slate-900/85 backdrop-blur-xl text-white rounded-3xl px-4 py-2.5 border border-white/15 shadow-2xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
                  <Compass size={18} className="text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-300">
                      AR Live View
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <div className="text-xs font-semibold text-slate-200 truncate">
                    Heading:{' '}
                    <strong>
                      {orientationAvailable && userHeading !== null
                        ? `${Math.round(userHeading)}° ${formatCardinal(userHeading)}`
                        : 'Compass unavailable · Step guidance'}
                    </strong>{' '}
                    • Target {Math.round(navMetrics.targetBearing)}°
                  </div>
                </div>
              </div>

              <button
                onClick={() => fallbackTo2DMap()}
                className="inline-flex items-center gap-1.5 bg-white text-slate-900 hover:bg-slate-100 text-xs font-extrabold px-3.5 py-2 rounded-full shadow-md transition shrink-0"
              >
                <MapIcon size={14} />
                <span>2D Map</span>
              </button>
            </div>

            {/* Live Alignment Guidance Pill */}
            <div className="flex justify-center">
              <div
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold shadow-lg border backdrop-blur-md transition-colors ${
                  navMetrics.isFloorChange
                    ? 'bg-amber-500/90 text-slate-950 border-amber-300'
                    : navMetrics.isAligned
                    ? 'bg-emerald-500/90 text-white border-emerald-300'
                    : 'bg-slate-900/80 text-white border-white/20'
                }`}
              >
                {navMetrics.isFloorChange ? (
                  <ArrowUp
                    size={14}
                    className={navMetrics.floorDelta < 0 ? 'rotate-180' : ''}
                  />
                ) : navMetrics.isAligned ? (
                  <Sparkles size={14} />
                ) : (
                  <Navigation size={14} />
                )}
                <span>{turnGuidance}</span>
              </div>
            </div>
          </div>

          {/* BOTTOM NEXT-NODE WAYPOINT STEPPER CARD */}
          <div className="fixed bottom-20 md:bottom-24 inset-x-3 md:left-1/2 md:-translate-x-1/2 md:w-[460px] z-40">
            <div className="bg-slate-900/90 backdrop-blur-xl text-white rounded-3xl p-4 border border-white/15 shadow-2xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/25 text-blue-300 border border-blue-400/30">
                      Waypoint {navMetrics.idx + 1} of {navMetrics.totalWaypoints - 1}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-200">
                      {navMetrics.nextNode?.floor === 0
                        ? 'Ground Floor'
                        : `Floor ${navMetrics.nextNode?.floor}`}
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-extrabold text-white mt-1.5 truncate">
                    Next: {navMetrics.nextNode?.name}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                    {navMetrics.stepDirection?.instruction}
                  </p>
                </div>

                {navMetrics.stepDirection?.distance > 0 && (
                  <div className="bg-white/10 border border-white/15 rounded-2xl px-3 py-2 text-center shrink-0">
                    <div className="text-sm font-extrabold text-emerald-400">
                      {navMetrics.stepDirection.distance}m
                    </div>
                    <div className="text-[10px] text-slate-300 font-medium">ahead</div>
                  </div>
                )}
              </div>

              {/* Stepper Controls to advance along A* path nodes */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                <button
                  onClick={() => handleStepChange(navMetrics.idx - 1)}
                  disabled={navMetrics.idx === 0}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-35 text-xs font-bold transition"
                >
                  <ChevronLeft size={15} />
                  <span>Prev</span>
                </button>

                <span className="text-[11px] text-slate-400 truncate">
                  From: <strong className="text-slate-200">{navMetrics.currNode?.name}</strong>
                </span>

                {!navMetrics.isFinalLeg ? (
                  <button
                    onClick={() => handleStepChange(navMetrics.idx + 1)}
                    className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition"
                  >
                    <span>Next Node</span>
                    <ChevronRight size={15} />
                  </button>
                ) : (
                  <button
                    onClick={() => fallbackTo2DMap('Arrived at destination!')}
                    className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition"
                  >
                    <CheckCircle2 size={14} />
                    <span>Arrive</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
