import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, Building2 } from 'lucide-react';

export default function QRGeneratorModal({ isOpen, onClose, nodes = [] }) {
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [selectedType, setSelectedType] = useState('all');

  if (!isOpen) return null;

  const filteredNodes = nodes.filter((n) => {
    if (selectedFloor !== 'all' && n.floor !== Number(selectedFloor)) return false;
    if (selectedType !== 'all' && n.type !== selectedType) return false;
    return Boolean(n.qrCode || n.nodeId);
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-4xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Building2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Campus Checkpoint QR Plaques</h3>
              <p className="text-xs text-slate-500">
                Printable QR markers for Bishop Jerome Institute
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-3 text-xs">
          <select
            value={selectedFloor}
            onChange={(e) => setSelectedFloor(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium"
          >
            <option value="all">All Floors</option>
            <option value="0">Ground Floor</option>
            <option value="1">1st Floor</option>
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium"
          >
            <option value="all">All Types</option>
            <option value="entrance">Entrances</option>
            <option value="checkpoint">Checkpoints</option>
            <option value="stair">Stairs</option>
            <option value="lift">Lifts</option>
            <option value="room">Classrooms</option>
            <option value="lab">Labs</option>
            <option value="office">Offices</option>
          </select>

          <span className="ml-auto text-slate-500 font-semibold">
            {filteredNodes.length} plaques
          </span>
        </div>

        <div className="p-5 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 printable-qr-grid">
          {filteredNodes.map((node) => {
            const qrValue = node.qrCode || `QR_${node.nodeId.replace(/-/g, '_')}`;
            return (
              <div
                key={node.nodeId}
                className="border border-slate-200 rounded-2xl p-3 text-center bg-white shadow-xs flex flex-col items-center"
              >
                <div className="w-full flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
                  <span>BJI MAIN</span>
                  <span className="text-blue-600">{node.floor === 0 ? 'GF' : `F${node.floor}`}</span>
                </div>
                <QRCodeSVG value={qrValue} size={118} level="H" includeMargin />
                <div className="text-xs font-bold text-slate-800 mt-1.5 line-clamp-1">
                  {node.name}
                </div>
                <div className="text-[10px] font-mono text-slate-500 break-all mt-0.5">
                  {qrValue}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
