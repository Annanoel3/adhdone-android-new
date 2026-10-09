import React, { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/use-toast";
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
  releaseCapture,
  stampCaptureOwner,
  saveCaptureProgress,
  resumeAbandonedCaptures,
} from "@/lib/pendingCaptures";
import {
  classifyCapture,
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

// A Parking Lot idea turned into a task: the idea's pictures and notes go onto
// the new task. If no task got made (the parse failed, or a question it asked
// was closed without an answer) the idea goes back in the Parking Lot instead
// of vanishing.
async function finishIdeaConversion(idea, madeTask, taskId) {
  try {
    if (!madeTask) {
      await base44.entities.ParkingLotIdea.update(idea.id, { converted_to_task: false });
      window.dispatchEvent(new Event('parking-lot-changed'));
      return;
    }
    const pictures = Array.isArray(idea.pictures) ? idea.pictures.filter(Boolean) : [];
    const notes = String(idea.notes || '').trim();
    if (taskId && (pictures.length || notes)) {
      await base44.entities.Task.update(taskId, {
        ...(pictures.length ? { pictures } : {}),
        ...(notes ? { notes } : {}),
      });
    }
  } catch (e) {
    console.error('[CAPTURE] Finishing the Parking Lot conversion failed:', e);
  }
}

// An attempt that fails while the app is on screen and online is tried again
// after these pauses; after the last one the capture is given up on (with a
// toast saying so). A failure while the app is off screen or offline is not
// counted at all — Android cuts a background app's requests, so the attempt
// simply waits for the app to be back.
const RETRY_PAUSES_MS = [3000, 10000, 30000];

// Lives in the app Layout so task parsing keeps running after the user leaves
// the Add Task screen. Drains the pending-capture queue and asks the user for
// the few things the AI can't infer (priority, date, advance reminder).
//
// The queue is mirrored to storage, so a capture the app was closed on is
// finished the next time this account opens the app instead of being lost.
export default function TaskCaptureProcessor({ userEmail }) {
  const runningRef = useRef(false);
  const emailRef = useRef(null);
  const drainRef = useRef(() => {});

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
          // A Parking Lot idea being turned into a task: which task it became.
          let madeTask = false;
          let madeTaskId = null;
          // Set when this attempt didn't finish; the capture is then kept for
          // another go instead of being dropped.
          let failure = null;
          try {
            trace('captureClaimed', { text: capture.text.slice(0, 200), resumed: !!capture.resumed });
            if (capture.resumed) {
              toast({ title: 'Finishing a task you added earlier', description: capture.text.slice(0, 80) });
            }
            // A resumed capture keeps the split it already had — asking the AI
            // again could split it differently and redo finished parts.
            let taskList = capture.parts;
            // What the whole capture turned out to be. 'task': every part is a
            // task. 'mixed': each part is asked on its own. Anything else (an
            // idea, a birthday, something for ADHDone itself) is ONE piece,
            // never split — an idea chopped into errands was how ideas used to
            // turn into piles of tasks.
            let wholeKind = capture.kind;
            if (!taskList) {
              wholeKind = await classifyCapture(capture.text);
              trace('wholeKind', { category: wholeKind.category, why: wholeKind.why });
              if (wholeKind.category === 'mixed') {
                taskList = Array.isArray(wholeKind.parts) && wholeKind.parts.length > 1
                  ? wholeKind.parts
                  : await detectMultipleTasks(capture.text);
              } else if (wholeKind.category === 'task') {
                taskList = await detectMultipleTasks(capture.text);
              } else {
                taskList = [capture.text];
              }
              saveCaptureProgress(capture.id, { parts: taskList, doneCount: 0, kind: wholeKind });
            }
            trace('splitResult', { count: taskList.length, tasks: taskList.map(t => t.slice(0, 60)) });
            // A mixed capture that couldn't be pulled apart is sorted as one piece.
            const partKind = wholeKind && (wholeKind.category !== 'mixed' || taskList.length === 1) ? wholeKind : null;
            const firstPart = capture.doneCount || 0;
            for (let part = firstPart; part < taskList.length; part++) {
              const text = taskList[part];
              if ((capture.resumed || capture.retrying) && part === firstPart && await alreadyCreated(text, capture.createdAt)) {
                trace('captureAlreadyCreated', { text: text.slice(0, 60) });
                madeTask = true;
                saveCaptureProgress(capture.id, { doneCount: part + 1 });
                continue;
              }
              const result = await processAndCreateTask(text, {
                presetDate: capture.presetDate,
                presetDueDateISO: capture.presetDueDateISO,
                skipIdeaCheck: !!capture.fromIdea,
                kind: partKind,
                // Date words count from when this was typed, however late it runs.
                saidAt: capture.createdAt || null,
              });

              if (result.status === 'done') {
                madeTask = true;
                madeTaskId = result.taskId || madeTaskId;
              } else if (result.status === 'needs_priority') {
                const priority = await requestInput('priority', result.data);
                if (priority) {
                  const t = await createTaskWithPriority(result.data, priority);
                  madeTask = true;
                  madeTaskId = t?.id || madeTaskId;
                }
              } else if (result.status === 'needs_date') {
                const choice = await requestInput('date', result.data);
                if (choice?.anyDay) {
                  const t = await createTaskAnyDay(result.data);
                  madeTask = true;
                  madeTaskId = t?.id || madeTaskId;
                } else if (choice?.date) {
                  try {
                    const t = await createTaskWithDate(result.data, choice.date, choice.time);
                    madeTask = true;
                    madeTaskId = t?.id || madeTaskId;
                  } catch (e) {
                    toast({ title: e.message, variant: 'destructive' });
                  }
                }
              } else if (result.status === 'needs_advance') {
                const minutes = await requestInput('advance', result.taskData);
                const t = await createAdvanceTask(result.taskData, result.currentUser, minutes ?? 0);
                madeTask = true;
                madeTaskId = t?.id || madeTaskId;
              } else if (result.status === 'error') {
                // Same handling as a thrown error: kept and tried again.
                throw new Error(result.message || 'Could not set up the task');
              }
              saveCaptureProgress(capture.id, { doneCount: part + 1 });
            }
          } catch (e) {
            failure = e;
            trace('captureFailed', { message: String(e?.message || e) });
            console.error('[CAPTURE] Failed:', e);
          } finally {
            let keep = false;
            if (failure) {
              const hidden = document.visibilityState === 'hidden';
              const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
              const attempts = capture.attempts || 0;
              if (hidden || offline) {
                // Not this attempt's fault: wait for the app to be back on
                // screen / back online, then go again (drain runs on both).
                releaseCapture(capture.id, { afterVisible: true, counted: false, error: failure.message });
                trace('captureWaiting', { hidden, offline, attempts });
                keep = true;
              } else if (attempts < RETRY_PAUSES_MS.length) {
                const pause = RETRY_PAUSES_MS[attempts];
                releaseCapture(capture.id, { retryInMs: pause, error: failure.message });
                trace('captureRetry', { attempt: attempts + 1, pause });
                setTimeout(() => drainRef.current(), pause + 100);
                keep = true;
              } else {
                toast({ title: "Couldn't set up this task: " + capture.text.slice(0, 60), description: 'Please add it again. ' + (failure.message || ''), variant: 'destructive' });
              }
            }
            if (!keep) {
              if (capture.fromIdea?.id) await finishIdeaConversion(capture.fromIdea, madeTask, madeTaskId);
              removeCapture(capture.id);
              window.dispatchEvent(new Event('tasks-changed'));
            }
          }
        }
      } finally {
        runningRef.current = false;
      }
    };
    drainRef.current = drain;

    // A capture waiting for the app to be back on screen, or back online, is
    // picked up the moment that happens.
    const onVisible = () => { if (document.visibilityState === 'visible') drain(); };
    const onOnline = () => drain();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    const unsubscribe = subscribeCaptures(() => {
      // Tie each new capture to the signed-in account the moment it arrives, so
      // a stored capture is only ever resumed for the account that made it.
      if (emailRef.current) stampCaptureOwner(emailRef.current);
      drain();
    });
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
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