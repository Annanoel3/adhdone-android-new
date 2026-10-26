import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Pause, Play, Square } from 'lucide-react';
import { usePluginPresent } from './WidgetTaskSync';

// A thin bar under the header on EVERY page while the phone is recording for
// notes, with Pause and Stop on it. Before this, the only Stop inside the app
// was on the Record Notes page: the tray notification's tap opens the app on
// Home, and someone who landed there had a recording running with nothing on
// screen to stop it (Anna, Oct 26 2026: "it opens the app, but it doesn't
// actually stop the recording"). Record Notes draws its own controls, so the
// bar stays off that page. Stop here hands the person to Record Notes, which
// turns the stopped recording into notes on arrival (resumeUnfinished).
const recorder = () => (typeof window !== 'undefined' && window.Capacitor?.Plugins?.RecorderBridge) || null;

const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(r).padStart(2, '0');
};

export default function RecordingBar({ currentPageName, theme }) {
  const navigate = useNavigate();
  const present = usePluginPresent('RecorderBridge');
  const [live, setLive] = useState(null); // { paused, baseMs, baseAt }
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const read = async () => {
    const R = recorder();
    if (!R) return;
    try {
      const st = await R.status();
      if (!mounted.current) return;
      if (st?.recording && st.session) {
        setLive({ paused: st.session.state === 'paused', baseMs: Number(st.session.elapsedMs) || 0, baseAt: Date.now() });
      } else {
        setLive(null);
      }
    } catch (e) { /* an older build */ }
  };

  useEffect(() => {
    mounted.current = true;
    if (!present) return undefined;
    read();
    let handle = null;
    const R = recorder();
    try {
      Promise.resolve(R?.addListener?.('recorder', () => read())).then((h) => { handle = h; }).catch(() => {});
    } catch (e) { /* no events on this build */ }
    const onVisible = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(read, 15000);
    return () => {
      mounted.current = false;
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      handle?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);

  // The clock.
  useEffect(() => {
    if (!live || live.paused) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  if (!present || !live || currentPageName === 'Notes') return null;

  const pauseOrResume = async () => {
    const R = recorder();
    if (!R || busy) return;
    setBusy(true);
    try {
      const res = live.paused ? await R.resume() : await R.pause();
      const s = res?.session;
      if (s) setLive({ paused: s.state === 'paused', baseMs: Number(s.elapsedMs) || 0, baseAt: Date.now() });
      else await read();
    } catch (e) { await read(); } finally { setBusy(false); }
  };

  const stop = async () => {
    const R = recorder();
    if (!R || busy) return;
    setBusy(true);
    try {
      await R.stop();
      setLive(null);
      // Record Notes finishes a stopped recording into notes when it opens.
      navigate('/Notes');
    } catch (e) { await read(); } finally { setBusy(false); }
  };

  const elapsed = live.baseMs + (live.paused ? 0 : Date.now() - live.baseAt);
  const specialMode = typeof localStorage !== 'undefined' ? (localStorage.getItem('special_mode') || 'normal') : 'normal';
  const dark = theme === 'dark';
  const shell = specialMode !== 'normal'
    ? `${specialMode}-card`
    : dark ? 'bg-gray-800 text-white border-b border-gray-700' : 'bg-red-50 text-red-900 border-b border-red-100';
  const btn = specialMode !== 'normal' || dark
    ? 'bg-white/15 hover:bg-white/25 text-inherit'
    : 'bg-white hover:bg-red-100 text-red-800 border border-red-200';

  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-sm ${shell}`} role="status">
      <Mic className={`w-4 h-4 flex-shrink-0 ${live.paused ? '' : 'animate-pulse text-red-500'}`} />
      <button type="button" onClick={() => navigate('/Notes')} className="flex-1 min-w-0 text-left truncate">
        {live.paused ? 'Recording paused' : 'Recording for notes'} <span className="tabular-nums opacity-80">{fmt(elapsed)}</span>
      </button>
      <button type="button" onClick={pauseOrResume} disabled={busy} className={`flex items-center gap-1 rounded-full px-3 py-1 ${btn}`}>
        {live.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        {live.paused ? 'Resume' : 'Pause'}
      </button>
      <button type="button" onClick={stop} disabled={busy} className={`flex items-center gap-1 rounded-full px-3 py-1 ${btn}`}>
        <Square className="w-3.5 h-3.5" />
        Stop
      </button>
    </div>
  );
}
