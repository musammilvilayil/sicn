import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Html5Qrcode } from 'html5-qrcode';
import { useSocket } from '../context/SocketContext';
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
import { validateRouteCheckpoint, getRouteSegmentBearing } from '../utils/indoorNavigation';

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
  const navigate = useNavigate();
  const { broadcastCheckpoint } = useSocket();
  const {
    routeResult,
    currentFloor,
    activeStepIndex,
    setActiveStepIndex,
    setCurrentFloor,
    setStartNodeId,
    destinationNodeId,
    accessibleOnly,
    nodes,
    computeRoute,
    showToast,
    fallbackTo2DMap,
  } = useNavigation();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const orientationCleanupRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // 'prompt' -> 'requesting' -> 'active' | 'denied'
  const [sessionState, setSessionState] = useState('prompt');
  const [errorMessage, setErrorMessage] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [userHeading, setUserHeading] = useState(null);
  const [orientationAvailable, setOrientationAvailable] = useState(false);
  const [qrDetectionAvailable, setQrDetectionAvailable] = useState(false);
  const [motionAvailable, setMotionAvailable] = useState(false);
  const [walkedMeters, setWalkedMeters] = useState(0);
  const [pendingCheckpoint, setPendingCheckpoint] = useState(null);
  const [confirmedTransition, setConfirmedTransition] = useState(null);
  const walkedMetersRef = useRef(0);
  const stepPeakRef = useRef({ above: false, lastStepAt: 0 });
  const qrDetectionLockRef = useRef(false);
  const lastQrValueRef = useRef('');
  const cameraApiAvailable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const secureContextAvailable = typeof window !== 'undefined' && window.isSecureContext;
  const orientationApiAvailable = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;

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

      // Keep the diagnostic visible until the user chooses Retry or the 2D map.
      // Do not auto-dismiss: users need time to change Safari site permissions.
    },
    [cleanupMediaAndSensors, fallbackTo2DMap]
  );

  // Keep camera lifecycle independent of optional WebGL frameworks for iOS Safari stability.
  useEffect(() => {
    mountedRef.current = true;
    setQrDetectionAvailable(typeof window !== 'undefined' && 'BarcodeDetector' in window);
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
      // Secure-context checks must happen before any permission request. LAN HTTP
      // addresses (for example, http://192.168.x.x) cannot access camera/sensors on iOS.
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          `This page is not a secure HTTPS connection (${window.location.origin}). Open SICN using its HTTPS testing URL, then allow Camera and Motion & Orientation access in Safari.`
        );
      }

      let orientationPermissionGranted = true;
      // 1. Crucial for iOS 13+: Trigger DeviceOrientationEvent.requestPermission()
      // directly from this exact button click BEFORE any prior async await expires
      // Safari WebKit's transient user-gesture activation token.
      if (typeof window === 'undefined') {
        throw new Error('This feature requires a supported browser.');
      }

      // Request iOS sensor permissions directly from this click before awaiting either prompt.
      const permissionRequests = [];
      let orientationRequestIndex = -1;
      let motionRequestIndex = -1;
      if ('DeviceOrientationEvent' in window && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        orientationRequestIndex = permissionRequests.length;
        permissionRequests.push(window.DeviceOrientationEvent.requestPermission().catch(() => 'denied'));
      }
      if ('DeviceMotionEvent' in window && typeof window.DeviceMotionEvent.requestPermission === 'function') {
        motionRequestIndex = permissionRequests.length;
        permissionRequests.push(window.DeviceMotionEvent.requestPermission().catch(() => 'denied'));
      }
      const permissionResults = await Promise.all(permissionRequests);
      if (orientationRequestIndex >= 0) {
        orientationPermissionGranted = permissionResults[orientationRequestIndex] === 'granted';
      }
      if (motionRequestIndex >= 0) {
        setMotionAvailable(permissionResults[motionRequestIndex] === 'granted');
      }

      // 2. Request the rear camera via WebRTC after the sensor permission calls
      // have been invoked synchronously from this button gesture.
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
          throw new Error('Safari blocked camera access. Open Website Settings for this site, set Camera to Allow, then retry SICN.');
        }
        // Fallback to generic camera constraint (e.g. single-lens device)
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch (fallbackCameraError) {
          if (fallbackCameraError?.name === 'NotFoundError') {
            throw new Error('No camera was found on this device.');
          }
          if (fallbackCameraError?.name === 'NotReadableError') {
            throw new Error('The camera is busy in another app or browser tab. Close it and retry.');
          }
          throw new Error('Safari could not open the camera. Check this site’s Camera permission and retry.');
        }
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
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

  // Scan the same rear-camera frames for QR checkpoints. BarcodeDetector is used when
  // available; html5-qrcode frame decoding provides a Safari/iOS fallback without opening
  // a second camera stream.
  useEffect(() => {
    if (sessionState !== 'active' || !cameraReady) return undefined;
    let cancelled = false;
    let timerId;
    let lastAttemptAt = 0;
    let detector = null;
    let frameScanner = null;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if ('BarcodeDetector' in window) {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        setQrDetectionAvailable(true);
      } catch {
        detector = null;
      }
    }
    if (!detector) {
      try {
        frameScanner = new Html5Qrcode('sicn-ar-qr-reader', { verbose: false });
        setQrDetectionAvailable(true);
      } catch {
        setQrDetectionAvailable(false);
      }
    }

    const verifyValue = async (rawValue) => {
      if (!rawValue || qrDetectionLockRef.current || rawValue === lastQrValueRef.current) return;
      qrDetectionLockRef.current = true;
      try {
        const checkpoint = await api.getNodeByQR(rawValue);
        if (!cancelled && checkpoint?.nodeId) {
          // Stop repeated detections of the same visible QR while the user confirms it.
          lastQrValueRef.current = rawValue;
          setPendingCheckpoint({ ...checkpoint, qrValue: rawValue });
        }
      } catch {
        // Ignore unrelated QR codes in posters, notices or personal devices.
      } finally {
        qrDetectionLockRef.current = false;
      }
    };

    const scanFrame = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !pendingCheckpoint && !qrDetectionLockRef.current && Date.now() - lastAttemptAt > 900) {
        lastAttemptAt = Date.now();
        try {
          if (detector) {
            const codes = await detector.detect(video);
            await verifyValue(codes?.[0]?.rawValue);
          } else if (frameScanner && context) {
            const width = Math.min(video.videoWidth || 640, 640);
            const height = Math.max(1, Math.round(width * (video.videoHeight || 480) / (video.videoWidth || 640)));
            canvas.width = width;
            canvas.height = height;
            context.drawImage(video, 0, 0, width, height);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.62));
            if (blob && !cancelled) {
              const frameFile = new File([blob], 'sicn-camera-frame.jpg', { type: 'image/jpeg' });
              const value = await frameScanner.scanFile(frameFile, false);
              await verifyValue(value);
            }
          }
        } catch {
          // No QR in this frame is expected; keep scanning without interrupting navigation.
        }
      }
      timerId = window.setTimeout(scanFrame, 1000);
    };

    scanFrame();
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      qrDetectionLockRef.current = false;
      try {
        frameScanner?.clear();
      } catch {
        // Ignore scanner cleanup races during route changes.
      }
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [sessionState, cameraReady, pendingCheckpoint, destinationNodeId, accessibleOnly, nodes, computeRoute, setStartNodeId, setCurrentFloor, showToast, broadcastCheckpoint]);

  const confirmCheckpoint = useCallback(async () => {
    if (!pendingCheckpoint?.nodeId) return;
    const checkpoint = pendingCheckpoint;
    const validation = validateRouteCheckpoint(
      routeResult, activeStepIndex, checkpoint, currentFloor, confirmedTransition
    );
    setPendingCheckpoint(null);

    if (!validation.valid) {
      // Let the camera detect the same plaque again after the user follows the
      // correction prompt or moves to the expected landing.
      lastQrValueRef.current = '';
      showToast(validation.reason, 'error');
      return;
    }

    api.updateMyLocation(checkpoint.nodeId, checkpoint.qrValue).catch(() => {});
    broadcastCheckpoint(checkpoint.nodeId);

    if (validation.stage === 'transition-origin') {
      const from = routeResult.path[activeStepIndex];
      const to = routeResult.path[activeStepIndex + 1];
      setConfirmedTransition({ originNodeId: from.nodeId, destinationNodeId: to.nodeId });
      showToast(`Staircase confirmed on Floor ${from.floor}. Continue to Floor ${to.floor} and scan the matching landing QR.`, 'success');
      return;
    }

    // The current floor changes only after the matching destination landing QR.
    setConfirmedTransition(null);
    setStartNodeId(checkpoint.nodeId);
    setCurrentFloor(validation.floor);
    setActiveStepIndex(0);
    if (destinationNodeId && checkpoint.nodeId !== destinationNodeId) {
      await computeRoute(checkpoint.nodeId, destinationNodeId, accessibleOnly, nodes);
    } else if (checkpoint.nodeId === destinationNodeId) {
      fallbackTo2DMap('You have reached your destination.', 'success');
    }
    showToast(`Position confirmed: ${checkpoint.name} · Floor ${validation.floor}`, 'success');
  }, [pendingCheckpoint, routeResult, activeStepIndex, currentFloor, confirmedTransition, setStartNodeId, setCurrentFloor, setActiveStepIndex, broadcastCheckpoint, destinationNodeId, computeRoute, accessibleOnly, nodes, showToast, fallbackTo2DMap]);

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

    // Plan frame: +x = right, +y = up on the drawing. Follow the traced walking
    // line of the active edge (it bends at doors) and fall back to node-to-node.
    const dx = (nextNode?.coordinates?.x ?? 0) - (currNode?.coordinates?.x ?? 0);
    const dy = (nextNode?.coordinates?.y ?? 0) - (currNode?.coordinates?.y ?? 0);

    // Bearing clockwise from plan-up [0, 360)
    const targetBearing = getRouteSegmentBearing(routeResult, idx, 0) ?? (
      Math.hypot(dx, dy) > 0.001
        ? ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
        : 0);

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

  // Estimate walking progress from motion peaks. This is a short-range estimate only;
  // QR checkpoints remain the authoritative indoor position and floor confirmation.
  useEffect(() => {
    if (sessionState !== 'active') return undefined;
    let aboveThreshold = false;
    let lastStepAt = 0;
    const handleMotion = (event) => {
      const acceleration = event.acceleration;
      const withGravity = event.accelerationIncludingGravity;
      const magnitude = acceleration && [acceleration.x, acceleration.y, acceleration.z].every(Number.isFinite)
        ? Math.hypot(acceleration.x, acceleration.y, acceleration.z)
        : withGravity && [withGravity.x, withGravity.y, withGravity.z].every(Number.isFinite)
          ? Math.abs(Math.hypot(withGravity.x, withGravity.y, withGravity.z) - 9.81)
          : 0;
      const peak = magnitude > 1.25;
      const now = Date.now();
      if (peak && !aboveThreshold && now - lastStepAt > 360) {
        lastStepAt = now;
        setMotionAvailable(true);
        const nextWalked = walkedMetersRef.current + 0.7;
        const remaining = Number(navMetrics?.stepDirection?.distance || 0);
        walkedMetersRef.current = nextWalked;
        setWalkedMeters(nextWalked);
        // Never auto-advance a stair/lift transition: confirm the new floor with its QR plaque.
        if (navMetrics && !navMetrics.isFloorChange && remaining > 0 && nextWalked >= remaining * 0.85) {
          setActiveStepIndex((current) => Math.min(current + 1, Math.max(0, (routeResult?.path?.length || 1) - 2)));
          walkedMetersRef.current = 0;
          setWalkedMeters(0);
        }
      }
      aboveThreshold = peak;
    };
    window.addEventListener('devicemotion', handleMotion, true);
    return () => window.removeEventListener('devicemotion', handleMotion, true);
  }, [sessionState, navMetrics, routeResult, setActiveStepIndex]);

  useEffect(() => {
    walkedMetersRef.current = 0;
    setWalkedMeters(0);
  }, [activeStepIndex, routeResult]);

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
      <div id="sicn-ar-qr-reader" className="hidden" aria-hidden="true" />
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
      {confirmedTransition && (
        <div className="absolute top-20 left-4 right-4 z-40 mx-auto max-w-lg rounded-2xl border border-amber-300/40 bg-slate-950/90 px-4 py-3 text-white shadow-xl backdrop-blur">
          <div className="text-xs font-extrabold text-amber-300">STAIRCASE OR LIFT CONFIRMED</div>
          <div className="mt-1 text-sm font-semibold">
            Continue to Floor {routeResult?.path?.find((node) => node.nodeId === confirmedTransition.destinationNodeId)?.floor} and scan the matching landing QR. Your confirmed floor remains unchanged until then.
          </div>
        </div>
      )}

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

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-left space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">Secure connection (HTTPS)</span>
                <strong className={secureContextAvailable ? 'text-emerald-300' : 'text-amber-300'}>{secureContextAvailable ? 'Available' : 'Required'}</strong>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">Browser camera API</span>
                <strong className={cameraApiAvailable ? 'text-emerald-300' : 'text-rose-300'}>{cameraApiAvailable ? 'Available' : 'Unavailable'}</strong>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">Compass / orientation API</span>
                <strong className={orientationApiAvailable ? 'text-emerald-300' : 'text-amber-300'}>{orientationApiAvailable ? 'May be available' : 'Not detected'}</strong>
              </div>
              {(!secureContextAvailable || !cameraApiAvailable || !orientationApiAvailable) && (
                <p className="pt-1 text-[10px] leading-relaxed text-amber-200">
                  {(!secureContextAvailable || !cameraApiAvailable)
                    ? 'Open this app over HTTPS and allow camera access. Without a compass, the app will still show route-step guidance.'
                    : 'This device may not expose compass sensors. Camera guidance can still run without the 3D compass arrow.'}
                </p>
              )}
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

            <p className="text-[11px] text-slate-300 leading-relaxed">
              {!secureContextAvailable
                ? 'You opened SICN over local-network HTTP. iPhone Safari blocks camera and motion sensors on this address. Open the HTTPS tunnel URL from the same computer instead.'
                : 'If you previously denied access, open Safari Website Settings for this site and set Camera and Motion & Orientation to Allow. Then retry without leaving the route.'}
            </p>

            <div className="space-y-2">
              <button
                type="button"
                disabled={!secureContextAvailable || !cameraApiAvailable}
                onClick={() => {
                  cleanupMediaAndSensors();
                  setCameraReady(false);
                  setUserHeading(null);
                  setOrientationAvailable(false);
                  setMotionAvailable(false);
                  setErrorMessage('');
                  setSessionState('prompt');
                }}
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-extrabold py-3 px-4 rounded-2xl shadow transition"
              >
                <Play size={14} fill="currentColor" />
                <span>Retry AR Permissions</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  cleanupMediaAndSensors();
                  fallbackTo2DMap();
                }}
                className="w-full inline-flex items-center justify-center gap-2 bg-white text-slate-900 hover:bg-slate-100 text-xs font-extrabold py-3 px-4 rounded-2xl shadow transition"
              >
                <MapIcon size={15} />
                <span>Return to 2D Map</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* QR checkpoint confirmation: camera scanning is automatic during the AR session. */}
      {sessionState === 'active' && pendingCheckpoint && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-300/30 bg-slate-900 p-5 text-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300"><CheckCircle2 size={23} /></div>
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">QR checkpoint detected</div>
                <h3 className="text-base font-extrabold">Confirm your location</h3>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-sm font-bold">{pendingCheckpoint.name}</div>
              <div className="mt-1 text-xs text-slate-300">Floor {pendingCheckpoint.floor} · {pendingCheckpoint.type || 'Indoor checkpoint'}</div>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">Are you standing beside this corridor, lift or staircase checkpoint? Confirm to correct your live position and update the route.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPendingCheckpoint(null)} className="rounded-xl bg-white/10 px-3 py-3 text-xs font-bold text-white hover:bg-white/15">Not here</button>
              <button type="button" onClick={confirmCheckpoint} className="rounded-xl bg-emerald-600 px-3 py-3 text-xs font-extrabold text-white hover:bg-emerald-500">Yes, update location</button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE AR SESSION: 3D ARROW SCENE & NAVIGATION HUD       */}
      {/* ======================================================== */}
      {sessionState === 'active' && (
        <>
          {/* Subtle Vignette for HUD Contrast over bright hallways */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-slate-950/65 via-transparent to-slate-950/75" />

          {/* Lightweight camera HUD; avoids A-Frame/WebGL conflicts on iOS Safari. */}
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            {orientationAvailable ? (
              <div className="flex flex-col items-center gap-3">
                <div
                  className="grid place-items-center w-28 h-28 rounded-full border border-white/35 bg-slate-950/25 backdrop-blur-sm shadow-2xl"
                  style={{ transform: `rotate(${navMetrics.relativeAngle}deg)`, transition: 'transform 180ms ease-out' }}
                >
                  <svg viewBox="0 0 100 100" className="w-20 h-20 drop-shadow-xl" aria-label="Navigation direction">
                    <path d="M50 5 L83 83 L50 66 L17 83 Z" fill={navMetrics.arrowColor} stroke="white" strokeWidth="3" strokeLinejoin="round" />
                    <path d="M50 5 L50 66 L17 83 Z" fill="white" fillOpacity=".22" />
                  </svg>
                </div>
                <span className="rounded-full bg-slate-950/75 px-3 py-1.5 text-[11px] font-bold text-white">Follow the arrow</span>
              </div>
            ) : null}
          </div>

          {/* Initializing Compass Sensor Calibration Indicator */}
          {(!orientationAvailable || !qrDetectionAvailable) && (
            <div className="absolute top-28 inset-x-4 z-20 flex justify-center pointer-events-none">
              <div className="max-w-md bg-slate-950/80 backdrop-blur-md text-white px-4 py-3 rounded-2xl border border-amber-300/30 shadow-xl text-center">
                <div className="text-xs font-bold text-amber-200">Camera guidance mode</div>
                <p className="text-[10px] text-slate-300 mt-1">QR auto-detection: {qrDetectionAvailable ? 'Active' : 'Use Scan QR below'} · Motion: {motionAvailable ? 'Active' : 'Unavailable'}</p>
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
                      {Math.max(0, navMetrics.stepDirection.distance - walkedMeters).toFixed(0)}m
                    </div>
                    <div className="text-[10px] text-slate-300 font-medium">{motionAvailable ? 'estimated left' : 'ahead'}</div>
                  </div>
                )}
              </div>

              {/* Stepper Controls to advance along A* path nodes */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
                <button
                  onClick={() => handleStepChange(navMetrics.idx - 1)}
                  disabled={navMetrics.idx === 0}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-35 text-xs font-bold transition"
                >
                  <ChevronLeft size={15} />
                  <span>Prev</span>
                </button>

                <span className="text-[11px] text-slate-400 truncate min-w-0 flex-1">
                  From: <strong className="text-slate-200">{navMetrics.currNode?.name}</strong>
                </span>
                <button type="button" onClick={() => { cleanupMediaAndSensors(); fallbackTo2DMap(); navigate('/scan'); }} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold">
                  <Camera size={14} /> Scan QR
                </button>

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
