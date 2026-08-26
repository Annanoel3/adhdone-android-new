import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Plus } from "lucide-react";
import { Task } from "@/entities/Task";
import { base44 } from "@/api/base44Client";
import { Checkbox } from "@/components/ui/checkbox";

export default function TaskDecompositionModal({ task, isOpen, onClose, onUpdate, theme }) {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState([]);

  React.useEffect(() => {
    if (isOpen && task) {
      generateSuggestions();
    }
  }, [isOpen, task]);

  const generateSuggestions = async () => {
    setIsLoading(true);
    setSuggestions([]);
    setSelectedSuggestions([]);

    try {
      const prompt = `You are an ADHD productivity expert. A user has this task: "${task.title}"${task.description ? `\n\nContext: ${task.description}` : ''}

STEP 1 — DECIDE WHAT KIND OF TASK THIS IS. This determines everything:

(A) AMORPHOUS / UNFAMILIAR — the user doesn't know where to begin, or the task is a project with real
    decisions in it ("write blog post", "plan vacation", "do my taxes", "find a new apartment").
    The obstacle is STARTING. Break it into small paralysis-breaking entry points — a ridiculously
    easy first action, then increasing commitment. This is where ADHD micro-stepping belongs.

(B) CONCRETE & FAMILIAR — the user already knows exactly how to do this; it's a chore or errand
    ("do laundry", "clean the kitchen", "take the car in", "go grocery shopping").
    The obstacle is NOT knowing how — it's remembering to come back to it. So the ONLY steps that
    belong here are the task's natural HANDOFF POINTS: the moments where you physically stop, walk
    away, wait, or change location/context, and could forget to return.
    Everything between two handoff points is ONE step, no matter how many motions it contains.

HOW TO TEST WHETHER SOMETHING IS ITS OWN STEP:
Ask: "Could I finish this and then genuinely walk away, forget, and need a reminder to continue?"
- Yes → it's a step.
- No (it happens in the same breath as the action next to it) → it is NOT a step; fold it in.
Sorting clothes, adding detergent, and pressing start are all one uninterrupted trip to the washer —
that is ONE step, not three. But the laundry then SITS in the washer while you go do something else,
so moving it to the dryer IS its own step.

WORKED EXAMPLE — "do laundry" (type B):
BAD (motions, not steps — every one of these is a needless notification):
  Sort clothes / Load washer / Add detergent / Start washer / Transfer to dryer / Fold clothes / Put away clothes
GOOD (only the real handoff points, where you actually walk away and could forget):
  Get a load into the washer and start it / Move the load to the dryer / Fold it / Put it away

HOW MANY STEPS: however many the task actually HAS — no target number. Some tasks have 2, some have 6.
If the task is already a single action you'd do in one sitting ("take out the trash", "call the vet"),
return an EMPTY sub_tasks list — do not invent steps for a task that doesn't need them. Padding a list
with fake steps is worse than not breaking it down at all.

STEP 2 — write the steps, following these rules:
1. Are SPECIFIC and CONCRETE (no vague advice like "research" or "plan")
2. Never add prep, planning, gathering, or "get ready to..." steps the user didn't need
3. Never restate the same action in different words as two steps
4. For type A, start with the FIRST physical action (not planning)
5. Use action verbs: "Open", "Write", "Call", "Send", "Create"
6. Address ADHD challenges (decision paralysis, perfectionism, getting started)
7. Order the steps SEQUENTIALLY in the exact order they must actually be performed — the FIRST item in the list is the first action you'd do, the LAST item is the final action. For example, for "do laundry": "wash and dry the laundry" comes BEFORE "put all the laundry away" — never list the put-away step first.

Also suggest:
- **Best reminder interval** for each step (based on step complexity and ADHD patterns)
- **Energy level required** (low/medium/high)

AVOID:
- Vague steps like "gather information" or "make a plan"
- Steps that require multiple actions
- Planning/organizing steps (people with ADHD struggle to start planning)

EXAMPLES:

BAD breakdown for "Write blog post":
1. Research topic
2. Create outline
3. Write draft
4. Edit post

GOOD breakdown for "Write blog post":
1. Open Google Doc and write one terrible sentence (any sentence about the topic)
   - Interval: 30min, Energy: low
   - Why: Gets you started without pressure to be good
2. Expand that sentence into 3 bullet points
   - Interval: 1hour, Energy: low
   - Why: Small expansion, builds momentum
3. Turn each bullet into 2-3 sentences (don't worry about quality)
   - Interval: 2hours, Energy: medium
   - Why: Longer work session once momentum exists
4. Read through and fix obvious typos/awkward parts
   - Interval: daily, Energy: medium
   - Why: Fresh eyes help, not urgent

BAD breakdown for "Plan vacation":
1. Decide on destination
2. Research hotels
3. Book flights
4. Create itinerary

GOOD breakdown for "Plan vacation":
1. Text 3 friends: "Beach or mountains?" (get one reply)
   - Interval: 20min, Energy: low
   - Why: External input helps decision paralysis
2. Open Kayak, type in ONE destination, look at 3 flights (don't book)
   - Interval: 1hour, Energy: low
   - Why: Removes "which destination" paralysis
3. Screenshot your favorite flight, send to travel buddy with "Thoughts?"
   - Interval: 2hours, Energy: low
   - Why: External accountability, not committing yet
4. Click "book" on that flight (just do it, don't overthink)
   - Interval: daily, Energy: medium
   - Why: Push past analysis paralysis

Return JSON with this structure:
{
  "sub_tasks": [
    {
      "title": "Step description",
      "reasoning": "Why this specific step + ADHD insight",
      "reminder_interval": "20min|30min|1hour|2hours|daily",
      "energy_required": "low|medium|high"
    }
  ]
}`;

      const result = await base44.functions.invoke('decomposeTask', { prompt });
      const response = result?.data?.response;

      if (response.sub_tasks && response.sub_tasks.length > 0) {
        setSuggestions(response.sub_tasks);
        setSelectedSuggestions(response.sub_tasks.map((_, i) => i)); // Select all by default
      }
    } catch (error) {
      console.error("Error generating suggestions:", error);
      alert("Failed to generate suggestions. Please try again.");
    }

    setIsLoading(false);
  };

  const toggleSuggestion = (index) => {
    if (selectedSuggestions.includes(index)) {
      setSelectedSuggestions(selectedSuggestions.filter(i => i !== index));
    } else {
      setSelectedSuggestions([...selectedSuggestions, index]);
    }
  };

  const handleCreateSubTasks = async () => {
    if (selectedSuggestions.length === 0) return;

    setIsLoading(true);

    try {
      const tasksToCreate = selectedSuggestions.map(index => {
        const suggestion = suggestions[index];
        return {
          title: suggestion.title,
          parent_task_id: task.id,
          subtask_order: index + 1, // Preserve the LLM's sequential step order
          urgency: task.urgency,
          energy_required: suggestion.energy_required || task.energy_required,
          reminder_interval: suggestion.reminder_interval || task.reminder_interval,
          reminder_count: 0, // Remind until completed
          status: 'active'
        };
      });

      await Task.bulkCreate(tasksToCreate);
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error creating sub-tasks:", error);
      alert("Failed to create sub-tasks. Please try again.");
    }

    setIsLoading(false);
  };

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-2xl max-h-[90vh] overflow-y-auto ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Break Down: {task.title}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {isLoading && suggestions.length === 0 ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                Analyzing your task and creating ADHD-friendly steps...
              </p>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-3">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedSuggestions.includes(index)
                      ? theme === 'minimalist'
                        ? 'border-green-300 bg-green-50'
                        : theme === 'dark'
                          ? 'border-green-700 bg-green-900/20'
                          : 'border-purple-300 bg-purple-50'
                      : theme === 'dark'
                        ? 'border-gray-700 bg-gray-800/50'
                        : 'border-gray-200 bg-white'
                  }`}
                  onClick={() => toggleSuggestion(index)}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedSuggestions.includes(index)}
                      onCheckedChange={() => toggleSuggestion(index)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <h4 className={`font-medium mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                        {index + 1}. {suggestion.title}
                      </h4>
                      <p className={`text-sm mb-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        💡 {suggestion.reasoning}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          theme === 'dark' ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-700'
                        }`}>
                          Remind every {suggestion.reminder_interval?.replace('_', ' ')}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          theme === 'dark' ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {suggestion.energy_required} energy
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateSubTasks}
            disabled={isLoading || selectedSuggestions.length === 0}
            className={theme === 'minimalist' 
              ? 'bg-green-600 hover:bg-green-700' 
              : theme === 'dark'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create {selectedSuggestions.length} Sub-Tasks
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}