import React, { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { isIPhoneApp } from '@/lib/phonePlatform';
import { openInBrowser } from '@/components/utils/openInBrowser';
import { ShieldCheck } from 'lucide-react';
import { usePopupTurn } from './onboardingSurface';

// Permission before anything of theirs goes to OpenAI, iPhone app only
// (App Store guideline 5.1.2(i): disclose where personal data goes, third-party
// AI included, and get explicit permission first). Anna, Nov 6 2026: "Add an
// openai permission popup on iphone", and, asked what "Not now" should do:
// "Required to continue". Sorting what they add, Smart Reminders, Support Space
// and Record Notes all run on OpenAI, so the app can't be used until they
// allow it: one button, no X, and a tap outside or the back gesture does
// nothing. It comes before the welcome chat (WelcomeDialog waits for it,
// since the chat itself sends their first task to OpenAI). Given once per
// account (User.ai_consent_at), remembered on the phone too.
// Nov 6 2026: Support Space (typed and spoken) and Record Notes run on
// OPENAI_API_KEY_PRIVATE, a project left out of OpenAI's training share
// (base44/shared/privateAi.ts), hence "but never your Support Space chats or
// recordings". Anything else moved there can be added; never claim more.
// Anna, Nov 6 2026: "We need to make the biggest thing privacy", so the title
// and the first, largest line are what OpenAI never uses: Support Space,
// Record Notes, and what they log on their Parking Lot trackers (the Log box
// and the Parking Lot page; categorizeIdea private: true, foldIdeaIntoTrackers).
// What may be used is said after it, in full, as 5.1.2(i) needs.
const CONSENT_KEY = 'ai_consent_at';
const PRIVACY_URL = 'https://adhdone.space/privacypolicy';
export const AI_CONSENT_EVENT = 'adhdone:ai-consent';

export function aiConsentGiven(user) {
  if (user?.ai_consent_at) return true;
  try { return !!localStorage.getItem(CONSENT_KEY); } catch (e) { return false; }
}

// True where the popup is needed and not answered yet (iPhone app only).
export function aiConsentPending(user) {
  return !!user && isIPhoneApp() && !aiConsentGiven(user);
}

export default function AiConsentDialog({ user }) {
  const [given, setGiven] = useState(false);
  const [saving, setSaving] = useState(false);
  const wanted = aiConsentPending(user) && !given;
  const shown = usePopupTurn(wanted, { reactive: true });

  useEffect(() => {
    if (user?.ai_consent_at) {
      try { localStorage.setItem(CONSENT_KEY, user.ai_consent_at); } catch (e) { /* no storage */ }
    }
  }, [user?.ai_consent_at]);

  const allow = async () => {
    const at = new Date().toISOString();
    setSaving(true);
    try { localStorage.setItem(CONSENT_KEY, at); } catch (e) { /* no storage */ }
    try {
      await base44.auth.updateMe({ ai_consent_at: at });
    } catch (e) {
      // Kept on the phone; saved to the account on a later open.
      console.warn('[AiConsent] could not save to the account:', e);
    }
    setSaving(false);
    setGiven(true);
    window.dispatchEvent(new CustomEvent(AI_CONSENT_EVENT));
  };

  // Given on this phone before the account copy saved: save it now.
  useEffect(() => {
    if (!user || user.ai_consent_at || !isIPhoneApp()) return;
    let local = null;
    try { local = localStorage.getItem(CONSENT_KEY); } catch (e) { local = null; }
    if (local) base44.auth.updateMe({ ai_consent_at: local }).catch(() => {});
  }, [user]);

  return (
    <AlertDialog open={shown} onOpenChange={() => {}}>
      <AlertDialogContent
        className="max-w-md w-[calc(100vw-2rem)] bg-card text-card-foreground border-border"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="w-6 h-6 text-primary flex-shrink-0" aria-hidden="true" />
            Your privacy comes first
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-left">
            <span className="block rounded-lg bg-primary/10 p-3 text-base font-semibold leading-snug text-foreground">
              OpenAI will never use your Support Space chats, your Record Notes recordings and
              notes, or what you log on your Parking Lot trackers to improve its AI models.
            </span>
            <span className="block text-sm">
              To sort the tasks you add and plan your reminders, ADHDone also sends OpenAI, an AI
              company, what you type, say or photograph, your tasks, and what you tell it about
              yourself. OpenAI may use that part to improve its AI models.
            </span>
            <span className="block text-sm">ADHDone can't work without OpenAI, so it asks first.</span>
            <button
              type="button"
              className="underline text-primary"
              onClick={() => openInBrowser(PRIVACY_URL)}
            >
              Privacy Policy
            </button>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={allow} disabled={saving} className="w-full">
            Allow and continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
