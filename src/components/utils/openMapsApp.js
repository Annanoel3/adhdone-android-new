/**
 * Open a place in the phone's maps app.
 *
 * window.open() inside the Android WebView spawns an empty inner window (the
 * "white screen"), so on device we never use it: we hand a geo: intent to
 * native when the bridge is available, and otherwise navigate to the geo: URL,
 * which the WebView routes out to the OS. Plain web gets a new tab.
 */
export function openMapsApp(query) {
  const q = (query || '').trim();
  if (!q) return;

  const geoUrl = `geo:0,0?q=${encodeURIComponent(q)}`;
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  const isNative = !!window.Capacitor?.isNativePlatform?.();
  const bridge = window.Capacitor?.Plugins?.NotifyBridge;

  if (bridge?.openExternal) {
    bridge.openExternal({ url: geoUrl }).catch(() => { window.location.href = geoUrl; });
    return;
  }

  if (isNative) {
    window.location.href = geoUrl;
    return;
  }

  window.open(webUrl, '_blank', 'noopener');
}