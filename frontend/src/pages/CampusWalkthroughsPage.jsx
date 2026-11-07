import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, PlayCircle, Route, Video } from 'lucide-react';
import { api } from '../services/api';

export default function CampusWalkthroughsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getCampusSurveys()
      .then((rows) => { if (active) setItems(rows.filter((item) => item.status === 'published')); })
      .catch((err) => { if (active) setError(err.message || 'Could not load campus walkthroughs.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-dvh bg-slate-50 px-4 pb-10 pt-5 sm:px-6 md:pl-72">
      <div className="mx-auto max-w-5xl space-y-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft size={16}/> Back to campus map</Link>
        <header className="space-y-2"><div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"><Video size={14}/> CAMPUS VISUAL GUIDES</div><h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Walk the campus before you get there</h1><p className="max-w-2xl text-sm leading-6 text-slate-600">Watch administrator-recorded routes and use the checkpoint list to recognise entrances, corridors, departments and facilities. Use the live SICN map for your actual turn-by-turn route.</p></header>
        {loading && <div className="rounded-2xl bg-white p-6 text-sm text-slate-500">Loading walkthroughs…</div>}
        {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
        {!loading && !error && items.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><PlayCircle size={34} className="mx-auto text-slate-400"/><h2 className="mt-3 font-bold text-slate-900">No walkthroughs published yet</h2><p className="mt-1 text-sm text-slate-500">Campus visual guides will appear here after an administrator records and publishes them.</p></div>}
        <div className="grid gap-5 lg:grid-cols-2">
          {items.map((item) => <article key={item.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <video controls playsInline preload="metadata" src={`/api/surveys/${encodeURIComponent(item.id)}/video`} className="aspect-video w-full bg-slate-950"/>
            <div className="space-y-3 p-4">
              <div><h2 className="text-lg font-extrabold text-slate-900">{item.title}</h2>{item.description && <p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p>}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1"><Route size={13}/>{item.checkpoints?.length || 0} checkpoints</span><span className="rounded-full bg-slate-100 px-2.5 py-1">Floors: {(item.floors || []).join(', ') || '—'}</span></div>
              <ol className="space-y-2 border-l-2 border-blue-100 pl-3">
                {(item.checkpoints || []).map((checkpoint, index) => <li key={index} className="relative"><span className="absolute -left-[19px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-600"/><div className="text-sm font-semibold text-slate-800">{checkpoint.name}</div><div className="text-xs text-slate-500">Floor {checkpoint.floor}</div></li>)}
              </ol>
            </div>
          </article>)}
        </div>
      </div>
    </main>
  );
}
