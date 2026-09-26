import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Handles taps on the Android home-screen widget — both a task row and the "+"
// quick-add button. The widget sends a target path through WidgetBridge and we
// navigate to it in-place.
//
// This deliberately does NOT go through the push/OneSignal notification-click
// path. That code is delicate and working; a widget tap is a different source
// with the same destination, so it gets its own channel rather than a second
// caller inside push code.
//
// Module-level so it survives remounts (every navigation remounts the layout),
// which would otherwise re-read the same pending tap and bounce the user back.
let lastDelivered = { path: '', at: 0 };

// Only in-app routes — a path from outside the web layer must never be able to
// send the user to another origin.
function isSafePath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

export default function WidgetOpenReceiver() {
  const navigate = useNavigate();

  useEffect(() => {
    const bridge = window.Capacitor?.Plugins?.WidgetBridge;
    if (!bridge) return;

    const deliver = (rawPath) => {
      if (!isSafePath(rawPath)) return;
      // A widget task tap should land on the task's details card, not the
      // reminder/snooze screen the push notifications use. "Done" on a
      // reminder or on the phone's alarm comes through here too, with done=1,
      // and only the reminder screen finishes a task from that. Sending it to
      // the details card as well meant Done did nothing: the reminder went
      // away and the task stayed unfinished ("Take Pills" done from its
      // notification in the car, and asked about again an hour later).
      const finishIt = rawPath.startsWith('/TaskNotification') && /[?&]done=1(&|$)/.test(rawPath);
      const path = rawPath.startsWith('/TaskNotification') && !finishIt
        ? rawPath.replace('/TaskNotification', '/Tasks')
        : rawPath;
      const now = Date.now();
      if (lastDelivered.path === path && now - lastDelivered.at < 5000) return;
      lastDelivered = { path, at: now };
      navigate(path);
    };

    // Cold start: widget was tapped while the app wasn't running.
    bridge.getPendingWidgetOpen?.().then((res) => deliver(res?.path)).catch(() => {});

    // Warm start: app already open in the background.
    let handle;
    const sub = bridge.addListener?.('widgetOpen', (e) => deliver(e?.path));
    if (sub && typeof sub.then === 'function') sub.then((h) => { handle = h; });
    else handle = sub;

    return () => { handle?.remove?.(); };
  }, [navigate]);

  return null;
}