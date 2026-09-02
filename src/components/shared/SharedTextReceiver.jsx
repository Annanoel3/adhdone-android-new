import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Receives text captured natively (Android share sheet or the quick-capture
// notification's inline reply) via the ShareBridge Capacitor plugin and hands
// it to the Add Task screen, which auto-submits it through the normal parser.
export default function SharedTextReceiver() {
  const navigate = useNavigate();

  useEffect(() => {
    const bridge = window.Capacitor?.Plugins?.ShareBridge;
    if (!bridge) return;

    const deliver = (text) => {
      if (!text || !text.trim()) return;
      navigate('/AddTask', { state: { sharedText: text.trim(), sharedAt: Date.now() } });
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