import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import VoiceTaskInput from "@/components/tasks/VoiceTaskInput";
import { base44 } from "@/api/base44Client";
import { dialogLook } from "./goalsTheme";

// "How did it go?" after a goal step is marked done (Anna, Nov 1 2026:
// "Anytime someone checks a milestone or whatever done, ask them how it went.
// Give them a microphone and type option."). Typed or dictated (the same mic
// as the win box). Save keeps their words on the step (feedback) and hands
// them to the planner, which may adjust the weeks ahead (goalPlannerChat
// step_feedback, run by the goal page). Skip, or closing it, marks it asked
// (feedback_asked_at), so it is asked once and never again.
//
// The page shows it through usePopupTurn (one popup at a time) and keeps
// `step` set until this calls onDone: eligibility is latched.

export default function StepFeedbackPopup({ step, open, onDone, theme, specialMode }) {
  const D = dialogLook(theme, specialMode);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef("");
  const doneRef = useRef(false);

  useEffect(() => {
    // A new step to ask about: start empty.
    setText("");
    textRef.current = "";
    setError("");
    doneRef.current = false;
  }, [step?.id]);

  if (!step) return null;

  const change = (v) => {
    textRef.current = v;
    setText(v);
  };
  const addSpoken = (spoken) => {
    const said = String(spoken || "").trim();
    if (!said) return;
    const before = textRef.current.replace(/\s*$/, "");
    change(before ? `${before} ${said}` : said);
  };

  const finish = (result) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.(result);
  };

  const skip = async () => {
    if (saving) return;
    try {
      await base44.entities.GoalStep.update(step.id, { feedback_asked_at: new Date().toISOString() });
    } catch (e) {
      // Not saved: it may ask again next time, which is the lesser problem.
    }
    finish({ saved: false });
  };

  const save = async () => {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    setError("");
    try {
      const at = new Date().toISOString();
      await base44.entities.GoalStep.update(step.id, { feedback: value, feedback_at: at, feedback_asked_at: at });
      finish({ saved: true, feedback: value });
    } catch (e) {
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const name = String(step.title || "").replace(/^Week\s+\d+:\s*/i, "").trim();

  return (
    <Dialog open={!!open} onOpenChange={(o) => { if (!o) skip(); }}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] rounded-2xl overflow-x-hidden [&>*]:min-w-0 ${D.surface}`}>
        <DialogHeader className="text-left min-w-0">
          <DialogTitle className={D.title}>How did it go?</DialogTitle>
          <DialogDescription className={`break-words ${D.muted}`}>
            {name ? `"${name}"` : "This step"}. What helped, what didn't? Your plan adjusts to what you say.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="flex items-start gap-2">
            <Textarea
              value={text}
              onChange={(e) => change(e.target.value)}
              placeholder="Type or tap the mic"
              aria-label="How it went"
              className={`min-h-[88px] flex-1 text-sm ${D.field}`}
            />
            <VoiceTaskInput onTranscription={addSpoken} theme={theme} />
          </div>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={skip} disabled={saving} className={`flex-1 ${D.muted}`}>
              Skip
            </Button>
            <Button type="submit" disabled={!text.trim() || saving} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
              {saving ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" />Saving…</>) : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
