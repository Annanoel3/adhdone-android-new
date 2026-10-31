import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { dialogLook } from "./goalsTheme";

// "Did you do it today?" for a daily-habit step (ported from the Goals app's
// HabitCheckInModal). Opened only from the step's own button on the goal page;
// it never opens on its own. The goal page does the saving (onCheckIn): a yes
// finishes today's habit task and ticks today; notes go on the step.
export default function HabitCheckInModal({ step, onClose, onCheckIn, theme, specialMode }) {
  const D = dialogLook(theme, specialMode);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  if (!step) return null;

  const handle = async (didIt) => {
    setLoading(true);
    try {
      await onCheckIn(step, didIt, notes.trim());
      toast({
        title: didIt ? "🎉 Nice work!" : "No worries!",
        description: didIt ? "Keep that streak alive!" : "Tomorrow's another shot. You've got this!",
      });
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save check-in", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!step} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`w-[calc(100vw-2rem)] max-w-sm rounded-2xl ${D.surface}`}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <DialogTitle className={`text-base ${D.title}`}>Quick check-in!</DialogTitle>
          </div>
          <DialogDescription className={`text-sm mt-1 leading-relaxed text-left ${D.muted}`}>
            Did you do <span className={`font-semibold ${D.title}`}>"{step.title}"</span> today?
          </DialogDescription>
        </DialogHeader>

        <Textarea
          placeholder="Optional: any notes, wins, or struggles?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`text-sm resize-none rounded-xl mt-2 ${D.field}`}
          rows={3}
        />

        <div className="flex gap-3 mt-1">
          <Button onClick={() => handle(false)} disabled={loading} variant="outline" className={`flex-1 rounded-xl gap-2 ${D.outline}`}>
            <XCircle className="w-4 h-4" /> Not today
          </Button>
          <Button onClick={() => handle(true)} disabled={loading} className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white gap-2">
            <CheckCircle2 className="w-4 h-4" /> Yes, I did it!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
