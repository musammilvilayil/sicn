import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../services/api';

/**
 * Camera-based indoor QR checkpoint listener for the 2D map.
 * The user enables the camera once (browser permission requirement); thereafter
 * QR codes are detected automatically from the live rear-camera stream.
 */
export default function IndoorCheckpointScanner({ enabled, onClose, onConfirm }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scannerRef = useRef(null);
  const detectorRef = useRef(null);
  const cancelledRef = useRef(false);
  const busyRef = useRef(false);
  const lastAcceptedRef = useRef('');
  const candidateRef = useRef(null);
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState(null);
  candidateRef.current = candidate;

  const stopCamera = useCallback(() => {
    cancelledRef.current = true;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    try {
      scannerRef.current?.clear();
    } catch {
      // The fallback decoder may already have been cleared during unmount.
    }
    scannerRef.current = null;
    detectorRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    cancelledRef.current = false;
    let timerId = null;
    let localScanner = null;
    let canvas = null;
    let context = null;

    const start = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera scanning requires HTTPS. Open SICN using its secure URL.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelledRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (!videoRef.current) throw new Error('Camera preview is not ready.');
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if ('BarcodeDetector' in window) {
          try {
            detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
          } catch {
            detectorRef.current = null;
          }
        }
        if (!detectorRef.current) {
          localScanner = new Html5Qrcode('sicn-map-qr-fallback', { verbose: false });
          scannerRef.current = localScanner;
          canvas = document.createElement('canvas');
          context = canvas.getContext('2d', { willReadFrequently: true });
        }
        setStatus('scanning');

        const verify = async (rawValue) => {
          if (!rawValue || busyRef.current || rawValue === lastAcceptedRef.current) return;
          busyRef.current = true;
          try {
            const checkpoint = await api.getNodeByQR(rawValue);
            if (!cancelledRef.current && checkpoint?.nodeId) {
              lastAcceptedRef.current = rawValue;
              setCandidate({ ...checkpoint, qrValue: rawValue });
              setStatus('confirm');
            }
          } catch {
            // Ignore unrelated QR codes in posters, notices and personal devices.
          } finally {
            busyRef.current = false;
          }
        };

        const scan = async () => {
          if (cancelledRef.current) return;
          const video = videoRef.current;
          if (video?.readyState >= 2 && !busyRef.current && !candidateRef.current) {
            try {
              if (detectorRef.current) {
                const codes = await detectorRef.current.detect(video);
                await verify(codes?.find((code) => code.rawValue)?.rawValue);
              } else if (localScanner && context) {
                const width = Math.min(video.videoWidth || 640, 720);
                const height = Math.max(1, Math.round(width * (video.videoHeight || 480) / (video.videoWidth || 640)));
                canvas.width = width;
                canvas.height = height;
                context.drawImage(video, 0, 0, width, height);
                const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.68));
                if (blob && !cancelledRef.current) {
                  const file = new File([blob], 'sicn-live-frame.jpg', { type: 'image/jpeg' });
                  const value = await localScanner.scanFile(file, false);
                  await verify(value);
                }
              }
            } catch {
              // A frame without a readable QR is normal; continue scanning.
            }
          }
          if (!cancelledRef.current) timerId = window.setTimeout(scan, 700);
        };
        scan();
      } catch (err) {
        if (!cancelledRef.current) {
          setError(err?.message || 'Unable to start the camera. Check camera permission and retry.');
          setStatus('error');
        }
      }
    };

    start();
    return () => {
      cancelledRef.current = true;
      if (timerId) window.clearTimeout(timerId);
      stopCamera();
    };
  }, [enabled, stopCamera]);

  const confirmCheckpoint = () => {
    if (!candidate) return;
    onConfirm(candidate);
    setCandidate(null);
    onClose();
  };

  if (!enabled) return null;

  return (
    <div className="fixed bottom-24 left-3 md:left-[280px] z-40 w-[min(340px,calc(100vw-24px))] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full ${status === 'scanning' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <div className="text-xs font-extrabold text-slate-900">Automatic QR checkpoint</div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500" aria-label="Close QR scanner">
          <X size={15} />
        </button>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative w-24 h-20 shrink-0 overflow-hidden rounded-xl bg-slate-950">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute inset-2 border border-white/70 rounded-lg pointer-events-none" />
          <div id="sicn-map-qr-fallback" className="hidden" />
        </div>
        <div className="min-w-0 flex-1">
          {status === 'starting' && <p className="text-xs text-slate-600 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Starting camera…</p>}
          {status === 'scanning' && <p className="text-xs text-slate-700">Keep the QR checkpoint in the camera view. SICN will detect it automatically.</p>}
          {status === 'error' && <p className="text-xs text-rose-600">{error}</p>}
          {status === 'confirm' && candidate && (
            <div className="text-xs text-slate-700">
              <div className="font-extrabold text-slate-900 flex items-center gap-1"><MapPin size={13} /> {candidate.name}</div>
              <div className="text-slate-500 mt-0.5">{Number(candidate.floor) === 0 ? 'Ground Floor' : `Floor ${candidate.floor}`}</div>
            </div>
          )}
        </div>
      </div>

      {candidate && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-bold text-emerald-900">Checkpoint detected. Are you standing here?</p>
          <p className="text-[11px] text-emerald-800 mt-1">Confirming updates your current floor and recalculates the active route.</p>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={confirmCheckpoint} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">
              <CheckCircle2 size={14} /> Confirm location
            </button>
            <button type="button" onClick={() => { setCandidate(null); lastAcceptedRef.current = ''; setStatus('scanning'); }} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200">
              Not here
            </button>
          </div>
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-2">Camera stays active while this panel is open. Close it to stop scanning.</p>
    </div>
  );
}
