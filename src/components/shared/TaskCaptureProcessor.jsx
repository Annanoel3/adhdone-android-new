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
  currentCaptures,
  markCaptureHandedOff,
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

// Android stops the app's work once it is off screen (another app opened, the
// phone locked), so a task typed a moment before used to wait, unmade, until
// the app was opened again. Oct 13 2026: "call propane 530-477-7854 today" was
// sorted, then nothing; the app was most likely left to make that very call.
// So when the app goes off screen before a capture has made anything, the
// capture is handed to the server (captureText, the path the share sheet and
// the pinned notification use), which makes it with the app closed. The
// app's own id goes with it as capture_id: captureText makes a capture once
// however many times it is sent. Phones with the newer build hand it to their
// own background sender (ShareBridge.handOffCapture: kept on the phone and
// retried until it lands, even with no signal); older ones send it straight
// from here, best effort, and finish it the same way when the app is back.
// Not handed over: a Parking Lot idea being turned into a task, and a task
// added under a picked calendar day — captureText knows neither — and a
// capture already waiting on a question to the person, which they'll answer.
const canHandOff = (c) => !!c && !!String(c.text || '').trim() && !c.fromIdea && !c.presetDate && !c.presetDueDateISO;
const localZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch (e) { return undefined; }
};
const handOffPayload = (c) => ({ text: c.text, timezone: localZone(), capture_id: c.id, said_at: c.createdAt || Date.now() });

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
  // The capture being worked on, and whether it can still be handed to the
  // server: true until the part it is on comes back from the parser (made, or
  // waiting on a question).
  const inflightRef = useRef(null);

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
          inflightRef.current = { id: capture.id, open: (capture.doneCount || 0) === 0 && canHandOff(capture) };
          // Handed to the server (see canHandOff): ask it for the result — the
          // same call again, which makes the task if it isn't made yet and
          // otherwise just says what was made. The app never makes it itself.
          const finishOnServer = async () => {
            const res = await base44.functions.invoke('captureText', handOffPayload(capture));
            const d = res?.data || {};
            if (!d.success) throw new Error(d.error || 'Could not finish setting up this task');
            trace('captureServerDone', { id: capture.id, count: d.count || 0, duplicate: !!d.duplicate, kind: d.kind || '' });
            madeTask = true;
            madeTaskId = d.tasks?.[0]?.id || madeTaskId;
            if (d.kind === 'idea') window.dispatchEvent(new Event('parking-lot-changed'));
          };
          try {
            trace('captureClaimed', { id: capture.id, text: capture.text.slice(0, 200), resumed: !!capture.resumed });
            if (capture.handedOff) {
              await finishOnServer();
              continue;
            }
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
              if (capture.handedOff && !madeTask) {
                await finishOnServer();
                break;
              }
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
                // Stamped on what it makes, so the server can see it was made
                // if the app goes off screen with the save already on its way.
                captureId: canHandOff(capture) ? capture.id : null,
                // Handed to the server meanwhile: make nothing here.
                stopIf: () => !!capture.handedOff && !madeTask,
              });
              if (inflightRef.current?.id === capture.id) inflightRef.current.open = false;
              // Handed over before this part was saved: the server has it now,
              // including any question the parser would have asked.
              if (capture.handedOff && !madeTask && result.status !== 'done') {
                await finishOnServer();
                break;
              }

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
            if (inflightRef.current?.id === capture.id) inflightRef.current = null;
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

    // Off screen: every capture that hasn't made anything yet goes to the
    // server (see canHandOff). The one being worked on only while its part is
    // still with the parser; one not started yet always.
    const handOff = () => {
      const bridge = window.Capacitor?.Plugins?.ShareBridge;
      const viaPhone = typeof bridge?.handOffCapture === 'function';
      for (const c of currentCaptures()) {
        if (c.held || c.handedOff || !canHandOff(c) || (c.doneCount || 0) > 0) continue;
        if (c.started && !(inflightRef.current?.id === c.id && inflightRef.current.open)) continue;
        if (!c.ownerEmail) continue;
        markCaptureHandedOff(c.id);
        const payload = handOffPayload(c);
        if (viaPhone) {
          bridge.handOffCapture({ id: c.id, text: c.text, createdAt: payload.said_at })
            .catch(() => base44.functions.invoke('captureText', payload).catch(() => {}));
        } else {
          base44.functions.invoke('captureText', payload).catch(() => {});
        }
      }
    };

    // A capture waiting for the app to be back on screen, or back online, is
    // picked up the moment that happens.
    const onVisible = () => {
      if (document.visibilityState === 'visible') drain();
      else if (document.visibilityState === 'hidden') handOff();
    };
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