// components/utils/onesignal.js
export function setOneSignalTag(key, value) {
  const inGoNative = /GoNative/i.test(navigator.userAgent);
  if (!inGoNative) return; // only inside the GoNative app
  window.location.href =
    "gonative://onesignal/sendTag?key=" +
    encodeURIComponent(key) +
    "&value=" +
    encodeURIComponent(value);
}