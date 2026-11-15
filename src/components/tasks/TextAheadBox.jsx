import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Loader2, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { trackFire } from '@/lib/appTrack';
import ContactPickerButton from '../birthdays/ContactPickerButton';
import { openSmsApp } from '../utils/openSmsApp';

// The text for a "text someone" task, typed ahead of time. Anna, Nov 15 2026:
// "If someone makes a task to text someone, maybe we should use our ability
// to press send from the app and choose a contact or phone number", and, on
// drafting it with AI: "I was thinking there would just be a spot to type the
// text ahead of time." So: who it's to (their word for them, or a contact
// picked with the phone's own picker, which needs no contacts permission), a
// number, and the words, all typed by the person. Nothing here is written by
// AI.
//
// One box, used on the task's row (TextOffer), its open card, its reminder
// page (TaskNotification, with Send) and the next-open popup for a task made
// outside the app (TextAskPopup). Saving writes Task.text_person / text_phone
// / text_message. Send opens the phone's texting app with the number and the
// words filled in (openSmsApp); the person presses send there. The app never
// sends a text by itself.
//
// Only on a task the parser marked texts_someone. AppEvent text_ahead
// (props.action: saved | cleared | send) counts how it's used.

export const TEXT_MAX = 1000;

const oneLine = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

// "Mom", or '' when the task names no one.
export function textPersonOf(task) {
  return oneLine(task?.text_person, 60);
}

// The words are typed: the row and the reminder can offer Send.
export function textIsTyped(task) {
  return !!String(task?.text_message || '').trim();
}

// Opens the texting app with what the task holds. Nothing is marked done:
// they check the task off themselves once the text is on its way.
export function sendTaskText(task, fields) {
  const phone = fields ? fields.text_phone : task?.text_phone;
  const message = fields ? fields.text_message : task?.text_message;
  trackFire('text_ahead', { props: { action: 'send', task_id: task?.id, typed: !!String(message || '').trim() } });
  openSmsApp(phone || '', String(message || ''));
}

export default function TextAheadBox({ task, theme, autoFocus = false, compact = false, showSend = false, onSaved, onCancel }) {
  const [person, setPerson] = useState(String(task?.text_person || ''));
  const [phone, setPhone] = useState(String(task?.text_phone || ''));
  const [message, setMessage] = useState(String(task?.text_message || ''));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  const dark = theme === 'dark';

  useEffect(() => {
    setPerson(String(task?.text_person || ''));
    setPhone(String(task?.text_phone || ''));
    setMessage(String(task?.text_message || ''));
  }, [task?.id, task?.text_person, task?.text_phone, task?.text_message]);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);

  const next = {
    text_person: oneLine(person, 60) || null,
    text_phone: oneLine(phone, 30) || null,
    // Line breaks stay: it is sent as they typed it.
    text_message: String(message || '').trim().slice(0, TEXT_MAX) || null,
  };
  const before = {
    text_person: oneLine(task?.text_person, 60) || null,
    text_phone: oneLine(task?.text_phone, 30) || null,
    text_message: String(task?.text_message || '').trim() || null,
  };
  const changed = next.text_person !== before.text_person || next.text_phone !== before.text_phone || next.text_message !== before.text_message;

  const save = async () => {
    if (!task?.id || saving) return false;
    if (!changed) return true;
    setSaving(true);
    setError('');
    try {
      await base44.entities.Task.update(task.id, next);
      if (next.text_message !== before.text_message) {
        trackFire('text_ahead', { props: { action: next.text_message ? 'saved' : 'cleared', task_id: task.id } });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
      window.dispatchEvent(new Event('tasks-changed'));
      if (onSaved) onSaved(next);
      return true;
    } catch (e) {
      console.error('[TextAheadBox] could not save the text:', e);
      setError("Couldn't save that. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Send with what is on screen right now, saved or not: a save that fails
  // must not stand between them and the text they are about to send.
  const send = async () => {
    if (saving) return;
    await save();
    sendTaskText(task, next);
  };

  const who = next.text_person;
  const sendLabel = next.text_message || next.text_phone
    ? `Send text${who ? ` to ${who}` : ''}`
    : 'Open my texts';
  const field = `w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
    dark
      ? 'border-gray-700 bg-gray-900 text-gray-100 placeholder:text-gray-500 focus:ring-sky-700'
      : 'border-sky-200 bg-white text-gray-900 placeholder:text-gray-400 focus:ring-sky-300'
  }`;

  return (
    <div
      className={`rounded-xl border p-3 ${dark ? 'border-sky-800/60 bg-sky-900/15' : 'border-sky-200 bg-sky-50/70'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <label className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-sky-300' : 'text-sky-800'}`}>
        <MessageSquare className="w-3.5 h-3.5" />
        Text to send
      </label>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="text"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          maxLength={60}
          placeholder="Who's it to?"
          aria-label="Who the text is to"
          className={field}
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={30}
          placeholder="Their number"
          aria-label="Their phone number"
          className={field}
        />
      </div>
      {/* The phone's own contact picker (hidden in a desktop browser). A
          picked contact fills both boxes above. */}
      <div className="mb-2">
        <ContactPickerButton
          theme={theme}
          onContactPicked={(c) => {
            if (c?.name) setPerson(c.name);
            if (c?.phone) setPhone(c.phone);
          }}
        />
      </div>
      <textarea
        ref={ref}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={TEXT_MAX}
        rows={compact ? 2 : 3}
        placeholder="Type the text here"
        aria-label="The text to send"
        className={`${field} resize-none`}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className={`text-[11px] leading-snug ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          {saved
            ? 'Saved. It will be ready to send from the reminder.'
            : error
              ? <span className="text-red-500">{error}</span>
              : 'Send opens your texting app with this filled in. You press send there.'}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onCancel && (
            <button type="button" onClick={onCancel} className={`text-xs ${dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
              Not now
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!changed || saving}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 ${
              dark ? 'bg-sky-700 text-white hover:bg-sky-600' : 'bg-sky-600 text-white hover:bg-sky-700'
            }`}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>
      {showSend && (
        <button
          type="button"
          onClick={send}
          disabled={saving}
          className={`mt-3 w-full h-12 rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 ${
            dark ? 'bg-sky-600 text-white hover:bg-sky-500' : 'bg-sky-600 text-white hover:bg-sky-700'
          }`}
        >
          <Send className="w-5 h-5" />
          {sendLabel}
        </button>
      )}
    </div>
  );
}
