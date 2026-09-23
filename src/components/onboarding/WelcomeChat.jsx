import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import ChatBubble from './ChatBubble';
import OnboardingBrandMark from './OnboardingBrandMark';
import useTypewriter from './useTypewriter';
import SCRIPT from './welcomeScript';
import { claimHandle } from '@/functions/claimHandle';
import { enqueueCapture } from '@/lib/pendingCaptures';
import { firstUseSeen, markFirstUseSeen } from './FirstUseDialog';

// The "this is what a reminder looks like" push: booked once per account, a
// few minutes after the first task goes in, through the same reminder pipe
// every real reminder uses — so it proves the whole path, not just the app.
const FIRST_WIN_KEY = 'onboarding_first_win_push_booked';
const FIRST_WIN_MINUTES = 3;

// The first-run conversation. Answers are saved as they're given (not batched at
// the end) so someone who closes the app halfway through still keeps their name.
export default function WelcomeChat({ onDone, script = SCRIPT, initialName = '' }) {
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState([]);
  // A name the profile already holds, so a script without a name beat can
  // still address the person by it.
  const [name, setName] = useState(initialName || '');
  const [handle, setHandle] = useState('');
  const [about, setAbout] = useState('');
  const [task, setTask] = useState('');
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  const beat = script[idx];
  const line = beat ? beat.text(name || 'you', handle, about, task) : '';
  const { shown, done } = useTypewriter(line, 28, idx);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [shown, history.length]);

  // Lines with nothing to answer roll on by themselves after a short beat.
  useEffect(() => {
    if (!done || !beat || beat.input || beat.final) return;
    const t = setTimeout(() => {
      setHistory((h) => [...h, { from: 'app', text: line }]);
      setIdx((i) => i + 1);
    }, 550);
    return () => clearTimeout(t);
  }, [done, beat, line]);

  const answer = (value) => {
    setHistory((h) => [
      ...h,
      { from: 'app', text: line },
      ...(value ? [{ from: 'user', text: value }] : []),
    ]);
    setDraft('');
    setIdx((i) => i + 1);
  };

  const submitName = () => {
    const value = draft.trim();
    if (!value) return;
    setName(value);
    // The name they give IS their username (display_name) — the same field the
    // Settings page edits. Names collide, so the server also mints a unique
    // handle (name + number) that future social features can key on.
    base44.auth.updateMe({ preferred_name: value, display_name: value }).catch(() => {});
    claimHandle({ name: value })
      .then((r) => setHandle(r?.data?.handle || ''))
      .catch(() => {});
    answer(value);
  };

  const submitAbout = () => {
    const value = draft.trim();
    setAbout(value);
    if (value) base44.auth.updateMe({ about_me: value }).catch(() => {});
    answer(value);
  };

  const submitTask = () => {
    const value = draft.trim();
    if (!value) return;
    setTask(value);
    // Same path as typing it on Home: parsed, saved, reminders scheduled.
    enqueueCapture({ text: value });
    if (!firstUseSeen(FIRST_WIN_KEY)) {
      markFirstUseSeen(FIRST_WIN_KEY);
      base44.auth.me()
        .then((me) => me?.email && base44.functions.invoke('schedulePush', {
          toUserExternalId: me.email,
          title: 'This is what a reminder looks like 👋',
          body: `"${value}" is on your list. When it's time, we'll nudge you just like this.`,
          minutesFromNow: FIRST_WIN_MINUTES,
          data: { type: 'first_win_demo' },
        }))
        .catch(() => {});
    }
    answer(value);
  };

  return (
    <div className="space-y-4">
      <OnboardingBrandMark />

      <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
        {history.map((m, i) => (
          <ChatBubble key={i} from={m.from}>{m.text}</ChatBubble>
        ))}
        {beat && (
          <ChatBubble from="app">
            {shown}
            {!done && <span className="opacity-40">▍</span>}
          </ChatBubble>
        )}
        <div ref={endRef} />
      </div>

      {done && beat?.input === 'name' && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitName()}
            placeholder="Your name"
          />
          <Button onClick={submitName} disabled={!draft.trim()}>Send</Button>
        </div>
      )}

      {done && beat?.input === 'about' && (
        <div className="space-y-2">
          <Textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="A sentence or two — whatever feels relevant."
          />
          <div className="flex gap-2">
            <Button onClick={submitAbout} disabled={!draft.trim()} className="flex-1">Send</Button>
            <Button variant="ghost" onClick={() => answer('')}>Skip</Button>
          </div>
        </div>
      )}

      {done && beat?.input === 'task' && (
        <div className="space-y-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitTask()}
            placeholder="One thing you need to do today"
          />
          <div className="flex gap-2">
            <Button onClick={submitTask} disabled={!draft.trim()} className="flex-1">Add it</Button>
            <Button variant="ghost" onClick={() => answer('')}>Skip</Button>
          </div>
        </div>
      )}

      {done && beat?.final && (
        <Button onClick={onDone} className="w-full">Let's go</Button>
      )}
    </div>
  );
}