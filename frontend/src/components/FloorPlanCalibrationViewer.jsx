import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ExternalLink, Crosshair, Save, Trash2, AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { api } from '../services/api';
import { FLOOR_PLANS } from '../config/floorPlans';
import { solveAffineCalibration, transformMapToPlan } from '../utils/indoorNavigation';

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
  }, [plan?.url, pageNumber]);

  useEffect(() => {
    if (!calibration) return;
    if (Number(calibration.pageNumber) === Number(pageNumber) && calibration.sourcePdf === plan.sourceName) {
      setControlPoints(calibration.controlPoints || []);
    } else {
      setControlPoints([]);
    }
  }, [calibration, pageNumber, plan.sourceName]);

  const transform = useMemo(() => {
    const savedMatchesPage = calibration &&
      Number(calibration.pageNumber) === Number(pageNumber) &&
      calibration.sourcePdf === plan.sourceName;
    if (savedMatchesPage && calibration?.transform?.xCoefficients && calibration?.transform?.yCoefficients) {
      return calibration.transform;
    }
    if (controlPoints.length >= 3) {
      try { return solveAffineCalibration(controlPoints); } catch { return null; }
    }
    return null;
  }, [calibration, controlPoints, pageNumber, plan.sourceName]);

  const toViewport = (node) => {
    if (!transform || !pageMetrics) return null;
    const normalized = transformMapToPlan(node.coordinates, transform);
    return normalized ? { x: normalized.x * pageMetrics.width, y: normalized.y * pageMetrics.height } : null;
  };

  const addControlPoint = (event) => {
    if (!adminEnabled || pdfState !== 'ready' || !selectedNodeId || !pageMetrics) return;
    const node = floorNodes.find((item) => item.nodeId === selectedNodeId);
    if (!node) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pdfX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const pdfY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
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
            </>
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
                className={`absolute inset-0 h-full w-full ${adminEnabled && selectedNodeId ? 'cursor-crosshair' : ''}`}
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
