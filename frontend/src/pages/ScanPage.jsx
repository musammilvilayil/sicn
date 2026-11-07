import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  Sparkles,
  Upload,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Radio,
  Printer,
  MapPin,
  ArrowRight,
} from 'lucide-react';
import { api } from '../services/api';
import { useNavigation } from '../context/NavigationContext';
import { useSocket } from '../context/SocketContext';
import QRGeneratorModal from '../components/QRGeneratorModal';
import ShareLocationSheet from '../components/ShareLocationSheet';

export default function ScanPage() {
  const navigate = useNavigate();
  const {
    nodes,
    setStartNodeId,
    setCurrentFloor,
    destinationNodeId,
    accessibleOnly,
    computeRoute,
    showToast,
  } = useNavigation();

  const { roomCode, roomMembers, broadcastCheckpoint } = useSocket();

  const [activeTab, setActiveTab] = useState('simulate'); // 'camera' | 'simulate' | 'upload'
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [detectedNode, setDetectedNode] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const qrRegionId = 'scanpage-html5qr-region';
  const scannerRef = useRef(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // ignore cleanup race
      }
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setErrorMsg('');
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(qrRegionId);
      }

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        throw new Error('No camera detected. Use Checkpoint Simulator or Upload QR Image.');
      }

      const envCam =
        cameras.find((c) => /back|rear|environment/i.test(c.label)) || cameras[0];

      await scannerRef.current.start(
        envCam.id,
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decodedText) => {
          handleVerifyQr(decodedText);
        },
        () => {}
      );
      setCameraActive(true);
    } catch (err) {
      setErrorMsg(err.message || 'Camera permission denied. Try Simulator tab.');
      setCameraActive(false);
    }
  };

  const handleVerifyQr = async (qrPayload) => {
    if (verifying) return;
    setVerifying(true);
    setErrorMsg('');
    try {
      const node = await api.getNodeByQR(qrPayload);
      setDetectedNode(node);
      await stopCamera();

      // Immediately calibrate start location & broadcast to Socket.io room!
      setStartNodeId(node.nodeId);
      setCurrentFloor(node.floor);
      broadcastCheckpoint(node.nodeId);
      showToast(`Checked in at ${node.name}!`, 'success');
    } catch (err) {
      setErrorMsg(err.message || `Unrecognized QR code: "${qrPayload}"`);
    } finally {
      setVerifying(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setVerifying(true);
    try {
      const tempScanner = new Html5Qrcode('scanpage-file-reader');
      const decoded = await tempScanner.scanFile(file, true);
      await handleVerifyQr(decoded);
    } catch {
      setErrorMsg('Could not detect a valid QR code in that image.');
    } finally {
      setVerifying(false);
    }
  };

  const handleGoToMapWithCheckpoint = async () => {
    if (!detectedNode) return;
    if (destinationNodeId) {
      await computeRoute(detectedNode.nodeId, destinationNodeId, accessibleOnly, nodes);
    }
    navigate('/');
  };

  const checkpointNodes = nodes.filter(
    (n) => n.qrCode || n.type === 'checkpoint' || n.type === 'entrance' || n.type === 'room'
  );

  return (
    <div className="min-h-dvh bg-slate-50 pb-24">
      {/* Top Mobile App Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <QrCode size={20} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 leading-tight">
                QR Checkpoint Scanner
              </h1>
              <p className="text-xs text-slate-500">
                Calibrate indoor position & sync live location
              </p>
            </div>
          </div>

          <button
            onClick={() => setQrModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl transition"
          >
            <Printer size={14} /> QR Plaques
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4 md:pl-24">
        {/* Socket.io Live Broadcast Banner */}
        <div
          onClick={() => setShareOpen(true)}
          className={`cursor-pointer rounded-2xl p-3.5 border flex items-center justify-between gap-3 transition ${
            roomCode
              ? 'bg-violet-600 text-white border-violet-600 shadow-md'
              : 'bg-white text-slate-800 border-slate-200 hover:border-violet-300'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Radio size={18} className={roomCode ? 'text-emerald-300 animate-pulse' : 'text-violet-600'} />
            <div className="min-w-0">
              <div className="text-xs font-bold">
                {roomCode
                  ? `Live Broadcasting Active • Room #${roomCode}`
                  : 'Want friends to see your QR scans live?'}
              </div>
              <p className={`text-[11px] truncate ${roomCode ? 'text-violet-100' : 'text-slate-500'}`}>
                {roomCode
                  ? `${roomMembers.length} member(s) in room — every scan updates your map avatar instantly.`
                  : 'Tap here to generate or join a 6-digit Live Location Room.'}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${
              roomCode ? 'bg-white/20 text-white' : 'bg-violet-50 text-violet-700'
            }`}
          >
            {roomCode ? 'Manage' : 'Share Live'}
          </span>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-3 gap-1.5 bg-slate-200/75 p-1 rounded-2xl">
          {[
            { id: 'camera', label: 'Camera', icon: Camera },
            { id: 'simulate', label: 'Simulator', icon: Sparkles },
            { id: 'upload', label: 'Upload', icon: Upload },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id !== 'camera') stopCamera();
                  setActiveTab(t.id);
                  setErrorMsg('');
                }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition ${
                  active
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon size={15} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium p-3.5 rounded-2xl flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Confirmed Checkpoint Banner */}
        {detectedNode && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-3xl p-4 shadow-sm space-y-3 animate-fade-in">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={24} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                  Checkpoint Calibrated {roomCode ? `• Broadcasted to #${roomCode}` : ''}
                </span>
                <h3 className="text-base font-extrabold text-slate-900">
                  {detectedNode.name}
                </h3>
                <p className="text-xs text-emerald-800 flex items-center gap-1 mt-0.5">
                  <MapPin size={12} />
                  {detectedNode.floor === 0 ? 'Ground Floor' : `Floor ${detectedNode.floor}`} • ID: {detectedNode.nodeId}
                </p>
              </div>
            </div>

            <button
              onClick={handleGoToMapWithCheckpoint}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 px-4 rounded-2xl shadow flex items-center justify-center gap-2 transition"
            >
              <span>Open Map from {detectedNode.name}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* TAB 1: LIVE CAMERA */}
        {activeTab === 'camera' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col items-center text-center">
            <div
              id={qrRegionId}
              className="w-full max-w-xs overflow-hidden rounded-2xl bg-slate-900"
            />
            {!cameraActive ? (
              <div className="py-6 space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                  <Camera size={30} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Scan Physical Wall QR</h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                    Point your phone camera at any Bishop Jerome Institute checkpoint plaque.
                  </p>
                </div>
                <button
                  onClick={startCamera}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded-2xl shadow transition"
                >
                  Start Camera Scanner
                </button>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-xs font-bold text-emerald-600 animate-pulse">
                  Scanning live camera feed...
                </span>
                <button
                  onClick={stopCamera}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-1.5 rounded-xl"
                >
                  Stop
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CHECKPOINT SIMULATOR */}
        {activeTab === 'simulate' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Instant Checkpoint Tap</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tap any campus QR plaque below to simulate scanning it on mobile and trigger live Socket.io updates:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
              {checkpointNodes.slice(0, 16).map((node) => {
                const isSelected = detectedNode?.nodeId === node.nodeId;
                return (
                  <button
                    key={node.nodeId}
                    onClick={() => handleVerifyQr(node.qrCode || node.nodeId)}
                    className={`text-left p-3 rounded-2xl border transition ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20'
                        : 'bg-slate-50/70 border-slate-200 hover:border-blue-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        {node.floor === 0 ? 'Ground Floor' : `Floor ${node.floor}`}
                      </span>
                      <span className="text-[10px] font-semibold uppercase text-slate-400">
                        {node.type}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate">{node.name}</div>
                    <div className="text-[11px] font-mono text-blue-600 truncate mt-0.5">
                      {node.qrCode || node.nodeId}
                    </div>
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualCode.trim()) handleVerifyQr(manualCode.trim());
              }}
              className="pt-2 border-t border-slate-100 flex gap-2"
            >
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Or enter QR code (e.g. QR_1F_CLASS_02)"
                className="flex-1 px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl"
              >
                Check In
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: IMAGE UPLOAD */}
        {activeTab === 'upload' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
            <div id="scanpage-file-reader" className="hidden" />
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-8 cursor-pointer bg-slate-50/70 transition text-center">
              <Upload size={34} className="text-blue-600 mb-2.5" />
              <span className="text-sm font-bold text-slate-900">
                Upload QR Checkpoint Photo
              </span>
              <span className="text-xs text-slate-500 mt-1">
                Supports PNG, JPG, or screenshot of any campus QR plaque
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        )}
      </main>

      <QRGeneratorModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        nodes={nodes}
      />

      <ShareLocationSheet
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

