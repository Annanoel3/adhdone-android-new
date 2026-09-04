import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Receives text captured natively (Android share sheet or the quick-capture
// notification's inline reply) via the ShareBridge Capacitor plugin and hands
// it to the Add Task screen, which auto-submits it through the normal parser.
// Module-level so it survives this component remounting (which happens on every
// navigation, since each route gets its own layout wrapper). Without it, the
// same pending text is fetched and delivered again after we navigate to
// AddTask, creating a duplicate task.
let lastDelivered = { text: '', at: 0 };

export default function SharedTextReceiver() {
  const navigate = useNavigate();

  useEffect(() => {
    const bridge = window.Capacitor?.Plugins?.ShareBridge;
    if (!bridge) return;

    const deliver = (text) => {
      if (!text || !text.trim()) return;
      const clean = text.trim();
      const now = Date.now();
      if (lastDelivered.text === clean && now - lastDelivered.at < 60000) return;
      lastDelivered = { text: clean, at: now };
      navigate('/AddTask', { state: { sharedText: clean, sharedAt: now } });
    };

    // Cold start: text was captured before the web app was ready.
    bridge.getPendingSharedText?.().then((res) => deliver(res?.text)).catch(() => {});

    // Warm start: app already running when the share / reply arrived.
    let handle;
    const sub = bridge.addListener?.('sharedText', (e) => deliver(e?.text));
    if (sub && typeof sub.then === 'function') sub.then((h) => { handle = h; });
    else handle = sub;

    return () => { handle?.remove?.(); };
  }, [navigate]);

  return null;
}