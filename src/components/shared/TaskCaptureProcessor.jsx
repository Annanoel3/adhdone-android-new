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
  keepEarliest,
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
// So when the app goes off screen, whatever a capture hasn't made yet is
// handed to the server (captureText, the path the share sheet and the pinned
// notification use), which makes it with the app closed. The app's own id
// goes with it as capture_id: captureText makes a capture once however many
// times it is sent. Phones with the newer build hand it to their own
// background sender (ShareBridge.handOffCapture: kept on the phone and
// retried until it lands, even with no signal); older ones send it straight
// from here, best effort, and finish it the same way when the app is back.
// A capture not split yet goes over whole. One already split goes over part
// by part — every part not made yet, each as its own capture (partId), the
// one in progress included: it is either still with the parser (nothing
// saved yet; the save is stopped, and a save already on its way carries the
// same id, so the server sees it) or waiting on a question to the person,
// which the server settles for itself. Oct 14 2026, 1:52 AM: four
// appointments typed at once, two made through their "when?" questions, the
// third question left open as the phone was put down — and the last two sat
// unmade until the next open. Not handed over: a Parking Lot idea being
// turned into a task, and a task added under a picked calendar day —
// captureText knows neither.
const canHandOff = (c) => !!c && !!String(c.text || '').trim() && !c.fromIdea && !c.presetDate && !c.presetDueDateISO;
const localZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch (e) { return undefined; }
};
// One part of a split capture, as the server knows it (its capture_id).
const partId = (c, part) => `${c.id}#${part}`;
const handOffPayload = (c) => ({ text: c.text, timezone: localZone(), capture_id: c.id, said_at: c.createdAt || Date.now() });
const partPayload = (c, part) => ({ text: c.parts[part], timezone: localZone(), capture_id: partId(c, part), said_at: c.createdAt || Date.now() });

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
  // Which capture the open question belongs to (a hand-off closes it).
  const askForRef = useRef(null);
  const [ask, setAsk] = useState(null); // { type, data }

  const requestInput = (type, data, captureId = null) =>
    new Promise((resolve) => {
      resolveRef.current = resolve;
      askForRef.current = captureId;
      setAsk({ type, data });
    });

  const answer = (value) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    askForRef.current = null;
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
          // A capture handed over part by part is asked about part by part.
          const finishOnServer = async () => {
            const askServer = async (payload) => {
              const res = await base44.functions.invoke('captureText', payload);
              const d = res?.data || {};
              if (!d.success) throw new Error(d.error || 'Could not finish setting up this task');
              trace('captureServerDone', { id: payload.capture_id, count: d.count || 0, duplicate: !!d.duplicate, kind: d.kind || '' });
              madeTask = true;
              madeTaskId = d.tasks?.[0]?.id || madeTaskId;
              if (d.kind === 'idea') window.dispatchEvent(new Event('parking-lot-changed'));
            };
            const from = Number.isInteger(capture.handedOffFrom) ? capture.handedOffFrom : null;
            if (from === null || !Array.isArray(capture.parts) || !capture.parts.length) {
              await askServer(handOffPayload(capture));
              return;
            }
            for (let i = Math.max(from, capture.doneCount || 0); i < capture.parts.length; i++) {
              await askServer(partPayload(capture, i));
              saveCaptureProgress(capture.id, { doneCount: i + 1 });
            }
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
              // With the server from here on: ask it, make nothing here.
              if (capture.handedOff) {
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
                // Stamped on what it makes (this part's own id), so the server
                // can see it was made if the app goes off screen with the save
                // already on its way.
                captureId: canHandOff(capture) ? partId(capture, part) : null,
                // Handed to the server meanwhile: make nothing here.
                stopIf: () => !!capture.handedOff,
              });
              if (inflightRef.current?.id === capture.id) inflightRef.current.open = false;
              // Handed over before this part was saved: the server has it now,
              // including any question the parser would have asked.
              if (capture.handedOff && result.status !== 'done') {
                await finishOnServer();
                break;
              }
              // A question answered here while the app was going off screen:
              // the server may have made this part too — keep one.
              const settle = async (t) => {
                madeTask = true;
                madeTaskId = t?.id || madeTaskId;
                if (t?.id && capture.handedOff && canHandOff(capture)) madeTaskId = await keepEarliest(partId(capture, part), t.id);
              };

              if (result.status === 'done') {
                madeTask = true;
                madeTaskId = result.taskId || madeTaskId;
              } else if (result.status === 'needs_priority') {
                const priority = await requestInput('priority', result.data, capture.id);
                if (capture.handedOff) { await finishOnServer(); break; } // closed by the hand-off: the server's now
                if (priority) await settle(await createTaskWithPriority(result.data, priority));
              } else if (result.status === 'needs_date') {
                const choice = await requestInput('date', result.data, capture.id);
                if (capture.handedOff) { await finishOnServer(); break; }
                if (choice?.anyDay) {
                  await settle(await createTaskAnyDay(result.data));
                } else if (choice?.date) {
                  try {
                    await settle(await createTaskWithDate(result.data, choice.date, choice.time));
                  } catch (e) {
                    toast({ title: e.message, variant: 'destructive' });
                  }
                }
              } else if (result.status === 'needs_advance') {
                const minutes = await requestInput('advance', result.taskData, capture.id);
                if (capture.handedOff) { await finishOnServer(); break; }
                await settle(await createAdvanceTask(result.taskData, result.currentUser, minutes ?? 0));
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

    // Off screen: everything not made yet goes to the server (see canHandOff).
    // A capture not split yet goes over whole (only while its words are still
    // with the sorter). One already split goes over from the part it is on,
    // each part its own capture — and the question that part may be waiting
    // on is closed, since the server settles it.
    const handOff = () => {
      const bridge = window.Capacitor?.Plugins?.ShareBridge;
      const viaPhone = typeof bridge?.handOffCapture === 'function';
      const send = (id, text, createdAt) => {
        const payload = { text, timezone: localZone(), capture_id: id, said_at: createdAt };
        if (viaPhone) {
          bridge.handOffCapture({ id, text, createdAt })
            .catch(() => base44.functions.invoke('captureText', payload).catch(() => {}));
        } else {
          base44.functions.invoke('captureText', payload).catch(() => {});
        }
      };
      const handed = [];
      for (const c of currentCaptures()) {
        if (c.held || c.handedOff || !canHandOff(c) || !c.ownerEmail) continue;
        const said = c.createdAt || Date.now();
        if (Array.isArray(c.parts) && c.parts.length) {
          const from = c.doneCount || 0;
          if (from >= c.parts.length) continue; // every part made; the app is just wrapping up
          markCaptureHandedOff(c.id, from);
          for (let i = from; i < c.parts.length; i++) send(partId(c, i), c.parts[i], said);
          trace('captureHandedOff', { id: c.id, from, parts: c.parts.length });
        } else {
          if (c.started && !(inflightRef.current?.id === c.id && inflightRef.current.open)) continue;
          markCaptureHandedOff(c.id);
          send(c.id, c.text, said);
          trace('captureHandedOff', { id: c.id, whole: true });
        }
        handed.push(c.id);
      }
      // The open question belongs to a capture the server now has: close it.
      // The loop sees the hand-off and asks the server for the result.
      if (resolveRef.current && askForRef.current && handed.includes(askForRef.current)) answer(null);
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