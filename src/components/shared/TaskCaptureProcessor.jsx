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
import { subscribeCaptures, claimNextCapture, removeCapture } from "@/lib/pendingCaptures";
import {
  detectMultipleTasks,
  processAndCreateTask,
  createAdvanceTask,
  createTaskWithPriority,
  createTaskWithDate,
  createTaskAnyDay,
  trace,
} from "../utils/taskCreationPipeline";

// Lives in the app Layout so task parsing keeps running after the user leaves
// the Add Task screen. Drains the pending-capture queue and asks the user for
// the few things the AI can't infer (priority, date, advance reminder).
export default function TaskCaptureProcessor() {
  const runningRef = useRef(false);
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
            trace('captureClaimed', { text: capture.text.slice(0, 200) });
            const taskList = await detectMultipleTasks(capture.text);
            trace('splitResult', { count: taskList.length, tasks: taskList.map(t => t.slice(0, 60)) });
            for (const text of taskList) {
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

    return subscribeCaptures(() => { drain(); });
  }, []);

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