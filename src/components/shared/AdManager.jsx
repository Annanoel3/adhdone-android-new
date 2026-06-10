import { useEffect, useState, useRef } from 'react';
import { initAdMob, showInterstitialAd } from '@/lib/admob';

const AD_OPEN_KEY = 'admgr_open_count';

function isCapacitor() {
  return window.Capacitor?.isNativePlatform?.() ?? false;
}

function isUserBusy() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return true;
  if (el.isContentEditable || el.contentEditable === 'true') return true;
  if (window.__microphoneActive) return true;
  if (document.querySelector('[data-mic-active="true"]')) return true;
  return false;
}

function shouldShowAd(count) {
  if (count === 2) return true;
  if (count > 2 && (count - 2) % 3 === 0) return true;
  return false;
}

export default function AdManager() {
  const [countdown, setCountdown] = useState(null);
  const delayRef = useRef(null);
  const countRef = useRef(null);

  useEffect(() => {
    if (!isCapacitor()) return;
    initAdMob().catch(() => {});
    const raw = localStorage.getItem(AD_OPEN_KEY);
    const count = raw ? parseInt(raw, 10) + 1 : 1;
    localStorage.setItem(AD_OPEN_KEY, String(count));
    if (!shouldShowAd(count)) return;
    delayRef.current = setTimeout(() => tryShowAd(), 30000);
    return () => {
      if (delayRef.current) clearTimeout(delayRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, []);

  function tryShowAd() {
    if (isUserBusy()) {
      delayRef.current = setTimeout(() => tryShowAd(), 5000);
      return;
    }
    startCountdown();
  }

  function startCountdown() {
    let c = 5;
    setCountdown(c);
    countRef.current = setInterval(() => {
      c -= 1;
      if (c <= 0) {
        clearInterval(countRef.current);
        setCountdown(null);
        fireAd();
      } else {
        setCountdown(c);
      }
    }, 1000);
  }

  function fireAd() {
    showInterstitialAd().catch(() => {});
  }

  if (countdown === null) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      right: '12px',
      background: 'rgba(0,0,0,0.55)',
      color: '#fff',
      padding: '3px 7px',
      borderRadius: '4px',
      fontSize: '10px',
      zIndex: 9999,
      pointerEvents: 'none',
      letterSpacing: '0.02em',
    }}>
      Ad in {countdown}...
    </div>
  );
}