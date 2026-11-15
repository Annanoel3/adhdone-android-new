import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import TextAheadBox, { textPersonOf, textIsTyped } from './TextAheadBox';
import { isTourActive } from '@/components/onboarding/tourActive';
import { usePopupTurn } from '@/components/onboarding/onboardingSurface';
import { trackFire } from '@/lib/appTrack';

// "Want to type that text now?" for a text-someone task that was made OUTSIDE
// the app (a share, the widget, a quick capture: captureText sets
// Task.text_ask_pending). Anna, Nov 15 2026: "if its added from outside the
// app, it could have a popup next time they open". A task typed in the app
// gets no popup: the line is right there on its row (TextOffer). Calendar
// imports get none either (they arrive in batches).
//
// Asked ONCE per task: the flag is cleared the moment the popup is on screen,
// whatever they answer. One popup per time the app is opened, the newest task
// first; another waiting task is asked at the next open. It takes its turn
// (usePopupTurn: never on top of another popup, never on the reminder page).
// AppEvent text_ask (props.action: shown | saved | not_now).

const ONE_PER_OPEN_MS = 10 * 60 * 1000;

export default function TextAskPopup({ user, theme }) {
  const [task, setTask] = useState(null);
  const shown = usePopupTurn(!!task);
  const busyRef = useRef(false);
  const lastShownAtRef = useRef(0);
  const markedRef = useRef(null);

  const check = useCallback(async () => {
    if (!user?.email || busyRef.current) return;
    if (isTourActive()) return;
    if (Date.now() - lastShownAtRef.current < ONE_PER_OPEN_MS) return;
    busyRef.current = true;
    try {
      const rows = await base44.entities.Task.filter({ status: 'active', text_ask_pending: true }, '-created_date', 10);
      const waiting = (rows || []).filter((t) => t && t.text_ask_pending === true);
      // Nothing left to ask about on these: the words are typed already, or
      // the task is silenced or no longer a text task. Their flag is cleared.
      const stale = waiting.filter((t) => t.texts_someone !== true || t.silenced || textIsTyped(t));
      for (const t of stale) base44.entities.Task.update(t.id, { text_ask_pending: false }).catch(() => {});
      const candidate = waiting.find((t) => !stale.includes(t));
      if (candidate) setTask(candidate);
      else busyRef.current = false;
    } catch (e) {
      console.error('[TextAskPopup] check failed', e);
      busyRef.current = false;
    }
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return undefined;
    const timer = setTimeout(check, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') setTimeout(check, 1500); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.email, check]);

  // On screen: that is the one ask this task gets.
  useEffect(() => {
    if (!shown || !task?.id || markedRef.current === task.id) return;
    markedRef.current = task.id;
    lastShownAtRef.current = Date.now();
    trackFire('text_ask', { props: { action: 'shown', task_id: task.id } });
    base44.entities.Task.update(task.id, { text_ask_pending: false }).catch(() => {});
  }, [shown, task?.id]);

  const close = (action) => {
    if (task?.id && action) trackFire('text_ask', { props: { action, task_id: task.id } });
    setTask(null);
    busyRef.current = false;
  };

  if (!task) return null;
  const who = textPersonOf(task);
  const dark = theme === 'dark';

  return (
    <Dialog open={shown} onOpenChange={(open) => { if (!open) close('not_now'); }}>
      <DialogContent className={`max-w-md ${dark ? 'bg-gray-900 text-white border-gray-700' : ''}`}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${dark ? 'bg-sky-900/50' : 'bg-sky-100'}`}>
              <MessageSquare className={`w-6 h-6 ${dark ? 'text-sky-300' : 'text-sky-600'}`} />
            </div>
            <div className="text-left">
              <DialogTitle className="text-xl">
                {who ? `Type your text to ${who} now?` : 'Type that text now?'}
              </DialogTitle>
              <DialogDescription>
                You added &ldquo;{String(task.title || '').slice(0, 80)}&rdquo;. Type it now and it will be ready to send when it's time.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <TextAheadBox
          task={task}
          theme={theme}
          onCancel={() => close('not_now')}
          onSaved={() => close('saved')}
        />
      </DialogContent>
    </Dialog>
  );
}
