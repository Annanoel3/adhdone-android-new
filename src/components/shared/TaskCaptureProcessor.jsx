import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PriorityPickerDialog from "../tasks/PriorityPickerDialog";
import DatePickerDialog from "../tasks/DatePickerDialog";
import { base44 } from "@/api/base44Client";
import {
  subscribeCaptures,
  claimNextCapture,
  removeCapture,
  stampCaptureOwner,
  saveCaptureProgress,
  resumeAbandonedCaptures,
} from "@/lib/pendingCaptures";
import {
  detectMultipleTasks,
  processAndCreateTask,
  createAdvanceTask,
  createTaskWithPriority,
  createTaskWithDate,
  createTaskAnyDay,
  trace,
} from "../utils/taskCreationPipeline";

// Base44 timestamps come back without a timezone marker but are UTC. Parsed
// as-is the browser reads them as local time, hours off.
const utcMs = (iso) => {
  const s = String(iso || '');
  return new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
};

// A resumed capture was interrupted somewhere inside one of its parts. If that
// part's task was already saved before the app closed, it must not be made a
// second time. Every task the pipeline creates stores the exact text it came
// from, so that is what gets checked.
async function alreadyCreated(text, sinceMs) {
  try {
    const rows = await base44.entities.Task.filter({ original_input: text }, '-created_date', 5);
    return (rows || []).some((t) => utcMs(t.created_date) >= sinceMs - 60 * 1000);
  } catch (e) {
    return false;
  }
}

// Lives in the app Layout so task parsing keeps running after the user leaves
// the Add Task screen. Drains the pending-capture queue and asks the user for
// the few things the AI can't infer (priority, date, advance reminder).
//
// The queue is mirrored to storage, so a capture the app was closed on is
// finished the next time this account opens the app instead of being lost.
export default function TaskCaptureProcessor({ userEmail }) {
  const runningRef = useRef(false);
  const emailRef = useRef(null);

  const resolveRef = useRef(null);
  const [ask, setAsk] = useState(null); // { type, data }

  const requestInput = (type, data) =>
    new Promise((resolve) => {
      resolveRef.current = resolve;
      setAsk({ type, data });
    });

  const answer = (value) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setAsk(null);
    if (resolve) resolve(value);
  };

  useEffect(() => {
    const drain = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        let capture;
        while ((capture = claimNextCapture())) {
          try {
            trace('captureClaimed', { text: capture.text.slice(0, 200), resumed: !!capture.resumed });
            if (capture.resumed) {
              toast('Finishing a task you added earlier', { description: capture.text.slice(0, 80) });
            }
            // A resumed capture keeps the split it already had — asking the AI
            // again could split it differently and redo finished parts.
            let taskList = capture.parts;
            if (!taskList) {
              taskList = await detectMultipleTasks(capture.text);
              saveCaptureProgress(capture.id, { parts: taskList, doneCount: 0 });
            }
            trace('splitResult', { count: taskList.length, tasks: taskList.map(t => t.slice(0, 60)) });
            const firstPart = capture.doneCount || 0;
            for (let part = firstPart; part < taskList.length; part++) {
              const text = taskList[part];
              if (capture.resumed && part === firstPart && await alreadyCreated(text, capture.createdAt)) {
                trace('captureAlreadyCreated', { text: text.slice(0, 60) });
                saveCaptureProgress(capture.id, { doneCount: part + 1 });
                continue;
              }
              const result = await processAndCreateTask(text, {
                presetDate: capture.presetDate,
                presetDueDateISO: capture.presetDueDateISO,
              });

              if (result.status === 'needs_priority') {
                const priority = await requestInput('priority', result.data);
                if (priority) await createTaskWithPriority(result.data, priority);
              } else if (result.status === 'needs_date') {
                const choice = await requestInput('date', result.data);
                if (choice?.anyDay) {
                  await createTaskAnyDay(result.data);
                } else if (choice?.date) {
                  try {
                    await createTaskWithDate(result.data, choice.date, choice.time);
                  } catch (e) {
                    toast.error(e.message);
                  }
                }
              } else if (result.status === 'needs_advance') {
                const minutes = await requestInput('advance', result.taskData);
                await createAdvanceTask(result.taskData, result.currentUser, minutes ?? 0);
              } else if (result.status === 'error') {
                toast.error('Failed to create task: ' + result.message);
              }
              saveCaptureProgress(capture.id, { doneCount: part + 1 });
            }
          } catch (e) {
            trace('captureFailed', { message: String(e?.message || e) });
            console.error('[CAPTURE] Failed:', e);
            toast.error('Failed to create task: ' + e.message);
          } finally {
            removeCapture(capture.id);
            window.dispatchEvent(new Event('tasks-changed'));
          }
        }
      } finally {
        runningRef.current = false;
      }
    };

    return subscribeCaptures(() => {
      // Tie each new capture to the signed-in account the moment it arrives, so
      // a stored capture is only ever resumed for the account that made it.
      if (emailRef.current) stampCaptureOwner(emailRef.current);
      drain();
    });
  }, []);

  // Once we know who is signed in: claim anything not yet tied to an account,
  // then pick up whatever this account left unfinished last time.
  useEffect(() => {
    emailRef.current = userEmail || null;
    if (!userEmail) return;
    stampCaptureOwner(userEmail);
    resumeAbandonedCaptures(userEmail);
  }, [userEmail]);

  return (
    <>
      <DatePickerDialog
        isOpen={ask?.type === 'date'}
        onClose={() => answer(null)}
        onSelect={(date, time) => answer({ date, time })}
        onAnyDay={() => answer({ anyDay: true })}
        taskTitle={ask?.type === 'date' ? ask.data.title : undefined}
        initialDate={ask?.type === 'date' ? ask.data.initialDate : undefined}
        initialTime={ask?.type === 'date' ? ask.data.initialTime : undefined}
      />

      <PriorityPickerDialog
        isOpen={ask?.type === 'priority'}
        onClose={() => answer(null)}
        onSelect={(priority) => answer(priority)}
      />

      <Dialog open={ask?.type === 'advance'} onOpenChange={(open) => { if (!open) answer(0); }}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Would you like an advance reminder?</DialogTitle>
            {ask?.type === 'advance' && ask.data?.title && (
              <p className="text-sm font-medium text-gray-700 pt-1">📌 {ask.data.title}</p>
            )}
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-gray-600">Get notified before the task is due:</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => answer(30)} variant="outline" className="h-auto py-3 flex flex-col">
                <span className="font-semibold">30 minutes</span>
                <span className="text-xs text-gray-500">before</span>
              </Button>
              <Button onClick={() => answer(60)} variant="outline" className="h-auto py-3 flex flex-col">
                <span className="font-semibold">1 hour</span>
                <span className="text-xs text-gray-500">before</span>
              </Button>
              <Button onClick={() => answer(1440)} variant="outline" className="h-auto py-3 flex flex-col">
                <span className="font-semibold">1 day</span>
                <span className="text-xs text-gray-500">before</span>
              </Button>
              <Button onClick={() => answer(0)} variant="outline" className="h-auto py-3 flex flex-col">
                <span className="font-semibold">No thanks</span>
                <span className="text-xs text-gray-500">just on time</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}