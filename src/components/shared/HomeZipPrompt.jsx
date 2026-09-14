import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Briefcase } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HomeBaseFields from '@/components/settings/HomeBaseFields';
import { base44 } from '@/api/base44Client';

// v2: the prompt moved from "on launch" to "first errand", so everyone who
// hasn't actually saved a home base yet gets one more chance to see it.
const SEEN_KEY = 'home_zip_prompt_seen_v2';

// One-time, skippable ask for a home base. Only asked the first time the user
// creates something that actually leaves the house (an errand / a task with a
// location) — that's the moment it's useful, so the ask makes sense instead of
// arriving out of nowhere on launch.
export default function HomeZipPrompt({ user, theme }) {
  const [open, setOpen] = useState(false);
  // Second step, only after home base is saved: commuters get far more out of
  // this than anyone else, but asking about work up front would bury the ask
  // that actually matters.
  const [step, setStep] = useState('home');
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    // Saved on the profile too, so a new device / cleared browser storage
    // doesn't start asking all over again.
    if (localStorage.getItem(SEEN_KEY) === 'true' || user.home_zip_prompt_seen_v2) return;
    if (user.home_address || user.home_zipcode) {
      localStorage.setItem(SEEN_KEY, 'true');
      return;
    }
    const onErrand = () => setOpen(true);
    window.addEventListener('errand-task-created', onErrand);
    return () => window.removeEventListener('errand-task-created', onErrand);
  }, [user]);

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, 'true');
    setOpen(false);
    base44.auth.updateMe({ home_zip_prompt_seen_v2: true }).catch(() => {});
  };

  const goToPlaces = () => {
    localStorage.setItem(SEEN_KEY, 'true');
    setOpen(false);
    base44.auth.updateMe({ home_zip_prompt_seen_v2: true }).catch(() => {});
    navigate('/Places');
  };

  if (step === 'work') {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
        <DialogContent className={`max-w-md w-[calc(100vw-2rem)] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <Briefcase className="w-5 h-5" />
              Got it. Do you commute to a job?
            </DialogTitle>
            <DialogDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
              If you add your work address and what time you need to be there, I can watch the
              actual traffic on that drive and tell you when to head out. Schedules that change
              every week are fine — you can enter them a week at a time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={dismiss}>No / not now</Button>
            <Button onClick={goToPlaces} className="bg-green-600 hover:bg-green-700 text-white">
              Add work &amp; schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
            <MapPin className="w-5 h-5" />
            Where's home base?
          </DialogTitle>
          <DialogDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
            With a starting point I can tell you when to actually leave for things — real drive
            time, real traffic — and group errands near each other into one trip. No GPS, no
            tracking.
          </DialogDescription>
        </DialogHeader>

        <HomeBaseFields user={user} theme={theme} onSaved={() => setStep('work')} compact />

        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          Totally optional — you can add or change it any time in <strong>Tools → Places</strong>.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={dismiss}>Not now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}