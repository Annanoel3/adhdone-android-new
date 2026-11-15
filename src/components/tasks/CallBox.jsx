import React, { useEffect, useRef, useState } from 'react';
import { Phone, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { trackFire } from '@/lib/appTrack';
import ContactPickerButton from '../birthdays/ContactPickerButton';
import { openPhoneApp } from '../utils/openPhoneApp';

// The number for a "call someone" task, saved ahead of time. Anna, Nov 15
// 2026, on the text-task box ("choose a contact or phone number") with a Call
// button: "And do calls?" So: who the call is to (their word for them, or a
// contact picked with the phone's own picker, which needs no contacts
// permission) and a number.
//
// One box, used on the task's row (CallOffer), its open card and its reminder
// page (TaskNotification, with Call). Saving writes Task.call_person /
// call_phone. Call hands the number to the phone's own dialer (openPhoneApp);
// the person starts the call there. The app never places a call by itself.
//
// Only on a task the parser marked calls_someone. No popup and nothing in
// Smart Reminders about it. AppEvent call_ahead (props.action: saved |
// cleared | call) counts how it's used.

const oneLine = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

// "Mom", or '' when the task names no one.
export function callPersonOf(task) {
  return oneLine(task?.call_person, 60);
}

// A number is saved: the row and the reminder can offer Call.
export function callHasNumber(task) {
  return !!String(task?.call_phone || '').replace(/[^0-9]/g, '');
}

// Hands the number to the phone's dialer. Nothing is marked done: they check
// the task off themselves once the call is made.
export function callTaskNumber(task, fields) {
  const phone = fields ? fields.call_phone : task?.call_phone;
  trackFire('call_ahead', { props: { action: 'call', task_id: task?.id } });
  return openPhoneApp(phone || '');
}

export default function CallBox({ task, theme, autoFocus = false, showCall = false, onSaved, onCancel }) {
  const [person, setPerson] = useState(String(task?.call_person || ''));
  const [phone, setPhone] = useState(String(task?.call_phone || ''));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  const dark = theme === 'dark';

  useEffect(() => {
    setPerson(String(task?.call_person || ''));
    setPhone(String(task?.call_phone || ''));
  }, [task?.id, task?.call_person, task?.call_phone]);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);

  const next = {
    call_person: oneLine(person, 60) || null,
    call_phone: oneLine(phone, 30) || null,
  };
  const before = {
    call_person: oneLine(task?.call_person, 60) || null,
    call_phone: oneLine(task?.call_phone, 30) || null,
  };
  const changed = next.call_person !== before.call_person || next.call_phone !== before.call_phone;
  const hasNumber = !!String(next.call_phone || '').replace(/[^0-9]/g, '');

  const save = async () => {
    if (!task?.id || saving) return false;
    if (!changed) return true;
    setSaving(true);
    setError('');
    try {
      await base44.entities.Task.update(task.id, next);
      if (next.call_phone !== before.call_phone) {
        trackFire('call_ahead', { props: { action: next.call_phone ? 'saved' : 'cleared', task_id: task.id } });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
      window.dispatchEvent(new Event('tasks-changed'));
      if (onSaved) onSaved(next);
      return true;
    } catch (e) {
      console.error('[CallBox] could not save the number:', e);
      setError("Couldn't save that. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Call with what is on screen right now, saved or not: a save that fails
  // must not stand between them and the call they are about to make.
  const call = async () => {
    if (saving || !hasNumber) return;
    await save();
    callTaskNumber(task, next);
  };

  const who = next.call_person;
  const field = `w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
    dark
      ? 'border-gray-700 bg-gray-900 text-gray-100 placeholder:text-gray-500 focus:ring-emerald-700'
      : 'border-emerald-200 bg-white text-gray-900 placeholder:text-gray-400 focus:ring-emerald-300'
  }`;

  return (
    <div
      className={`rounded-xl border p-3 ${dark ? 'border-emerald-800/60 bg-emerald-900/15' : 'border-emerald-200 bg-emerald-50/70'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <label className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-emerald-300' : 'text-emerald-800'}`}>
        <Phone className="w-3.5 h-3.5" />
        Call to make
      </label>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="text"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          maxLength={60}
          placeholder="Who are you calling?"
          aria-label="Who the call is to"
          className={field}
        />
        <input
          ref={ref}
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
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[11px] leading-snug ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          {saved
            ? 'Saved. Calling is one tap from the reminder.'
            : error
              ? <span className="text-red-500">{error}</span>
              : 'Call hands this number to your phone. You start the call there.'}
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
              dark ? 'bg-emerald-700 text-white hover:bg-emerald-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>
      {showCall && hasNumber && (
        <button
          type="button"
          onClick={call}
          disabled={saving}
          className={`mt-3 w-full h-12 rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 ${
            dark ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          <Phone className="w-5 h-5" />
          {who ? `Call ${who}` : 'Call'}
        </button>
      )}
    </div>
  );
}
