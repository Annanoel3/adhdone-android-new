import React from 'react';
import { monthlyOrdinals, ordinalWord, WEEKDAY_WORDS, changeMonthlyRule } from '../utils/repeatTime';

// A monthly task's day, said as a sentence with two blanks:
//   the [2nd] [Tuesday] of every month     the [15th] [day] of every month
//
// Anna, Nov 14 2026: "Perhaps when setting monthly things it can say 'the ____
// ____ of every month'. The blanks can be numbers of the months. But it can
// also be first tuesday, first monday, etc. The two blanks would be scrolling
// fields I guess... The second blank would default to 'day.' But each day of
// the week is available to choose from."
//
// The blanks are the phone's own scrolling pickers. The second one is "day"
// or a weekday; the first one lists what goes with it (1st to 31st for "day",
// 1st to 4th and last for a weekday). `rule` is { ord, unit } (see
// utils/repeatTime.js) or null for a monthly task with no day yet, which shows
// a dash until a blank is picked. This only reports the new rule (onChange);
// saving it, and moving the task to its next such day, is the caller's.
export default function MonthlyRuleFields({ rule, task, onChange, theme, className = '' }) {
  const dark = theme === 'dark';
  const unit = rule ? rule.unit : 'day';
  const field = `border rounded px-2 py-1.5 text-sm ${dark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900'}`;
  const word = `text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={word}>the</span>
        <select
          aria-label="Which one"
          className={field}
          value={rule ? String(rule.ord) : ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { if (e.target.value !== '') onChange(changeMonthlyRule(rule, { ord: e.target.value }, task)); }}
        >
          {!rule && <option value="">–</option>}
          {monthlyOrdinals(unit).map((n) => (
            <option key={n} value={String(n)}>{ordinalWord(n)}</option>
          ))}
        </select>
        <select
          aria-label="Day of the month or a weekday"
          className={field}
          value={String(unit)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(changeMonthlyRule(rule, { unit: e.target.value }, task))}
        >
          <option value="day">day</option>
          {WEEKDAY_WORDS.map((d, i) => (
            <option key={d} value={String(i)}>{d}</option>
          ))}
        </select>
        <span className={word}>of every month</span>
      </div>
      {rule && rule.unit === 'day' && rule.ord >= 29 && (
        <p className="text-xs text-gray-500 mt-1">Shorter months use their last day.</p>
      )}
    </div>
  );
}
