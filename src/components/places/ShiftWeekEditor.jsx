import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format, startOfWeek, addDays, addWeeks } from 'date-fns';

// Week-by-week shift entry, for schedules that change every week (retail,
// service, healthcare). The user pastes in whatever their posted schedule says
// for THIS week; next week is a separate, empty week.
export default function ShiftWeekEditor({ theme }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [shifts, setShifts] = useState({});
  const [loading, setLoading] = useState(true);

  const dark = theme === 'dark';
  const dayKeys = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'));

  const load = useCallback(async () => {
    setLoading(true);
    const all = await base44.entities.WorkShift.list('shift_date', 500);
    const map = {};
    all.forEach((s) => { if (dayKeys.includes(s.shift_date)) map[s.shift_date] = s; });
    setShifts(map);
    setLoading(false);
  }, [dayKeys.join()]);

  useEffect(() => { load(); }, [load]);

  const setTime = async (date, arrive_by) => {
    const existing = shifts[date];
    if (existing) {
      await base44.entities.WorkShift.update(existing.id, { arrive_by });
    } else {
      await base44.entities.WorkShift.create({ shift_date: date, arrive_by });
    }
    load();
  };

  const clear = async (date) => {
    if (shifts[date]) {
      await base44.entities.WorkShift.delete(shifts[date].id);
      load();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className={`text-sm font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`}>
          {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}
        </span>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Loading week...</p>
      ) : (
        dayKeys.map((date) => (
          <div key={date} className="flex items-center gap-2">
            <span className={`w-24 text-sm ${dark ? 'text-gray-200' : 'text-gray-700'}`}>
              {format(new Date(`${date}T12:00:00`), 'EEE d')}
            </span>
            <Input
              type="time"
              value={shifts[date]?.arrive_by || ''}
              onChange={(e) => e.target.value && setTime(date, e.target.value)}
              className={`flex-1 ${dark ? 'bg-gray-700 text-white border-gray-600' : ''}`}
            />
            {shifts[date] && (
              <Button variant="ghost" size="icon" onClick={() => clear(date)} title="Clear day">
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            )}
          </div>
        ))
      )}
      <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        Times are when you need to <strong>be there</strong> — not when you leave. Blank = day off.
      </p>
    </div>
  );
}