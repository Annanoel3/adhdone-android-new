import React, { useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import TextAheadBox, { textPersonOf, textIsTyped, sendTaskText } from './TextAheadBox';
import { trackFire } from '@/lib/appTrack';

// "Type the text now so it's ready to send", right on the collapsed card of a
// task that IS sending someone a text (Task.texts_someone, the parser's call:
// "text Mom about Sunday"; not a call, an email, or something that could be
// said in person). Anna, Nov 15 2026: "If someone makes a task to text
// someone, maybe we should use our ability to press send from the app and
// choose a contact or phone number", with "a spot to type the text ahead of
// time" (no AI draft). Not a popup: a line on the card, like PrepOffer,
// BreakItDownOffer and AddAddressOffer, so it never stacks with anything.
// Tapping it opens the text box right there (TextAheadBox); typing the words
// ends it, and × hides it for that task (text_offer_dismissed). The box stays
// on the open card and on the reminder page either way. AppEvent text_offer
// (props.action: open | hide) counts how it's used.

export function textOfferWanted(task) {
  if (!task || task.status !== 'active' || task.texts_someone !== true) return false;
  if (task.text_offer_dismissed || task.silenced || task.parent_task_id || task.birthday_person) return false;
  return !textIsTyped(task);
}

// Once the words are typed: one line on the collapsed row that sends it.
export function TextReadyLine({ task, theme }) {
  if (!task || task.status !== 'active' || task.texts_someone !== true || !textIsTyped(task)) return null;
  const dark = theme === 'dark';
  const who = textPersonOf(task);
  return (
    <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => sendTaskText(task)}
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
          dark
            ? 'border-sky-700 bg-sky-900/30 text-sky-300 hover:bg-sky-900/50'
            : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
        }`}
      >
        <Send className="w-3 h-3" />
        {who ? `Your text to ${who} is ready. Send it` : 'Your text is ready. Send it'}
      </button>
    </div>
  );
}

export default function TextOffer({ task, theme, onRefreshTasks }) {
  const [editing, setEditing] = useState(false);
  const [gone, setGone] = useState(false);

  if (gone || !textOfferWanted(task)) return null;
  const dark = theme === 'dark';
  const who = textPersonOf(task);

  const hide = () => {
    trackFire('text_offer', { props: { action: 'hide', task_id: task.id } });
    setGone(true);
    base44.entities.Task.update(task.id, { text_offer_dismissed: true }).catch(() => {});
  };

  if (editing) {
    return (
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        <TextAheadBox
          task={task}
          theme={theme}
          autoFocus
          compact
          onCancel={() => setEditing(false)}
          onSaved={(fields) => { if (fields?.text_message) setGone(true); if (onRefreshTasks) onRefreshTasks(); }}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => { trackFire('text_offer', { props: { action: 'open', task_id: task.id } }); setEditing(true); }}
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors text-left ${
          dark
            ? 'border-sky-700 bg-sky-900/30 text-sky-300 hover:bg-sky-900/50'
            : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
        }`}
      >
        <MessageSquare className="w-3 h-3 flex-shrink-0" />
        {who ? `Type your text to ${who} now so it's ready to send` : "Type the text now so it's ready to send"}
      </button>
      <button
        type="button"
        onClick={hide}
        className={`p-1 rounded-full transition-colors ${dark ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
        aria-label="Hide this suggestion"
        title="Hide this suggestion"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
