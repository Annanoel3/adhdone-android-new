import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { persistOnboardingFlag } from './onboardingSync';

// A one-time explainer for features that live behind a BUTTON rather than a
// page, so they can't use the page-intro tour. Shown the first time the user
// actually reaches for the feature — which is when the explanation is useful —
// and never again. The flag is persisted to the account, so it doesn't reappear
// on a second device.
export const firstUseSeen = (key) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch (e) {
    return false;
  }
};

export const markFirstUseSeen = (key) => {
  try {
    localStorage.setItem(key, '1');
  } catch (e) { /* ignore */ }
  persistOnboardingFlag(key);
};

export default function FirstUseDialog({ open, onConfirm, title, body, confirmLabel = 'Got it', theme }) {
  const cardClass =
    theme === 'dark'
      ? 'bg-gray-900 text-white border-gray-700'
      : theme === 'spicybrains'
        ? 'bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100 border-2 border-yellow-400'
        : 'bg-white text-gray-900 border-gray-200';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onConfirm(); }}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${cardClass}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{body}</DialogDescription>
        </DialogHeader>
        <Button onClick={onConfirm} className="w-full">{confirmLabel}</Button>
      </DialogContent>
    </Dialog>
  );
}