import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ExternalLink, Crosshair, Save, Trash2, AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { api } from '../services/api';
import { FLOOR_PLANS } from '../config/floorPlans';
import { solveAffineCalibration, transformMapToPlan } from '../utils/indoorNavigation';
import { findPdfNodeAnchors } from '../utils/pdfNodeAnchors';

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

export default function FloorPlanCalibrationViewer({
  floor,
  nodes = [],
  routeResult = null,
  userPosition = null,
  adminEnabled = false,
  onClose,
}) {
  const plan = FLOOR_PLANS[floor];
  const canvasRef = useRef(null);
  const pageContainerRef = useRef(null);
  const pdfRef = useRef(null);
  const [pdfState, setPdfState] = useState('loading');
  const [pdfError, setPdfError] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageMetrics, setPageMetrics] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [controlPoints, setControlPoints] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [verificationNote, setVerificationNote] = useState('');
  const [error, setError] = useState('');
  const [detectedAnchors, setDetectedAnchors] = useState([]);
  const [surveyMode, setSurveyMode] = useState(false);
  const [surveyFeatureType, setSurveyFeatureType] = useState('corridor_centerline');
  const [surveyLabel, setSurveyLabel] = useState('');
  const [surveyPoints, setSurveyPoints] = useState([]);
  const [surveyFeatures, setSurveyFeatures] = useState([]);
  const [metricCalibrationMode, setMetricCalibrationMode] = useState(false);
  const [metricCalibration, setMetricCalibration] = useState(null);
  const [scalePoints, setScalePoints] = useState([]);
  const [knownDistanceMeters, setKnownDistanceMeters] = useState('');
  const [scaleReference, setScaleReference] = useState('');
  const [selectedRouteFeatureId, setSelectedRouteFeatureId] = useState('');
  const [routeFromNodeId, setRouteFromNodeId] = useState('');
  const [routeToNodeId, setRouteToNodeId] = useState('');

  const floorNodes = useMemo(
    () => nodes.filter((node) => Number(node.floor) === Number(floor)),
    [nodes, floor]
  );
  const routeSegments = useMemo(() => {
    if (!routeResult?.path?.length) return [];
    const segments = [];
    let active = [];
    routeResult.path.forEach((node) => {
      if (Number(node.floor) !== Number(floor)) {
        if (active.length > 1) segments.push(active);
        active = [];
        return;
      }
      active.push(node);
    });
    if (active.length > 1) segments.push(active);
    return segments;
  }, [routeResult, floor]);

  useEffect(() => {
    let active = true;
    api.getFloorCalibrations()
      .then((items) => {
        if (!active) return;
        const found = items.find((item) => Number(item.floor) === Number(floor)) || null;
        setCalibration(found);
        if (found) {
          setPageNumber(Number(found.pageNumber) || 1);
          setControlPoints(found.controlPoints || []);
        } else {
          setControlPoints([]);
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load saved floor registration.');
      });
    return () => { active = false; };
  }, [floor]);

  useEffect(() => {
    setSurveyMode(false);
    setSurveyPoints([]);
    setMetricCalibrationMode(false);
    setScalePoints([]);
  }, [floor, pageNumber]);

  useEffect(() => {
    let active = true;
    api.getFloorGeometryFeatures({ floor, pageNumber, sourcePdf: plan?.sourceName || '' })
      .then((items) => { if (active) setSurveyFeatures(items); })
      .catch((err) => { if (active) setError(err.message || 'Unable to load survey traces.'); });
    return () => { active = false; };
  }, [floor, pageNumber, plan?.sourceName]);

  useEffect(() => {
    let active = true;
    setMetricCalibration(null);
    api.getMetricFloorCalibration({ floor, pageNumber, sourcePdf: plan?.sourceName || '' })
      .then((item) => { if (active) setMetricCalibration(item); })
      .catch((err) => { if (active) setError(err.message || 'Unable to load metric scale.'); });
    return () => { active = false; };
  }, [floor, pageNumber, plan?.sourceName]);

  useEffect(() => {
    let cancelled = false;
    async function renderPdf() {
      if (!plan || !canvasRef.current || !pageContainerRef.current) return;
      setPdfState('loading');
      setPdfError('');
      try {
        const pdfjs = await import(/* @vite-ignore */ PDFJS_URL);
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        if (!pdfRef.current || pdfRef.current.url !== plan.url) {
          const document = await pdfjs.getDocument({ url: plan.url }).promise;
          pdfRef.current = { url: plan.url, document };
          setPageCount(document.numPages);
        }
        const document = pdfRef.current.document;
        const safePage = Math.max(1, Math.min(pageNumber, document.numPages));
        if (safePage !== pageNumber) setPageNumber(safePage);
        const page = await document.getPage(safePage);
        const baseViewport = page.getViewport({ scale: 1 });
        if (adminEnabled) {
          try {
            const textContent = await page.getTextContent();
            if (!cancelled) setDetectedAnchors(findPdfNodeAnchors(textContent.items, baseViewport, floorNodes));
          } catch {
            if (!cancelled) setDetectedAnchors([]);
          }
        } else {
          setDetectedAnchors([]);
        }
        const availableWidth = Math.max(320, pageContainerRef.current.clientWidth - 24);
        const scale = Math.min(2.2, availableWidth / baseViewport.width);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        await page.render({
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
        }).promise;
        if (cancelled) return;
        setPageMetrics({
          width: viewport.width,
          height: viewport.height,
          pageWidth: baseViewport.width,
          pageHeight: baseViewport.height,
        });
        setPageCount(document.numPages);
        setPdfState('ready');
      } catch (err) {
        if (!cancelled) {
          setPdfError(err?.message || 'The PDF renderer could not load this drawing.');
          setPdfState('error');
        }
      }
    }
    renderPdf();
    return () => { cancelled = true; };
  }, [plan?.url, pageNumber, floorNodes, adminEnabled]);

  useEffect(() => {
    if (calibration &&
        Number(calibration.pageNumber) === Number(pageNumber) &&
        calibration.sourcePdf === plan?.sourceName) {
      setControlPoints(calibration.controlPoints || []);
    } else {
      setControlPoints([]);
    }
  }, [calibration, pageNumber, plan?.sourceName]);

  const transform = useMemo(() => {
    const savedMatchesPage = calibration &&
      Number(calibration.pageNumber) === Number(pageNumber) &&
      calibration.sourcePdf === plan?.sourceName;
    if (savedMatchesPage && calibration?.transform?.xCoefficients && calibration?.transform?.yCoefficients) {
      return calibration.transform;
    }
    if (controlPoints.length >= 3) {
      try { return solveAffineCalibration(controlPoints); } catch { return null; }
    }
    return null;
  }, [calibration, controlPoints, pageNumber, plan?.sourceName]);

  const toViewport = (node) => {
    if (!transform || !pageMetrics) return null;
    const normalized = transformMapToPlan(node.coordinates, transform);
    return normalized ? { x: normalized.x * pageMetrics.width, y: normalized.y * pageMetrics.height } : null;
  };

  const addControlPoint = (event) => {
    if (!adminEnabled || pdfState !== 'ready' || !pageMetrics) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pdfX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const pdfY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    if (surveyMode) {
      setSurveyPoints((previous) => [...previous, { x: pdfX, y: pdfY }]);
      setMessage(`Added survey point ${surveyPoints.length + 1}. Continue tracing the selected feature.`);
      setError('');
      return;
    }
    if (metricCalibrationMode) {
      setScalePoints((previous) => previous.length >= 2 ? [{ x: pdfX, y: pdfY }] : [...previous, { x: pdfX, y: pdfY }]);
      setMessage('Metric calibration point added. Select the second endpoint of the same known plan dimension.');
      setError('');
      return;
    }
    if (!selectedNodeId) return;
    const node = floorNodes.find((item) => item.nodeId === selectedNodeId);
    if (!node) return;
    setControlPoints((previous) => [
      ...previous.filter((point) => point.nodeId !== node.nodeId),
      {
        nodeId: node.nodeId,
        mapX: Number(node.coordinates.x),
        mapY: Number(node.coordinates.y),
        pdfX,
        pdfY,
      },
    ]);
    setMessage(`Added control point for ${node.name}. Choose another well-separated node.`);
    setError('');
  };

  const handleSaveSurveyFeature = async () => {
    const minimum = surveyFeatureType === 'room_label_anchor' ? 1 : surveyFeatureType === 'room_footprint' ? 3 : 2;
    if (surveyPoints.length < minimum || !plan) {
      setError(`Add at least ${minimum} points for this feature.`);
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const feature = await api.createFloorGeometryFeature({ floor: Number(floor), sourcePdf: plan.sourceName, pageNumber, featureType: surveyFeatureType, label: surveyLabel.trim(), coordinateSystem: 'pdf_normalized', points: surveyPoints, notes: 'Admin-traced PDF candidate. Not metric-calibrated or field-verified.' });
      setSurveyFeatures((previous) => [...previous, feature]);
      setSurveyPoints([]); setSurveyLabel('');
      setMessage('Survey candidate saved. It is not yet a measured navigation route.');
    } catch (err) { setError(err.message || 'Unable to save survey candidate.'); }
    finally { setSaving(false); }
  };

  const handleDeleteSurveyFeature = async (id) => {
    if (!window.confirm('Delete this traced survey candidate?')) return;
    try { await api.deleteFloorGeometryFeature(id); setSurveyFeatures((previous) => previous.filter((feature) => feature._id !== id)); }
    catch (err) { setError(err.message || 'Unable to delete survey candidate.'); }
  };

  const handleSaveMetricCalibration = async () => {
    if (scalePoints.length !== 2 || !pageMetrics || !(Number(knownDistanceMeters) > 0) || !scaleReference.trim()) {
      setError('Select two dimension endpoints, enter the known distance in metres and cite the plan dimension.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await api.saveMetricFloorCalibration(floor, {
        sourcePdf: plan.sourceName, pageNumber,
        pageWidth: pageMetrics.pageWidth, pageHeight: pageMetrics.pageHeight,
        calibrationPoints: scalePoints, knownDistanceMeters: Number(knownDistanceMeters), reference: scaleReference.trim(),
      });
      setMetricCalibration(result); setMetricCalibrationMode(false); setScalePoints([]);
      setMessage(`Metric scale saved: ${result.metersPerPdfPoint.toFixed(6)} metres per PDF point. Plan-derived only; site verification pending.`);
    } catch (err) { setError(err.message || 'Unable to save metric scale.'); }
    finally { setSaving(false); }
  };

  const handleCreateRouteEdge = async () => {
    const feature = surveyFeatures.find((item) => item._id === selectedRouteFeatureId);
    const fromNode = floorNodes.find((item) => item.nodeId === routeFromNodeId);
    const toNode = floorNodes.find((item) => item.nodeId === routeToNodeId);
    if (!metricCalibration || !feature || !fromNode || !toNode || fromNode.nodeId === toNode.nodeId) {
      setError('Choose a calibrated plan, a routeable trace and two different endpoint nodes on this floor.');
      return;
    }
    const kind = feature.featureType === 'corridor_centerline' ? 'corridor_centerline' : feature.featureType === 'room_entry_connector' ? 'room_entry_connector' : null;
    if (!kind) { setError('Only corridor centrelines and room-entry connectors can become route edges.'); return; }
    const points = feature.points.map((point) => ({
      x: Number(point.x) * pageMetrics.pageWidth * metricCalibration.metersPerPdfPoint,
      y: Number(point.y) * pageMetrics.pageHeight * metricCalibration.metersPerPdfPoint,
    }));
    let distance = 0;
    for (let index = 1; index < points.length; index += 1) distance += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    if (!(distance > 0)) { setError('The traced route has no measurable length.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      await api.createEdge({
        fromNode: fromNode.nodeId, toNode: toNode.nodeId, distance,
        distanceEvidence: { source: 'architectural_plan', reference: `${plan.sourceName}#page=${pageNumber}; ${metricCalibration.reference}`, notes: 'Distance derived from admin-traced PDF polyline and two-point plan scale calibration; physical field measurement pending.' },
        geometry: { kind, coordinateSystem: 'local_metric_m', coordinateFrameId: `${plan.sourceName}:page-${pageNumber}:floor-${floor}:metric-v1`, floor: Number(floor), sourceRef: `${plan.sourceName}#page=${pageNumber}`, points, verification: { status: 'reviewed', notes: 'Reviewed against the source plan; not field-verified.' } },
        type: 'walking', accessible: fromNode.accessible && toNode.accessible,
        instruction: `Follow ${feature.label || 'the traced corridor'} towards ${toNode.name}`,
        reverseInstruction: `Follow ${feature.label || 'the traced corridor'} towards ${fromNode.name}`,
      });
      setMessage(`Route edge saved: ${distance.toFixed(2)} m from ${fromNode.name} to ${toNode.name}. Physical site verification is still pending.`);
    } catch (err) { setError(err.message || 'Unable to create route edge.'); }
    finally { setSaving(false); }
  };

  const handleUseDetectedAnchors = () => {
    if (detectedAnchors.length < 3) return;
    setControlPoints(detectedAnchors.map(({ nodeId, mapX, mapY, pdfX, pdfY }) => ({ nodeId, mapX, mapY, pdfX, pdfY })));
    setMessage(`Added ${detectedAnchors.length} PDF text-matched control points. Review their positions before saving.`);
    setError('');
  };

  const handleSave = async () => {
    if (!plan || controlPoints.length < 3 || !pageMetrics) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await api.saveFloorCalibration(floor, {
        sourcePdf: plan.sourceName,
        pageNumber,
        pageWidth: pageMetrics.pageWidth,
        pageHeight: pageMetrics.pageHeight,
        controlPoints,
      });
      setCalibration(result);
      setMessage('Plan registered. This registration is not field-verified yet.');
    } catch (err) {
      setError(err.message || 'Unable to save calibration.');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (!calibration || verificationNote.trim().length < 20) {
      setError('Describe the physical walkthrough and measured checks (at least 20 characters).');
      return;
    }
    if (!window.confirm('Confirm that this floor was physically walked and the registered checkpoints/corridors were checked against the plan?')) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.verifyFloorCalibration(floor, verificationNote.trim());
      setCalibration(result);
      setMessage('Physical verification attestation saved.');
    } catch (err) {
      setError(err.message || 'Unable to save field verification.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove the saved registration for this floor?')) return;
    setSaving(true);
    setError('');
    try {
      await api.deleteFloorCalibration(floor);
      setCalibration(null);
      setControlPoints([]);
      setMessage('Floor registration removed.');
    } catch (err) {
      setError(err.message || 'Unable to remove registration.');
    } finally {
      setSaving(false);
    }
  };

  const calibrationError = useMemo(() => {
    if (controlPoints.length < 3) return null;
    try { return solveAffineCalibration(controlPoints); } catch (err) { return { error: err.message }; }
  }, [controlPoints]);

  if (!plan) return null;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-slate-950 text-white">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-extrabold">Calibrated Architectural Floor Plan</div>
          <div className="truncate text-xs text-slate-300">{plan.label} · {plan.sourceName}</div>
          <div className="mt-0.5 text-[10px] text-amber-200">
            {calibration?.fieldVerified ? 'Field verified' : calibration ? 'Registered · field verification pending' : 'Not registered · schematic navigation remains active'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={plan.url} target="_blank" rel="noreferrer" className="rounded-xl border border-white/20 px-3 py-2 text-xs font-bold hover:bg-white/10">
            Open PDF <ExternalLink size={12} className="ml-1 inline" />
          </a>
          <button onClick={onClose} className="rounded-xl bg-white/10 p-2 hover:bg-white/20" aria-label="Close floor plan">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 max-h-[42dvh] shrink-0 overflow-y-auto border-t border-white/10 bg-slate-900 p-4 lg:order-1 lg:max-h-none lg:w-80 lg:border-r lg:border-t-0">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-300">Floor registration</div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Match existing graph nodes to the exact same physical points on this PDF page. Use at least three points spread across the floor, not one straight line.
          </p>

          <label className="mt-4 block text-[11px] font-bold text-slate-300">PDF page</label>
          <select value={pageNumber} onChange={(event) => setPageNumber(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
            {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>Page {index + 1}</option>)}
          </select>

          {adminEnabled && (
            <>
              <label className="mt-4 block text-[11px] font-bold text-slate-300">Select graph node to register</label>
              <select value={selectedNodeId} onChange={(event) => setSelectedNodeId(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white">
                <option value="">Choose a node…</option>
                {floorNodes.map((node) => <option key={node.nodeId} value={node.nodeId}>{node.name} ({node.nodeId})</option>)}
              </select>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-cyan-200">
                <Crosshair size={14} /> Select a node, then click its matching point on the drawing.
              </div>
              <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3">
                <div className="text-[11px] font-bold text-cyan-100">PDF text detection</div>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">
                  Exact room numbers and common stair/lift labels are matched from the selected PDF page. These are suggested anchors, not verified door or QR positions.
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-300">
                  <span>{detectedAnchors.length} matching labels found</span>
                  <button
                    type="button"
                    onClick={handleUseDetectedAnchors}
                    disabled={detectedAnchors.length < 3 || saving}
                    className="rounded-lg bg-cyan-500/15 px-2.5 py-1.5 font-bold text-cyan-100 disabled:opacity-40"
                  >
                    Use detected points
                  </button>
                </div>
              </div>
            </>
          )}

          {adminEnabled && (
            <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3">
              <div className="flex items-center justify-between gap-2"><div className="text-[11px] font-bold text-cyan-100">Metric scale calibration</div><button type="button" onClick={() => { setMetricCalibrationMode((value) => !value); setSurveyMode(false); setSurveyPoints([]); setScalePoints([]); }} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${metricCalibrationMode ? 'bg-cyan-300 text-slate-950' : 'bg-white/10 text-white'}`}>{metricCalibrationMode ? 'Exit scale mode' : metricCalibration ? 'Recalibrate scale' : 'Calibrate scale'}</button></div>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">Click the two ends of one clearly labelled dimension on this exact PDF page. Enter its real-world length in metres (for example, 876 cm = 8.76 m). This calibrates the drawing scale only.</p>
              {metricCalibrationMode && <div className="mt-2 space-y-2">
                <div className="text-[10px] text-cyan-100">{scalePoints.length}/2 dimension endpoints selected</div>
                <input type="number" min="0.01" step="0.01" value={knownDistanceMeters} onChange={(event) => setKnownDistanceMeters(event.target.value)} placeholder="Known distance in metres" className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white" />
                <input value={scaleReference} onChange={(event) => setScaleReference(event.target.value)} maxLength={200} placeholder="Source dimension (e.g. 876 cm label)" className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white" />
                <div className="flex gap-2"><button type="button" onClick={() => setScalePoints((previous) => previous.slice(0, -1))} disabled={!scalePoints.length} className="flex-1 rounded-lg bg-white/10 px-2 py-2 text-[10px] font-bold disabled:opacity-40">Undo endpoint</button><button type="button" onClick={() => setScalePoints([])} disabled={!scalePoints.length} className="flex-1 rounded-lg bg-white/10 px-2 py-2 text-[10px] font-bold disabled:opacity-40">Clear</button></div>
                <button type="button" onClick={handleSaveMetricCalibration} disabled={saving || scalePoints.length !== 2 || !(Number(knownDistanceMeters) > 0) || !scaleReference.trim()} className="w-full rounded-lg bg-cyan-300 px-3 py-2 text-[10px] font-extrabold text-slate-950 disabled:opacity-40">{saving ? 'Saving…' : 'Save metric scale'}</button>
              </div>}
              {metricCalibration && !metricCalibrationMode && <div className="mt-2 text-[10px] leading-4 text-emerald-200">Scale saved · {metricCalibration.metersPerPdfPoint.toFixed(6)} m/PDF point · {metricCalibration.reference}. Plan-derived; physical verification pending.</div>}
            </div>
          )}

          {adminEnabled && (
            <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
              <div className="flex items-center justify-between gap-2"><div className="text-[11px] font-bold text-amber-100">Floor geometry survey</div><button type="button" onClick={() => { setSurveyMode((value) => !value); setSurveyPoints([]); }} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${surveyMode ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-white'}`}>{surveyMode ? 'Exit trace mode' : 'Trace features'}</button></div>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">Trace wall/fence lines, door openings, corridor centrelines, room outlines or room-label anchors on this PDF. Saved traces remain PDF-normalized candidates until metric calibration and review.</p>
              {surveyMode && <div className="mt-2 space-y-2">
                <select value={surveyFeatureType} onChange={(event) => { setSurveyFeatureType(event.target.value); setSurveyPoints([]); }} className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white"><option value="corridor_centerline">Corridor centreline</option><option value="wall_boundary">Wall boundary</option><option value="fence_boundary">Fence boundary</option><option value="door_opening">Door opening</option><option value="room_footprint">Room footprint</option><option value="room_label_anchor">Room label anchor</option><option value="room_entry_connector">Room-entry connector</option></select>
                <input value={surveyLabel} onChange={(event) => setSurveyLabel(event.target.value)} maxLength={100} placeholder="Label (e.g. Corridor A / Room 101)" className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white" />
                <div className="flex items-center justify-between text-[10px] text-amber-100"><span>{surveyPoints.length} points added</span><span>Click the PDF to add points</span></div>
                <div className="flex gap-2"><button type="button" onClick={() => setSurveyPoints((previous) => previous.slice(0, -1))} disabled={!surveyPoints.length} className="flex-1 rounded-lg bg-white/10 px-2 py-2 text-[10px] font-bold disabled:opacity-40">Undo point</button><button type="button" onClick={() => setSurveyPoints([])} disabled={!surveyPoints.length} className="flex-1 rounded-lg bg-white/10 px-2 py-2 text-[10px] font-bold disabled:opacity-40">Clear</button></div>
                <button type="button" onClick={handleSaveSurveyFeature} disabled={saving || surveyPoints.length < (surveyFeatureType === 'room_label_anchor' ? 1 : surveyFeatureType === 'room_footprint' ? 3 : 2)} className="w-full rounded-lg bg-amber-400 px-3 py-2 text-[10px] font-extrabold text-slate-950 disabled:opacity-40">{saving ? 'Saving…' : 'Save survey candidate'}</button>
              </div>}
              {metricCalibration && <div className="mt-3 border-t border-white/10 pt-2 space-y-2">
                <div className="text-[10px] font-bold text-cyan-100">Create route edge from a trace</div>
                <select value={selectedRouteFeatureId} onChange={(event) => setSelectedRouteFeatureId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white"><option value="">Choose corridor / room-entry trace</option>{surveyFeatures.filter((feature) => ['corridor_centerline','room_entry_connector'].includes(feature.featureType)).map((feature) => <option key={feature._id} value={feature._id}>{feature.label || feature.featureType.replaceAll('_',' ')} · {feature.points.length} pts</option>)}</select>
                <select value={routeFromNodeId} onChange={(event) => setRouteFromNodeId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white"><option value="">From node</option>{floorNodes.map((node) => <option key={node.nodeId} value={node.nodeId}>{node.name} ({node.nodeId})</option>)}</select>
                <select value={routeToNodeId} onChange={(event) => setRouteToNodeId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white"><option value="">To node</option>{floorNodes.map((node) => <option key={node.nodeId} value={node.nodeId}>{node.name} ({node.nodeId})</option>)}</select>
                <button type="button" onClick={handleCreateRouteEdge} disabled={saving || !selectedRouteFeatureId || !routeFromNodeId || !routeToNodeId || routeFromNodeId === routeToNodeId} className="w-full rounded-lg bg-cyan-300 px-3 py-2 text-[10px] font-extrabold text-slate-950 disabled:opacity-40">Create plan-derived route edge</button>
                <p className="text-[9px] leading-4 text-amber-200">Creates a reviewed, plan-derived edge only. Verify the distance and walkable path on site before relying on it for navigation.</p>
              </div>}
              <div className="mt-2 border-t border-white/10 pt-2"><div className="text-[10px] font-bold text-slate-300">Saved traces · {surveyFeatures.length}</div><div className="mt-1 max-h-28 space-y-1 overflow-y-auto">
                {surveyFeatures.map((feature) => <div key={feature._id} className="flex items-center justify-between gap-2 text-[10px] text-slate-300"><span className="min-w-0 truncate">{feature.label || feature.featureType.replaceAll('_', ' ')} <span className="text-amber-200">· candidate</span></span><button type="button" onClick={() => handleDeleteSurveyFeature(feature._id)} className="shrink-0 rounded p-1 text-rose-300 hover:bg-white/10" aria-label="Delete survey trace"><Trash2 size={11} /></button></div>)}
                {!surveyFeatures.length && <div className="text-[10px] text-slate-500">No survey traces saved for this floor/page.</div>}
              </div></div>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Control points</span><span>{controlPoints.length}</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {controlPoints.map((point) => (
                <div key={point.nodeId} className="flex items-center justify-between gap-2 text-[10px] text-slate-300">
                  <span className="truncate">{point.nodeId}</span>
                  <button onClick={() => setControlPoints((previous) => previous.filter((item) => item.nodeId !== point.nodeId))} className="rounded p-1 text-rose-300 hover:bg-white/10" aria-label={`Remove ${point.nodeId}`}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {!controlPoints.length && <div className="text-[10px] text-slate-500">No points registered yet.</div>}
            </div>
          </div>

          {calibrationError?.error ? (
            <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-[11px] text-rose-200">{calibrationError.error}</div>
          ) : calibrationError && (
            <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-[11px] text-emerald-200">
              Affine fit ready · RMS error {(calibrationError.rmsError * 100).toFixed(3)}% of page
            </div>
          )}

          {calibration && (
            <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-[11px] leading-5 text-amber-100">
              {calibration.fieldVerified ? (
                <>
                  <CheckCircle2 size={13} className="mr-1 inline text-emerald-300" />
                  Field verification attested on {new Date(calibration.fieldVerifiedAt).toLocaleDateString()}.
                  {calibration.fieldVerificationNote && <div className="mt-1 text-amber-50">{calibration.fieldVerificationNote}</div>}
                </>
              ) : (
                <>
                  <AlertTriangle size={13} className="mr-1 inline" />
                  Registered geometry is not field-verified. Check corridor lengths and QR locations on site before relying on this as a precise map.
                </>
              )}
            </div>
          )}
          {calibration && adminEnabled && !calibration.fieldVerified && (
            <div className="mt-3 space-y-2">
              <label className="block text-[11px] font-bold text-slate-300">On-site verification notes</label>
              <textarea
                value={verificationNote}
                onChange={(event) => setVerificationNote(event.target.value)}
                placeholder="Record the corridors walked, measured distances, QR locations and any corrections…"
                className="min-h-20 w-full rounded-xl border border-white/10 bg-slate-800 p-3 text-xs text-white"
              />
              <button onClick={handleVerify} disabled={saving || verificationNote.trim().length < 20} className="w-full rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-100 disabled:opacity-40">
                Attest physical walkthrough
              </button>
            </div>
          )}

          {message && <div className="mt-3 text-[11px] text-emerald-200">{message}</div>}
          {error && <div className="mt-3 text-[11px] text-rose-200">{error}</div>}

          {adminEnabled && (
            <div className="mt-4 flex gap-2">
              <button onClick={handleSave} disabled={saving || Boolean(calibrationError?.error) || controlPoints.length < 3} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-extrabold disabled:opacity-40">
                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />} Save registration
              </button>
              {calibration && <button onClick={handleRemove} disabled={saving} className="rounded-xl border border-rose-300/30 px-3 text-rose-200" title="Remove saved registration"><Trash2 size={15} /></button>}
            </div>
          )}
          {!adminEnabled && !calibration && <p className="mt-4 text-[11px] text-amber-200">An administrator must register this floor before route overlays can be shown on the PDF.</p>}
          <div className="mt-4 text-[10px] leading-4 text-slate-500">A successful mathematical fit is not proof of physical accuracy. Field verification is intentionally kept separate.</div>
        </aside>

        <main ref={pageContainerRef} className="order-1 min-h-0 flex-1 overflow-auto bg-slate-800 p-3 lg:order-2 lg:p-5">
          {pdfState === 'loading' && <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-300"><LoaderCircle className="animate-spin" size={18} /> Rendering original PDF…</div>}
          {pdfState === 'error' && (
            <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-rose-300/20 bg-slate-900 p-5 text-sm">
              <div className="font-bold text-rose-200">PDF preview unavailable</div>
              <p className="mt-2 text-xs text-slate-300">{pdfError}</p>
              <a href={plan.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-cyan-200">Open source PDF <ExternalLink size={13} /></a>
            </div>
          )}
          <div className="relative mx-auto w-fit" style={{ display: pdfState === 'ready' ? 'block' : 'none' }}>
            <canvas ref={canvasRef} className="block bg-white shadow-2xl" />
            {pageMetrics && (
              <svg
                viewBox={`0 0 ${pageMetrics.width} ${pageMetrics.height}`}
                className={`absolute inset-0 h-full w-full ${adminEnabled && (selectedNodeId || surveyMode) ? 'cursor-crosshair' : ''}`}
                onClick={addControlPoint}
                role="img"
                aria-label="Architectural drawing with registered navigation route overlay"
              >
                {transform && routeSegments.map((segment, index) => {
                  const points = segment.map(toViewport).filter(Boolean).map((point) => `${point.x},${point.y}`).join(' ');
                  return <polyline key={index} points={points} fill="none" stroke="#2563eb" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />;
                })}
                {transform && floorNodes.filter((node) => routeResult?.nodeIds?.includes(node.nodeId)).map((node) => {
                  const point = toViewport(node);
                  return point ? <circle key={node.nodeId} cx={point.x} cy={point.y} r="6" fill="#2563eb" stroke="white" strokeWidth="2" /> : null;
                })}
                {transform && userPosition && Number(userPosition.floor) === Number(floor) && (() => {
                  const point = toViewport(userPosition);
                  return point ? <g><circle cx={point.x} cy={point.y} r="12" fill="#0ea5e9" opacity="0.25" /><circle cx={point.x} cy={point.y} r="5" fill="#0284c7" stroke="white" strokeWidth="2" /></g> : null;
                })()}
                {surveyFeatures.map((feature) => {
                  const points = (feature.points || []).map((point) => `${point.x * pageMetrics.width},${point.y * pageMetrics.height}`).join(' ');
                  const color = feature.featureType === 'wall_boundary' ? '#ef4444' : feature.featureType === 'fence_boundary' ? '#a3e635' : feature.featureType === 'door_opening' ? '#f59e0b' : feature.featureType === 'room_footprint' ? '#eab308' : feature.featureType === 'room_label_anchor' ? '#d946ef' : '#06b6d4';
                  if (feature.featureType === 'room_label_anchor') { const point = feature.points?.[0]; return point ? <g key={feature._id}><circle cx={point.x * pageMetrics.width} cy={point.y * pageMetrics.height} r="7" fill={color} stroke="white" strokeWidth="2" /><text x={point.x * pageMetrics.width + 9} y={point.y * pageMetrics.height - 8} fill="#111827" stroke="white" strokeWidth="3" paintOrder="stroke" fontSize="11">{feature.label}</text></g> : null; }
                  return <polyline key={feature._id} points={points} fill={feature.featureType === 'room_footprint' ? `${color}22` : 'none'} stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={feature.status === 'candidate' ? '8 5' : undefined} />;
                })}
                {metricCalibrationMode && scalePoints.length > 0 && <g><polyline points={scalePoints.map((point) => `${point.x * pageMetrics.width},${point.y * pageMetrics.height}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="4" strokeDasharray="6 4" />{scalePoints.map((point,index)=><circle key={index} cx={point.x*pageMetrics.width} cy={point.y*pageMetrics.height} r="6" fill="#22d3ee" stroke="#111827" strokeWidth="2" />)}</g>}
                {surveyMode && surveyPoints.length > 0 && <g><polyline points={surveyPoints.map((point) => `${point.x * pageMetrics.width},${point.y * pageMetrics.height}`).join(' ')} fill="none" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="7 4" />{surveyPoints.map((point, index) => <circle key={index} cx={point.x * pageMetrics.width} cy={point.y * pageMetrics.height} r="5" fill="#fbbf24" stroke="#111827" strokeWidth="2" />)}</g>}
                {controlPoints.map((point) => (
                  <g key={point.nodeId}>
                    <circle cx={point.pdfX * pageMetrics.width} cy={point.pdfY * pageMetrics.height} r="8" fill="#f59e0b" stroke="#111827" strokeWidth="2" />
                    <text x={point.pdfX * pageMetrics.width + 10} y={point.pdfY * pageMetrics.height - 10} fill="#111827" stroke="white" strokeWidth="3" paintOrder="stroke" fontSize="12" fontWeight="bold">{point.nodeId}</text>
                  </g>
                ))}
              </svg>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
