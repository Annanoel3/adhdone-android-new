import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import ChatBubble from './ChatBubble';
import OnboardingBrandMark from './OnboardingBrandMark';
import useTypewriter from './useTypewriter';
import SCRIPT from './welcomeScript';

// The first-run conversation. Answers are saved as they're given (not batched at
// the end) so someone who closes the app halfway through still keeps their name.
export default function WelcomeChat({ onDone }) {
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState([]);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  const beat = SCRIPT[idx];
  const line = beat ? beat.text(name || 'you') : '';
  const { shown, done } = useTypewriter(line);

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
    base44.auth.updateMe({ preferred_name: value }).catch(() => {});
    answer(value);
  };

  const submitAbout = () => {
    const value = draft.trim();
    if (value) base44.auth.updateMe({ about_me: value }).catch(() => {});
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

      {done && beat?.final && (
        <Button onClick={onDone} className="w-full">Let's go</Button>
      )}
    </div>
  );
}