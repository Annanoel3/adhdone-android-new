import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { base44 } from '@/api/base44Client';

const DAYS = [
  { i: 1, label: 'Monday' }, { i: 2, label: 'Tuesday' }, { i: 3, label: 'Wednesday' },
  { i: 4, label: 'Thursday' }, { i: 5, label: 'Friday' }, { i: 6, label: 'Saturday' },
  { i: 0, label: 'Sunday' },
];

// Same days and times every week — stored on the profile as
// [{ day: 0-6, arrive_by: 'HH:MM', ends_at: 'HH:MM' }].
//
// Layout note: on a phone, a time input plus two words does not fit beside a
// checkbox. Each day is its own block instead — the day name on one line, the
// two times side by side underneath — so nothing wraps mid-row.
export default function FixedWeekEditor({ user, theme }) {
  const [days, setDays] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const map = {};
    (user?.work_fixed_days || []).forEach((d) => {
      map[d.day] = { arrive_by: d.arrive_by || '09:00', ends_at: d.ends_at || '17:00' };
    });
    setDays(map);
  }, [user]);

  const dark = theme === 'dark';

  const toggle = (i) => {
    setSaved(false);
    setDays((prev) => {
      const next = { ...prev };
      if (i in next) delete next[i]; else next[i] = { arrive_by: '09:00', ends_at: '17:00' };
      return next;
    });
  };

  const setField = (i, field, value) => {
    setSaved(false);
    setDays((p) => ({ ...p, [i]: { ...p[i], [field]: value } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const list = Object.entries(days).map(([day, v]) => ({
        day: Number(day),
        arrive_by: v.arrive_by,
        ends_at: v.ends_at,
      }));
      await base44.auth.updateMe({ work_fixed_days: list });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const timeClass = `h-10 ${dark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white'}`;

  return (
    <div className="space-y-2">
      {DAYS.map(({ i, label }) => {
        const on = i in days;
        return (
          <div
            key={i}
            className={`rounded-xl px-3 py-2.5 ${
              on
                ? dark ? 'bg-gray-700/60' : 'bg-green-50'
                : dark ? 'bg-gray-700/20' : 'bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Checkbox checked={on} onCheckedChange={() => toggle(i)} id={`day-${i}`} />
              <label
                htmlFor={`day-${i}`}
                className={`flex-1 text-sm font-medium ${dark ? 'text-gray-100' : 'text-gray-800'}`}
              >
                {label}
              </label>
              {!on && (
                <span className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Off</span>
              )}
            </div>

            {on && (
              <div className="grid grid-cols-2 gap-2 mt-2.5 pl-7">
                <div>
                  <p className={`text-[11px] mb-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Start by
                  </p>
                  <Input
                    type="time"
                    value={days[i].arrive_by}
                    onChange={(e) => setField(i, 'arrive_by', e.target.value)}
                    className={timeClass}
                  />
                </div>
                <div>
                  <p className={`text-[11px] mb-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Done at
                  </p>
                  <Input
                    type="time"
                    value={days[i].ends_at}
                    onChange={(e) => setField(i, 'ends_at', e.target.value)}
                    className={timeClass}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Button onClick={save} disabled={saving} className="w-full bg-green-600 hover:bg-green-700 text-white mt-1">
        {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save weekly schedule'}
      </Button>
    </div>
  );
}