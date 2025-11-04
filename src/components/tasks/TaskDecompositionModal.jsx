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
import { InvokeLLM } from "@/integrations/Core";
import { Task } from "@/entities/Task";
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

Your goal: Break this into 3-5 ACTIONABLE micro-steps that:
1. Are SPECIFIC and CONCRETE (no vague advice like "research" or "plan")
2. Each step takes 5-30 minutes max
3. Start with the FIRST physical action (not planning)
4. Use action verbs: "Open", "Write", "Call", "Send", "Create"
5. Address ADHD challenges (decision paralysis, perfectionism, getting started)

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

      const response = await InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            sub_tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  reasoning: { type: "string" },
                  reminder_interval: { type: "string" },
                  energy_required: { type: "string" }
                }
              }
            }
          }
        }
      });

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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <p className="text-gray-600">
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