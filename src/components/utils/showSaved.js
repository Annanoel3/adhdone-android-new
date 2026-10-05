import { toast } from '@/components/ui/use-toast';

// The one tiny "Saved ✓" that shows whenever something autosaves.
export default function showSaved() {
  toast({ title: 'Saved ✓', duration: 1500 });
}