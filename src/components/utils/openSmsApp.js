/**
 * Hand a message off to the phone's native messaging app.
 *
 * Setting window.location.href = "sms:..." navigates the WebView itself to a
 * scheme it can't render — on Android that leaves the app sitting on a blank
 * white page even though the SMS app opened. Clicking a real anchor (or handing
 * the URL to the OS via Capacitor) lets Android route the intent while the app
 * stays exactly where it was.
 */
export function openSmsApp(phone, message) {
  const body = encodeURIComponent(message || '');
  const cleanPhone = (phone || '').replace(/[^0-9+]/g, '');
  const url = cleanPhone ? `sms:${cleanPhone}?body=${body}` : `sms:?body=${body}`;

  // Native Android/iOS: let the OS open it, leaving the WebView untouched.
  const openUrl = window.Capacitor?.Plugins?.App?.openUrl;
  if (openUrl) {
    try {
      openUrl({ url });
      return;
    } catch (e) { /* fall through to anchor */ }
  }

  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
}