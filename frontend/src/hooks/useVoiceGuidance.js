import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WRONG_WAY_PHRASE,
  getApproachPhrase,
  getArrivalPhrase,
  getFloorArrivalPhrase,
  getRouteIntroPhrase,
  getSegmentPhrase,
} from '../utils/voiceGuidance';

const STORAGE_KEY = 'sicn_voice_guidance';
const APPROACH_METRES = 5;

const speechSupported = () => typeof window !== 'undefined'
  && 'speechSynthesis' in window
  && typeof window.SpeechSynthesisUtterance === 'function';

/** Prefer an Indian English voice, then any English voice. */
function pickVoice() {
  const voices = window.speechSynthesis.getVoices() || [];
  return voices.find((voice) => /^en[-_]IN/i.test(voice.lang))
    || voices.find((voice) => /^en[-_]GB/i.test(voice.lang))
    || voices.find((voice) => /^en/i.test(voice.lang))
    || null;
}

/**
 * Spoken turn-by-turn guidance with the browser's speech synthesis (no server).
 * Speaks the route summary when a route starts, each segment as it begins,
 * a heads-up a few metres before a turn, a wrong-way warning, and arrival.
 */
export default function useVoiceGuidance({
  routeResult,
  activeStepIndex,
  remainingMeters,
  nextTurn,
  stepDirection,
  isRouteComplete,
  isVerticalTransition,
}) {
  const supported = speechSupported();
  const [enabled, setEnabledState] = useState(() => {
    if (!supported) return false;
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  });

  const setEnabled = useCallback((value) => {
    setEnabledState((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
      if (!next && speechSupported()) window.speechSynthesis.cancel();
      return next;
    });
  }, []);

  const speak = useCallback((text, { interrupt = true } = {}) => {
    if (!enabled || !supported || !text) return;
    const synth = window.speechSynthesis;
    if (interrupt) synth.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'en-IN';
    utterance.rate = 1;
    synth.speak(utterance);
  }, [enabled, supported]);

  // Voices load asynchronously in Chrome; touching the list starts that.
  useEffect(() => {
    if (supported) window.speechSynthesis.getVoices();
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  // Route started or replaced.
  const spokenRouteRef = useRef(null);
  const spokenSegmentRef = useRef(null);
  const approachRef = useRef(null);
  useEffect(() => {
    if (!routeResult) {
      spokenRouteRef.current = null;
      spokenSegmentRef.current = null;
      return;
    }
    if (spokenRouteRef.current === routeResult) return;
    const previous = spokenRouteRef.current;
    spokenRouteRef.current = routeResult;
    spokenSegmentRef.current = `${activeStepIndex}`;
    approachRef.current = null;
    const sameDestination = previous?.path?.length
      && previous.path[previous.path.length - 1]?.nodeId === routeResult.path?.[routeResult.path.length - 1]?.nodeId;
    // A re-route to the same place (e.g. after a landing QR) skips the summary;
    // if it starts on another floor, say which floor the user is now on.
    const startFloor = routeResult.path?.[0]?.floor;
    const intro = !sameDestination
      ? getRouteIntroPhrase(routeResult)
      : previous.path?.[0]?.floor !== startFloor ? getFloorArrivalPhrase(startFloor) : '';
    speak([intro, getSegmentPhrase(routeResult, activeStepIndex)].filter(Boolean).join(' '));
  }, [routeResult, activeStepIndex, speak]);

  // Next segment begins.
  useEffect(() => {
    if (!routeResult || spokenRouteRef.current !== routeResult || isRouteComplete) return;
    const key = `${activeStepIndex}`;
    if (spokenSegmentRef.current === key) return;
    spokenSegmentRef.current = key;
    approachRef.current = null;
    speak(getSegmentPhrase(routeResult, activeStepIndex));
  }, [routeResult, activeStepIndex, isRouteComplete, speak]);

  // Heads-up shortly before a turn.
  useEffect(() => {
    if (!routeResult || isRouteComplete || isVerticalTransition || !Number.isFinite(remainingMeters)) return;
    if (remainingMeters > APPROACH_METRES) return;
    const key = `${activeStepIndex}`;
    if (approachRef.current === key) return;
    const phrase = getApproachPhrase(nextTurn, remainingMeters);
    if (!phrase) return;
    approachRef.current = key;
    speak(phrase, { interrupt: false });
  }, [routeResult, activeStepIndex, remainingMeters, nextTurn, isRouteComplete, isVerticalTransition, speak]);

  // Wrong way, at most every 10 seconds.
  const lastWarningRef = useRef(0);
  useEffect(() => {
    if (stepDirection !== 'backward' || !routeResult) return;
    const now = Date.now();
    if (now - lastWarningRef.current < 10000) return;
    lastWarningRef.current = now;
    speak(WRONG_WAY_PHRASE);
  }, [stepDirection, routeResult, speak]);

  // Arrival.
  const arrivedRef = useRef(null);
  useEffect(() => {
    if (!isRouteComplete || !routeResult || arrivedRef.current === routeResult) return;
    arrivedRef.current = routeResult;
    speak(getArrivalPhrase(routeResult));
  }, [isRouteComplete, routeResult, speak]);

  return { supported, enabled, setEnabled, speak };
}
