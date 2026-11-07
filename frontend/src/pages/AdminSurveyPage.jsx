import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, CircleStop, MapPin, MicOff, Radio, Save, Upload, Video } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';

const FLOOR_OPTIONS = Array.from({ length: 8 }, (_, floor) => ({ value: floor, label: floor === 0 ? 'Ground Floor' : `${floor}${floor === 1 ? 'st' : floor === 2 ? 'nd' : floor === 3 ? 'rd' : 'th'} Floor` }));

export default function AdminSurveyPage() {
  const { canEditMap, loading } = useAuth();
  const { nodes } = useNavigation();
  const previewRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const headingRef = useRef(null);
  const traceRef = useRef([]);
  const lastTraceAtRef = useRef(0);
  const stepsRef = useRef(0);
  const lastStepAtRef = useRef(0);
  const checkpointsRef = useRef([]);
  const draftIdRef = useRef('');
  const [title, setTitle] = useState('Main Entrance Campus Walkthrough');
  const [description, setDescription] = useState('');
  const [floor, setFloor] = useState(0);
  const [startNodeId, setStartNodeId] = useState('GF-MAIN-ENTRANCE');
  const [endNodeId, setEndNodeId] = useState('');
  const [checkpointName, setCheckpointName] = useState('');
  const [checkpointNodeId, setCheckpointNodeId] = useState('');
  const [checkpoints, setCheckpoints] = useState([]);
  const [includeGps, setIncludeGps] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [draftId, setDraftId] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedSize, setSavedSize] = useState(0);
  const [lastBlob, setLastBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (previewRef.current && streamRef.current) previewRef.current.srcObject = streamRef.current;
  }, [recording]);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => {
      const duration = Date.now() - startedAtRef.current;
      setElapsed(duration);
      if (duration >= 4 * 60 * 1000 && recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
        setNotice('Four-minute segment limit reached. Save this segment, then start another one if needed.');
      }
      if (duration - lastTraceAtRef.current >= 5000) {
        lastTraceAtRef.current = duration;
        const sample = {
          elapsedMs: duration,
          heading: headingRef.current,
          latitude: null,
          longitude: null,
          floor,
          steps: stepsRef.current,
        };
        if (includeGps && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              traceRef.current.push({ ...sample, latitude: position.coords.latitude, longitude: position.coords.longitude });
            },
            () => traceRef.current.push(sample),
            { enableHighAccuracy: false, maximumAge: 15000, timeout: 4000 }
          );
        } else {
          traceRef.current.push(sample);
        }
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording, floor, includeGps]);

  useEffect(() => {
    const onOrientation = (event) => {
      const value = Number.isFinite(event.webkitCompassHeading)
        ? event.webkitCompassHeading
        : Number.isFinite(event.alpha) ? (360 - event.alpha + 360) % 360 : null;
      if (value !== null) headingRef.current = Math.round(value * 10) / 10;
    };
    window.addEventListener('deviceorientation', onOrientation, true);
    return () => window.removeEventListener('deviceorientation', onOrientation, true);
  }, []);

  useEffect(() => {
    const onMotion = (event) => {
      const a = event.accelerationIncludingGravity;
      if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)) return;
      const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      const now = Date.now();
      if (Math.abs(magnitude - 9.81) > 1.35 && now - lastStepAtRef.current > 350) {
        stepsRef.current += 1;
        lastStepAtRef.current = now;
      }
    };
    window.addEventListener('devicemotion', onMotion, true);
    return () => window.removeEventListener('devicemotion', onMotion, true);
  }, []);

  useEffect(() => {
    if (!lastBlob) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(lastBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [lastBlob]);

  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const addCheckpoint = useCallback(() => {
    const name = checkpointName.trim();
    if (!name) return;
    const item = {
      name,
      nodeId: checkpointNodeId,
      floor: Number(floor),
      elapsedMs: recording ? Date.now() - startedAtRef.current : 0,
      note: '',
    };
    checkpointsRef.current = [...checkpointsRef.current, item];
    setCheckpoints(checkpointsRef.current);
    setCheckpointName('');
  }, [checkpointName, checkpointNodeId, floor, recording]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
  };

  const startRecording = async () => {
    setError('');
    setNotice('');
    setUploaded(false);
    setPublished(false);
    setSavedSize(0);
    setLastBlob(null);
    chunksRef.current = [];
    traceRef.current = [];
    lastTraceAtRef.current = 0;
    stepsRef.current = 0;
    lastStepAtRef.current = 0;
    const initial = checkpointsRef.current.length
      ? checkpointsRef.current
      : [{ name: 'College Entrance', nodeId: startNodeId, floor: Number(floor), elapsedMs: 0, note: 'Survey start point' }];
    checkpointsRef.current = initial;
    setCheckpoints(initial);

    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('This browser does not support camera video recording. Use an updated Chrome or Safari over HTTPS.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (previewRef.current) previewRef.current.srcObject = stream;

      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission !== 'granted') setNotice('Camera is active. Compass permission was not granted; video recording will still work.');
        } catch {
          setNotice('Camera is active. Compass permission is unavailable; video recording will still work.');
        }
      }
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const permission = await DeviceMotionEvent.requestPermission();
          if (permission !== 'granted') setNotice('Camera is active. Motion permission was not granted; step samples may be unavailable.');
        } catch {
          setNotice('Camera is active. Motion permission is unavailable; step samples may be unavailable.');
        }
      }

      const survey = await api.createCampusSurvey({
        title,
        description,
        startNodeId,
        floors: [Number(floor)],
        checkpoints: initial,
        trace: [],
      });
      draftIdRef.current = survey.id;
      setDraftId(survey.id);

      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => setError('The browser reported a recording error. Stop and retry this segment.');
      recorder.onstop = async () => {
        setBusy(true);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        setLastBlob(blob);
        stopCamera();
        try {
          if (!blob.size) throw new Error('No video data was captured. Please record again.');
          const durationMs = Date.now() - startedAtRef.current;
          await api.uploadCampusSurveyVideo(draftIdRef.current, blob);
          await api.updateCampusSurvey(draftIdRef.current, {
            title,
            description,
            startNodeId,
            endNodeId,
            floors: [...new Set([...checkpointsRef.current.map((item) => Number(item.floor)), Number(floor)])],
            checkpoints: checkpointsRef.current,
            trace: traceRef.current.slice(0, 2000),
            durationMs,
          });
          setSavedSize(blob.size);
          setUploaded(true);
          setNotice('Video and walkthrough timeline are saved to the SICN server. Review and publish when ready.');
        } catch (uploadError) {
          setError(uploadError.message || 'Could not save the recording. Keep this page open and retry the upload.');
        } finally {
          setBusy(false);
          setRecording(false);
        }
      };
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      recorder.start(1000);
    } catch (startError) {
      stopCamera();
      setError(startError.message || 'Could not start campus recording.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const retryUpload = async () => {
    if (!lastBlob || !draftId) return;
    setBusy(true);
    setError('');
    try {
      await api.uploadCampusSurveyVideo(draftId, lastBlob);
      await api.updateCampusSurvey(draftId, {
        title, description, startNodeId, endNodeId,
        floors: [...new Set([...checkpointsRef.current.map((item) => Number(item.floor)), Number(floor)])],
        checkpoints: checkpointsRef.current,
        trace: traceRef.current.slice(0, 2000),
        durationMs: elapsed,
      });
      setUploaded(true);
      setSavedSize(lastBlob.size);
      setNotice('Recording uploaded successfully.');
    } catch (uploadError) {
      setError(uploadError.message || 'Retry failed.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!draftId || !uploaded) return;
    setBusy(true);
    setError('');
    try {
      await api.publishCampusSurvey(draftId);
      setPublished(true);
      setNotice('Published. Users can now view this walkthrough in SICN.');
    } catch (publishError) {
      setError(publishError.message || 'Could not publish walkthrough.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="min-h-dvh grid place-items-center text-sm text-slate-500">Checking administrator access…</div>;
  if (!canEditMap) return <Navigate to="/" replace />;

  const formatTime = (ms) => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`;

  return (
    <main className="min-h-dvh bg-slate-50 px-4 pb-10 pt-5 sm:px-6 md:pl-72">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft size={16}/> Back to campus map</Link>
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"><Radio size={14}/> ADMIN CAMPUS SURVEY</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Record a campus walkthrough</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">Walk from the entrance through the campus. SICN records the camera video and a timestamped compass/floor/checkpoint timeline. Review it before publishing it to users.</p>
        </header>

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-bold text-slate-600 sm:col-span-2">Walkthrough title
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} disabled={recording || busy} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-900"/>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600 sm:col-span-2">Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={recording || busy} rows={2} maxLength={1000} placeholder="Example: Main entrance to the CSE department and first-floor labs" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-900"/>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600">Current floor
            <select value={floor} onChange={(e) => setFloor(Number(e.target.value))} disabled={busy} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
              {FLOOR_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600">Start checkpoint
            <select value={startNodeId} onChange={(e) => setStartNodeId(e.target.value)} disabled={recording || busy} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
              <option value="">Choose entrance / start node</option>
              {nodes.filter((node) => Number(node.floor) === Number(floor)).map((node) => <option key={node.nodeId} value={node.nodeId}>{node.name} · {node.nodeId}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600">Destination checkpoint (optional)
            <select value={endNodeId} onChange={(e) => setEndNodeId(e.target.value)} disabled={recording || busy} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm sm:col-span-2">
              <option value="">Select after route survey</option>
              {nodes.map((node) => <option key={node.nodeId} value={node.nodeId}>{node.name} · Floor {node.floor}</option>)}
            </select>
          </label>
          <label className="flex items-start gap-2 text-xs font-medium leading-5 text-slate-600 sm:col-span-2">
            <input type="checkbox" checked={includeGps} onChange={(e) => setIncludeGps(e.target.checked)} disabled={recording || busy} className="mt-0.5"/>
            Include optional coarse GPS samples (may be inaccurate indoors). No GPS is collected unless enabled.
          </label>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-xl">
          <div className="relative aspect-video bg-slate-900">
            <video ref={previewRef} autoPlay muted playsInline className="h-full w-full object-cover"/>
            {!recording && <div className="absolute inset-0 grid place-items-center text-center text-white"><div className="space-y-2"><Camera size={38} className="mx-auto text-slate-400"/><div className="text-sm font-bold">Rear camera preview</div><div className="text-xs text-slate-400">Camera starts only after you press Start Recording</div></div></div>}
            {recording && <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 text-xs font-extrabold text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-white"/> REC {formatTime(elapsed)}</div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-white">
            <div><div className="text-sm font-bold">{recording ? 'Recording this campus segment' : busy ? 'Saving recording to SICN…' : uploaded ? 'Recording saved' : 'Ready to record'}</div><div className="mt-1 text-xs text-slate-400">Maximum 4 minutes per segment · WebM/MP4 · 250 MB server limit</div></div>
            {!recording ? <button type="button" onClick={startRecording} disabled={busy || !title.trim() || !startNodeId} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-sm font-extrabold text-white hover:bg-blue-400 disabled:opacity-50"><Video size={17}/> Start Recording</button> : <button type="button" onClick={stopRecording} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-red-500"><CircleStop size={17}/> Stop & Save</button>}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900">Place markers along the route</h2><p className="mt-1 text-xs text-slate-500">Stop at each classroom, office, lab, lift or staircase and add a marker.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{checkpoints.length} checkpoints</span></div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <input value={checkpointName} onChange={(e) => setCheckpointName(e.target.value)} disabled={busy} placeholder="e.g. Main reception, CSE lab, Library" className="min-w-0 rounded-xl border border-slate-200 px-3 py-3 text-sm"/>
              <select value={checkpointNodeId} onChange={(e) => setCheckpointNodeId(e.target.value)} disabled={busy} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                <option value="">Link to map node (optional)</option>
                {nodes.filter((node) => Number(node.floor) === Number(floor)).map((node) => <option key={node.nodeId} value={node.nodeId}>{node.name}</option>)}
              </select>
            </div>
            <button type="button" onClick={addCheckpoint} disabled={!checkpointName.trim() || busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 disabled:opacity-50"><MapPin size={16}/> Add checkpoint</button>
          </div>
          <ol className="mt-4 space-y-2">
            {checkpoints.map((item, index) => <li key={index} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><div className="flex min-w-0 items-center gap-2"><MapPin size={15} className="shrink-0 text-blue-600"/><span className="truncate text-sm font-semibold text-slate-800">{item.name}</span></div><span className="shrink-0 text-xs text-slate-500">Floor {item.floor} · {formatTime(item.elapsedMs)}</span></li>)}
          </ol>
        </section>

        {(error || notice) && <div role="status" className={`rounded-2xl border px-4 py-3 text-sm font-medium ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</div>}

        {previewUrl && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-sm"><div className="mb-2 text-sm font-bold text-slate-800">Review saved segment</div><video controls playsInline src={previewUrl} className="aspect-video w-full rounded-2xl bg-slate-950"/></section>}

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><div className="text-sm font-extrabold text-slate-900">Review & publish</div><div className="mt-1 text-xs text-slate-500">{draftId ? `Draft ${draftId.slice(-8)} · ${savedSize ? (savedSize / 1024 / 1024).toFixed(1) + ' MB saved' : 'Not uploaded'}` : 'Record and save a video before publishing.'}</div></div>
          <div className="flex flex-wrap gap-2">
            {lastBlob && !uploaded && <button type="button" onClick={retryUpload} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50"><Upload size={15}/> Retry upload</button>}
            <button type="button" onClick={publish} disabled={!uploaded || published || busy || checkpoints.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-40">{published ? <CheckCircle2 size={15}/> : <Save size={15}/>} {published ? 'Published' : 'Publish for users'}</button>
          </div>
        </section>
        <p className="text-xs leading-5 text-slate-500"><MicOff size={13} className="mr-1 inline"/> Audio is not recorded. Get appropriate permission before filming people or private areas. The video is private to administrators until you publish it. Compass/GPS samples are guidance metadata, not surveyed indoor coordinates; floor changes and exact route geometry still need checkpoint/map verification.</p>
      </div>
    </main>
  );
}
