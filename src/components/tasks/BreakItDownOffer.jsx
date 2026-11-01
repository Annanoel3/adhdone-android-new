import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import TaskDecompositionModal from './TaskDecompositionModal';
import { trackFire } from '@/lib/appTrack';

// "Break it into steps", right on the collapsed card, for a task the parser
// judged to be a several-steps job (worth_breaking_down: plan a trip, do the
// taxes, clean out the garage — never a call, a bill or the dishes). Anna, Nov
// 1 2026: "no one breaks down the tasks because it's kind of hidden" — it
// lived only inside the opened card and Task Details, and since Sep 1 nobody
// but her had used it. Not a popup: a line on the card, so it never stacks
// with anything. Shown until it's tapped or hidden with its ×, once per task
// (breakdown_offer_dismissed); the same button stays inside the opened card.
// AppEvent breakdown_offer (props.action: open | hide) counts how it's used.
export default function BreakItDownOffer({ task, theme, subtaskCount = 0, onRefreshTasks }) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);

  if (!task?.worth_breaking_down || task.breakdown_offer_dismissed) return null;
  if (task.status !== 'active' || task.parent_task_id || task.silenced) return null;
  if (task.classification === 'event' || task.classification === 'birthday' || task.birthday_person) return null;
  // Steps already there (typed, said, or from an earlier break-down): nothing to offer.
  if (subtaskCount > 0) return null;

  const dark = theme === 'dark';

  const settle = (action) => {
    trackFire('breakdown_offer', { props: { action, task_id: task.id } });
    base44.entities.Task.update(task.id, { breakdown_offer_dismissed: true }).catch(() => {});
  };

  return (
    <>
      {!gone && (
        <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => { setOpen(true); setGone(true); settle('open'); }}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              dark
                ? 'border-purple-700 bg-purple-900/30 text-purple-300 hover:bg-purple-900/50'
                : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            Looks like a few steps. Break it down?
          </button>
          <button
            type="button"
            onClick={() => { setGone(true); settle('hide'); }}
            className={`p-1 rounded-full transition-colors ${dark ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
            aria-label="Hide this suggestion"
            title="Hide this suggestion"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <TaskDecompositionModal
        task={task}
        isOpen={open}
        onClose={() => setOpen(false)}
        onUpdate={() => {
          if (onRefreshTasks) onRefreshTasks();
          window.dispatchEvent(new Event('tasks-changed'));
        }}
        theme={theme}
      />
    </>
  );
}
