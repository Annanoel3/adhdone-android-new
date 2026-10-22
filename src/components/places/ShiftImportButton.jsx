import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';

// Posted schedules almost always arrive as a photo of a printout or a PDF from
// work. Reading it and typing seven times is exactly the kind of friction that
// makes people skip setting their schedule at all, so we let the AI read it.
export default function ShiftImportButton({ theme, onImported }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const dark = theme === 'dark';

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setNote('Reading your schedule...');

    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `This is a work schedule (photo or document). Today is ${format(new Date(), 'EEEE, MMMM d, yyyy')}.

Extract ONLY the shifts for the person this schedule belongs to. For each working day return:
- shift_date: the calendar date in YYYY-MM-DD. If the schedule shows only weekdays without a year, assume the upcoming/current week relative to today.
- arrive_by: the shift START time in 24-hour HH:MM (when they need to BE there).
- ends_at: the shift END time in 24-hour HH:MM, or empty if not shown.
- place_label: location/store name if the schedule names one, otherwise empty.

Skip days off, blanks, "OFF", or anything that isn't a real shift. If you cannot read any shifts, return an empty list.`,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          shifts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                shift_date: { type: 'string' },
                arrive_by: { type: 'string' },
                ends_at: { type: 'string' },
                place_label: { type: 'string' },
              },
            },
          },
        },
      },
    });

    const found = (result?.shifts || []).filter((s) => s.shift_date && s.arrive_by);

    if (!found.length) {
      setNote("Couldn't read any shifts from that — try a clearer photo, or enter them below.");
      setBusy(false);
      return;
    }

    // Re-importing a corrected schedule should overwrite, not duplicate.
    const existing = await base44.entities.WorkShift.list('shift_date', 500);
    const byDate = {};
    existing.forEach((s) => { byDate[s.shift_date] = s; });

    for (const s of found) {
      const payload = {
        shift_date: s.shift_date,
        arrive_by: s.arrive_by,
        ends_at: s.ends_at || '',
        place_label: s.place_label || '',
      };
      if (byDate[s.shift_date]) {
        await base44.entities.WorkShift.update(byDate[s.shift_date].id, payload);
      } else {
        await base44.entities.WorkShift.create(payload);
      }
    }

    setNote(`Added ${found.length} shift${found.length === 1 ? '' : 's'}. Check them below and fix anything off.`);
    setBusy(false);
    onImported?.();
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className={`w-full ${dark ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : ''}`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {busy ? 'Reading...' : 'Upload a photo or file of your schedule'}
      </Button>
      {note && (
        <p className={`text-xs ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{note}</p>
      )}
    </div>
  );
}