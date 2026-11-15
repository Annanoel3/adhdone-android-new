/**
 * Hand a number to the phone's own dialer.
 *
 * The app never places a call by itself: this opens the phone app with the
 * number in it (Android), or the phone's own "Call ...?" sheet (iPhone), and
 * the person starts the call there. Same hand-off as openSmsApp: the iPhone
 * app has NotifyBridge.openExternal; on Android the tel: link is taken by the
 * app's own link handler (MainActivity.launchExternalScheme, which opens the
 * dialer for tel:).
 *
 * Returns false when there is no number to call.
 */
export function openPhoneApp(phone) {
  const clean = String(phone || '').replace(/[^0-9+*#]/g, '');
  if (!clean) return false;
  const url = `tel:${clean.replace(/#/g, '%23')}`;

  const bridge = window.Capacitor?.Plugins?.NotifyBridge;
  if (bridge?.openExternal) {
    bridge.openExternal({ url }).catch(() => {
      window.location.href = url;
    });
    return true;
  }

  try {
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 0);
  } catch (e) {
    window.location.href = url;
  }
  return true;
}
