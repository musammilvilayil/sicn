import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Map tools and layers. A bottom sheet on phones, a floating card beside the
 * map controls on larger screens. `tools` is a list of
 * { key, label, description, icon, onClick, active, disabled, tone }.
 */
export default function MapToolsSheet({ open, onClose, tools = [], title = 'Map tools' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sicn-tools-layer fixed inset-0 z-[60]" role="presentation">
      <button type="button" aria-label="Close map tools" className="sicn-tools-scrim absolute inset-0" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-label={title} className="sicn-tools-sheet animate-fade-in">
        <div className="sicn-tools-grabber md:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between px-4 pt-1 pb-2">
          <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
            <X size={17} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 px-3 pb-[max(14px,env(safe-area-inset-bottom))] sm:grid-cols-4 md:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.key}
                type="button"
                disabled={tool.disabled}
                title={tool.description || tool.label}
                onClick={() => {
                  tool.onClick?.();
                  if (!tool.keepOpen) onClose?.();
                }}
                className={`sicn-tool-tile ${tool.active ? 'is-active' : ''} ${tool.tone === 'warning' ? 'is-warning' : ''}`}
              >
                <span className="sicn-tool-icon">{Icon && <Icon size={19} />}</span>
                <span className="sicn-tool-label">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
