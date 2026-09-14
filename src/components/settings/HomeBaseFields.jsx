import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Check } from 'lucide-react';
import LocationSuggestions from '@/components/tasks/LocationSuggestions';
import { base44 } from '@/api/base44Client';

// Shared home-base editor: a full street address (best) with a zip-only
// fallback. The disclaimer is not decoration — a zip is measured from its
// center point, so "leave now" can be well off for anyone near its edge.
export default function HomeBaseFields({ user, theme, onSaved, compact = false }) {
  const [address, setAddress] = useState('');
  const [zip, setZip] = useState('');
  const [typing, setTyping] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    setAddress(user.home_address || '');
    setZip(user.home_zipcode || '');
  }, [user]);

  const dark = theme === 'dark';
  const inputClass = dark ? 'bg-gray-700 text-white border-gray-600' : '';

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await base44.auth.updateMe({
        home_address: address.trim(),
        home_zipcode: zip.trim(),
      });
      setSaved(true);
      onSaved?.();
    } catch (e) {
      console.error('Failed to save home base:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className={dark ? 'text-gray-200' : ''}>Home address (most accurate)</Label>
        {address ? (
          <div className={`mt-1 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            dark ? 'bg-gray-700 text-gray-100' : 'bg-teal-50 text-gray-800'
          }`}>
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-teal-600" />
            <span className="flex-1 break-words">{address}</span>
            <button
              type="button"
              onClick={() => { setAddress(''); setTyping(''); setSaved(false); }}
              className="text-xs underline flex-shrink-0"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <Input
              value={typing}
              onChange={(e) => { setTyping(e.target.value); setSaved(false); }}
              placeholder="Start typing your street address"
              className={`mt-1 mb-2 ${inputClass}`}
            />
            <LocationSuggestions
              query={typing}
              theme={theme}
              onPick={(v) => { setAddress(v); setTyping(''); setSaved(false); }}
            />
          </>
        )}
      </div>

      <div>
        <Label htmlFor="home-zip" className={dark ? 'text-gray-200' : ''}>
          Or just a zip code
        </Label>
        <Input
          id="home-zip"
          value={zip}
          onChange={(e) => { setZip(e.target.value); setSaved(false); }}
          placeholder="e.g. 78701"
          inputMode="numeric"
          className={`mt-1 ${inputClass}`}
        />
      </div>

      {!address && zip.trim() && (
        <div className={`flex items-start gap-2 rounded-lg p-3 text-xs ${
          dark ? 'bg-amber-950/40 text-amber-200' : 'bg-amber-50 text-amber-800'
        }`}>
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Heads up: a zip code can cover a lot of ground, and drive times get measured from
            the middle of it. If you live near the edge, "time to leave" could be off by 10-15
            minutes — so treat it as a rough estimate and pad anything you can't be late for.
            A full address fixes that.
          </span>
        </div>
      )}

      <Button
        onClick={save}
        disabled={saving || (!address.trim() && !zip.trim())}
        className="w-full bg-green-600 hover:bg-green-700 text-white"
      >
        {saving ? 'Saving...' : saved ? 'Saved ✓' : compact ? 'Save' : 'Save home base'}
      </Button>
    </div>
  );
}