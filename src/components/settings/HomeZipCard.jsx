import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function HomeZipCard({ user, theme }) {
  const [zip, setZip] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user?.home_zipcode) setZip(user.home_zipcode);
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await base44.auth.updateMe({ home_zipcode: zip.trim() });
      setSaved(true);
    } catch (e) {
      console.error('Failed to save home zip code:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={`mb-6 border-none shadow-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
          <MapPin className="w-5 h-5" />
          Home Zip Code
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Optional. Used as your "home base" so errands near each other can be grouped into
          one trip. Just a zip code — no GPS, no tracking. Leave it blank if you'd rather not.
        </p>
        <Label htmlFor="home-zip" className={theme === 'dark' ? 'text-gray-200' : ''}>Zip code</Label>
        <Input
          id="home-zip"
          value={zip}
          onChange={(e) => { setZip(e.target.value); setSaved(false); }}
          placeholder="e.g. 78701"
          inputMode="numeric"
          className={`mb-4 ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : ''}`}
        />
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-green-600 hover:bg-green-700 text-white"
        >
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Zip Code'}
        </Button>
      </CardContent>
    </Card>
  );
}