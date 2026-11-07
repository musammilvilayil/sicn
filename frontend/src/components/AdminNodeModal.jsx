import React, { useState, useEffect } from 'react';
import { X, MapPin, Trash2, Save, Link2 } from 'lucide-react';
import { api } from '../services/api';

const NODE_TYPES = [
  'checkpoint',
  'room',
  'corridor',
  'stair',
  'lift',
  'entrance',
  'restroom',
  'lab',
  'office',
  'library',
  'hall',
];

export default function AdminNodeModal({
  isOpen,
  onClose,
  editingNode = null, // null = creating new node
  initialCoords = { x: 50, y: 50 },
  currentFloor = 0,
  allNodes = [],
  onSaved,
}) {
  const isEditing = Boolean(editingNode);

  const [nodeId, setNodeId] = useState('');
  const [name, setName] = useState('');
  const [floor, setFloor] = useState(currentFloor);
  const [type, setType] = useState('room');
  const [coordX, setCoordX] = useState(50);
  const [coordY, setCoordY] = useState(50);
  const [qrCode, setQrCode] = useState('');
  const [accessible, setAccessible] = useState(true);
  const [description, setDescription] = useState('');
  const [connectToNodeId, setConnectToNodeId] = useState('');
  const [edgeDistance, setEdgeDistance] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setErrorMsg('');
    if (editingNode) {
      setNodeId(editingNode.nodeId);
      setName(editingNode.name);
      setFloor(editingNode.floor);
      setType(editingNode.type || 'room');
      setCoordX(editingNode.coordinates?.x ?? 50);
      setCoordY(editingNode.coordinates?.y ?? 50);
      setQrCode(editingNode.qrCode || '');
      setAccessible(editingNode.accessible !== false);
      setDescription(editingNode.metadata?.description || '');
      setConnectToNodeId('');
      setEdgeDistance('');
    } else {
      const prefix = currentFloor === 0 ? 'GF' : `${currentFloor}F`;
      const randId = `${prefix}-NODE-${Math.floor(100 + Math.random() * 900)}`;
      setNodeId(randId);
      setName('');
      setFloor(currentFloor);
      setType('checkpoint');
      setCoordX(initialCoords?.x ?? 50);
      setCoordY(initialCoords?.y ?? 50);
      setQrCode(`QR_${randId.replace(/-/g, '_')}`);
      setAccessible(true);
      setDescription('');
      const defaultCorridor = allNodes.find(
        (n) => n.floor === currentFloor && n.type === 'corridor'
      );
      setConnectToNodeId(defaultCorridor?.nodeId || '');
      setEdgeDistance('');
    }
  }, [editingNode, initialCoords, currentFloor, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSaving(true);

    try {
      if (isEditing) {
        await api.updateNode(editingNode.nodeId, {
          name,
          floor: Number(floor),
          type,
          coordinates: { x: Number(coordX), y: Number(coordY) },
          qrCode,
          accessible,
          metadata: { description },
        });

        if (connectToNodeId) {
          await api.createEdge({
            fromNode: editingNode.nodeId,
            toNode: connectToNodeId,
            distance: edgeDistance ? Number(edgeDistance) : undefined,
          });
        }
      } else {
        await api.createNode({
          nodeId,
          name,
          floor: Number(floor),
          type,
          coordinates: { x: Number(coordX), y: Number(coordY) },
          qrCode,
          accessible,
          metadata: { description },
          connectToNodeId: connectToNodeId || undefined,
          edgeDistance: edgeDistance ? Number(edgeDistance) : undefined,
        });
      }

      await onSaved?.();
      onClose?.();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save node');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingNode) return;
    setErrorMsg('');
    setSaving(true);
    try {
      await api.deleteNode(editingNode.nodeId);
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete node');
    } finally {
      setSaving(false);
    }
  };

  const floorCandidates = allNodes.filter((n) => n.nodeId !== nodeId);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <MapPin size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isEditing ? `Edit Map Node: ${editingNode.nodeId}` : 'Add New Map Node (Admin)'}
              </h3>
              <p className="text-xs text-slate-500">
                Admin RBAC Map & Graph Topology Editor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-3.5">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3.5 py-2.5 rounded-xl">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Node ID</label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
              >
                {NODE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Room / Checkpoint Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Robotics Innovation Lab"
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Floor</label>
              <select
                value={floor}
                onChange={(e) => setFloor(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
              >
                <option value={0}>Ground (0)</option>
                <option value={1}>1st Floor (1)</option>
                <option value={2}>2nd Floor (2)</option>
                <option value={3}>3rd Floor (3)</option>
                <option value={4}>4th Floor (4)</option>
                <option value={5}>5th Floor (5)</option>
                <option value={6}>6th Floor (6)</option>
                <option value={7}>7th Floor (7)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Coord X (0-100)</label>
              <input
                type="number"
                step="0.5"
                value={coordX}
                onChange={(e) => setCoordX(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Coord Y (0-100)</label>
              <input
                type="number"
                step="0.5"
                value={coordY}
                onChange={(e) => setCoordY(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">QR Code Payload</label>
              <input
                type="text"
                value={qrCode}
                onChange={(e) => setQrCode(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl"
              />
            </div>
            <label className="flex items-center gap-2 pt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={accessible}
                onChange={(e) => setAccessible(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-xs font-semibold text-slate-700">
                Wheelchair Accessible
              </span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional room notes or capacity"
              className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl"
            />
          </div>

          {/* Connect Edge Helper */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Link2 size={14} className="text-indigo-600" />
              <span>{isEditing ? 'Add Extra Corridor Connection (Optional)' : 'Connect to Walkable Corridor / Node'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={connectToNodeId}
                onChange={(e) => setConnectToNodeId(e.target.value)}
                className="col-span-2 px-2.5 py-2 text-xs border border-slate-200 rounded-xl bg-white"
              >
                <option value="">-- No edge connection --</option>
                {floorCandidates.map((n) => (
                  <option key={n.nodeId} value={n.nodeId}>
                    [F{n.floor}] {n.name} ({n.nodeId})
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.5"
                value={edgeDistance}
                onChange={(e) => setEdgeDistance(e.target.value)}
                placeholder="Auto m"
                className="px-2.5 py-2 text-xs border border-slate-200 rounded-xl bg-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs px-4 py-2.5 rounded-xl transition"
              >
                <Trash2 size={14} /> Delete Node
              </button>
            ) : (
              <div />
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow transition disabled:opacity-50"
            >
              <Save size={14} />
              <span>{saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Node'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

