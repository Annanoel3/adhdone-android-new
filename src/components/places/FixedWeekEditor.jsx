import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { base44 } from '@/api/base44Client';

const DAYS = [
  { i: 1, label: 'Mon' }, { i: 2, label: 'Tue' }, { i: 3, label: 'Wed' },
  { i: 4, label: 'Thu' }, { i: 5, label: 'Fri' }, { i: 6, label: 'Sat' }, { i: 0, label: 'Sun' },
];

// Same days and times every week — stored on the profile as
// [{ day: 0-6, arrive_by: 'HH:MM' }].
export default function FixedWeekEditor({ user, theme }) {
  const [days, setDays] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const map = {};
    (user?.work_fixed_days || []).forEach((d) => { map[d.day] = d.arrive_by || '09:00'; });
    setDays(map);
  }, [user]);

  const dark = theme === 'dark';

  const toggle = (i) => {
    setSaved(false);
    setDays((prev) => {
      const next = { ...prev };
      if (i in next) delete next[i]; else next[i] = '09:00';
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const list = Object.entries(days).map(([day, arrive_by]) => ({ day: Number(day), arrive_by }));
      await base44.auth.updateMe({ work_fixed_days: list });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {DAYS.map(({ i, label }) => (
        <div key={i} className="flex items-center gap-3">
          <Checkbox checked={i in days} onCheckedChange={() => toggle(i)} id={`day-${i}`} />
          <label htmlFor={`day-${i}`} className={`w-12 text-sm ${dark ? 'text-gray-200' : 'text-gray-700'}`}>
            {label}
          </label>
          {i in days ? (
            <div className="flex items-center gap-2 flex-1">
              <span className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>be there by</span>
              <Input
                type="time"
                value={days[i]}
                onChange={(e) => { setSaved(false); setDays((p) => ({ ...p, [i]: e.target.value })); }}
                className={`w-32 ${dark ? 'bg-gray-700 text-white border-gray-600' : ''}`}
              />
            </div>
          ) : (
            <span className={`text-xs flex-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>off</span>
          )}
        </div>
      ))}
      <Button onClick={save} disabled={saving} className="w-full bg-green-600 hover:bg-green-700 text-white">
        {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save weekly schedule'}
      </Button>
    </div>
  );
}