import { useCallback, useEffect, useRef, useState } from 'react';
import { extractCompassHeading, StepDetector } from '../utils/indoorNavigation';

function getAccelerationMagnitude(event) {
  const acceleration = event.acceleration;
  if (acceleration && [acceleration.x, acceleration.y, acceleration.z].every(Number.isFinite)) {
    return Math.hypot(acceleration.x, acceleration.y, acceleration.z);
  }
  const gravity = event.accelerationIncludingGravity;
  if (gravity && [gravity.x, gravity.y, gravity.z].every(Number.isFinite)) {
    return Math.abs(Math.hypot(gravity.x, gravity.y, gravity.z) - 9.81);
  }
  return 0;
}

/**
 * Phone-only compass and step sensor access. Permission prompts are requested
 * only when startSensors is called directly from a user click/tap.
 */
export default function usePhoneSensors(onStep) {
  const [heading, setHeading] = useState(null);
  const [stepCount, setStepCount] = useState(0);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const cleanupRef = useRef(null);
  const onStepRef = useRef(onStep);

  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);
  const stepDetectorRef = useRef(new StepDetector());
  const headingRef = useRef(null);

  const stopSensors = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setStatus('idle');
    setHeading(null);
    headingRef.current = null;
    stepDetectorRef.current.reset();
  }, []);

  const startSensors = useCallback(async () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setError('');
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setStatus('unsupported');
      setError('This browser does not expose a compass sensor. QR checkpoints remain available.');
      return false;
    }

    // Invoke both iOS permission methods synchronously in the user gesture.
    const permissionRequests = [];
    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      permissionRequests.push(window.DeviceOrientationEvent.requestPermission().catch(() => 'denied'));
    } else {
      permissionRequests.push(Promise.resolve('granted'));
    }
    if ('DeviceMotionEvent' in window && typeof window.DeviceMotionEvent.requestPermission === 'function') {
      permissionRequests.push(window.DeviceMotionEvent.requestPermission().catch(() => 'denied'));
    } else {
      permissionRequests.push(Promise.resolve('granted'));
    }

    setStatus('requesting');
    const [orientationPermission, motionPermission] = await Promise.all(permissionRequests);
    if (orientationPermission !== 'granted') {
      setStatus('denied');
      setError('Compass permission was not granted. Enable Motion & Orientation access in browser settings.');
      return false;
    }

    const handleOrientation = (event) => {
      const screenAngle = window.screen?.orientation?.angle || window.orientation || 0;
      const nextHeading = extractCompassHeading(event, screenAngle);
      if (nextHeading !== null) {
        const previous = headingRef.current;
        // Circular low-pass filter avoids the 359° -> 0° jump.
        const smoothed = previous === null
          ? nextHeading
          : (previous + ((((nextHeading - previous + 540) % 360) - 180) * 0.22) + 360) % 360;
        headingRef.current = smoothed;
        setHeading(smoothed);
      }
    };

    const handleMotion = (event) => {
      if (motionPermission !== 'granted') return;
      if (stepDetectorRef.current.push(getAccelerationMagnitude(event), event.timeStamp || Date.now())) {
        setStepCount((count) => count + 1);
        // The step handler needs the heading at the moment of the step.
        onStepRef.current?.({ heading: headingRef.current });
      }
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('devicemotion', handleMotion, true);
    cleanupRef.current = () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
      window.removeEventListener('devicemotion', handleMotion, true);
    };
    setStatus(motionPermission === 'granted' ? 'active' : 'compass-only');
    if (motionPermission !== 'granted') {
      setError('Compass is active, but motion permission is unavailable. Walking progress will remain manual.');
    }
    return true;
  }, []);

  useEffect(() => () => {
    cleanupRef.current?.();
  }, []);

  return { heading, stepCount, status, error, startSensors, stopSensors };
}
