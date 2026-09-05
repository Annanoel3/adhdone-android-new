/**
 * Hand a message off to the phone's native messaging app.
 *
 * Clicking a real anchor lets Android/iOS route the sms: intent to the
 * messaging app. If nothing handles it, fall back to a direct navigation.
 */
export function openSmsApp(phone, message) {
  const body = encodeURIComponent(message || '');
  const cleanPhone = (phone || '').replace(/[^0-9+]/g, '');
  const url = cleanPhone ? `sms:${cleanPhone}?body=${body}` : `sms:?body=${body}`;

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
}