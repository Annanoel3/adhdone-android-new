
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, X, Lightbulb, Check, Loader2 } from "lucide-react";
import { Task } from "@/entities/Task";
// The Badge component is no longer used in the updated UI.

export default function HelpfulRemindersSuggestions({ task, theme }) {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]); // This will hold AI-generated suggestions
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [isApplying, setIsApplying] = useState(false);

  // Effect to fetch AI suggestions when task description changes
  useEffect(() => {
    if (task && task.description) {
      fetchAISuggestions(task.description);
    } else {
      setSuggestions([]); // Clear suggestions if no description
      setSelectedSuggestion(null); // Reset selection
    }
  }, [task?.description]); // Dependency on task.description

  const fetchAISuggestions = async (description) => {
    setIsLoading(true);
    setSelectedSuggestion(null); // Reset selection when new description comes in
    try {
      // Simulate an API call to a backend that generates AI suggestions
      // In a real application, this would involve calling a server endpoint
      // which in turn would use an LLM (e.g., OpenAI, Anthropic, etc.)
      const mockSuggestions = await new Promise(resolve => setTimeout(() => {
        // Simple logic to return different suggestions based on keywords in description
        if (description.toLowerCase().includes("exercise") || description.toLowerCase().includes("workout")) {
          resolve([
            { interval_label: "Daily", explanation: "For maintaining physical health and energy.", interval: "daily", count: 1 },
            { interval_label: "3 times a week", explanation: "To build a consistent routine without burnout.", interval: "weekly", count: 3 },
            { interval_label: "Every other day", explanation: "Allows for rest and recovery between sessions.", interval: "2days", count: 1 },
          ]);
        } else if (description.toLowerCase().includes("read") || description.toLowerCase().includes("book")) {
          resolve([
            { interval_label: "Every evening", explanation: "Promotes relaxation and learning before bed.", interval: "daily", count: 1 },
            { interval_label: "Weekly", explanation: "Helps you finish books and learn consistently.", interval: "weekly", count: 1 },
            { interval_label: "Morning, for 15 mins", explanation: "Starts your day with focus and growth.", interval: "daily", count: 1 },
          ]);
        } else if (description.toLowerCase().includes("work") || description.toLowerCase().includes("study")) {
          resolve([
            { interval_label: "Every 2 hours", explanation: "To take short breaks and re-focus, preventing fatigue.", interval: "2hours", count: 4 },
            { interval_label: "Daily, before lunch", explanation: "To check progress on main tasks and plan afternoon.", interval: "daily", count: 1 },
            { interval_label: "Every 45 minutes (Pomodoro)", explanation: "Breaks work into manageable chunks with short breaks.", interval: "45mins", count: 8 },
          ]);
        } else if (description.toLowerCase().includes("medication")) {
          resolve([
            { interval_label: "Morning and Evening", explanation: "Ensures consistent dosage as prescribed.", interval: "daily", count: 2 },
            { interval_label: "Daily, with breakfast", explanation: "Links taking medication to an existing routine.", interval: "daily", count: 1 },
          ]);
        }
        else {
          // Default suggestions or an empty array if no specific keywords match
          resolve([
            { interval_label: "Daily", explanation: "A general reminder for a daily habit.", interval: "daily", count: 1 },
            { interval_label: "Weekly", explanation: "Good for tasks that need less frequent attention.", interval: "weekly", count: 1 },
            { interval_label: "Every few hours", explanation: "For tasks that benefit from regular check-ins.", interval: "3hours", count: 4 },
          ]);
        }
      }, 700)); // Simulate network delay
      setSuggestions(mockSuggestions);
    } catch (error) {
      console.error("Failed to fetch AI suggestions:", error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySuggestion = async () => {
    if (selectedSuggestion === null || !suggestions[selectedSuggestion] || !task || !task.id) {
      return;
    }

    setIsApplying(true);
    const suggestionToApply = suggestions[selectedSuggestion];

    try {
      // Assuming Task entity has an update method to modify an existing task
      // This will update the existing task's reminder properties based on the suggestion
      await Task.update(task.id, {
        reminder_interval: suggestionToApply.interval,
        reminder_count: suggestionToApply.count,
        // If there were other properties like 'urgency' or 'energy_required'
        // that the AI could suggest, they would be updated here.
        // For now, only interval and count are directly applied from the suggestion.
      });
      // Optionally, call a callback prop like `onTaskUpdated()` if the parent
      // component needs to re-fetch or re-render the task.
      // Since no such prop is provided in the outline, we assume the parent
      // will handle task state updates or that the update is implicitly reflected.
    } catch (error) {
      console.error("Failed to apply suggestion to task:", error);
    } finally {
      setIsApplying(false);
      // After applying, you might want to give user feedback, e.g., a toast notification,
      // or clear the suggestions/selection.
      // For now, we leave the selected suggestion visible.
    }
  };

  if (!task || !task.description) {
    // If no task or description, render a message instead of the full card.
    // This could also be an empty return, or a simplified prompt to add a description.
    return null;
  }

  return (
    <Card className={`mt-4 border-none shadow-sm ${
      theme === 'dark' ? 'bg-gray-900/50' : 'bg-blue-50'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-full p-2 flex-shrink-0 ${
            theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-100'
          }`}>
            <Lightbulb className={`w-4 h-4 ${
              theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
            }`} />
          </div>
          <div className="flex-1">
            <h4 className={`font-semibold text-sm mb-2 ${
              theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
            }`}>
              💡 Helpful Reminder Tips
            </h4>
            
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className={`text-sm ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Getting smart suggestions...
                </span>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedSuggestion === index
                        ? theme === 'dark'
                          ? 'bg-blue-900/30 border-blue-700'
                          : 'bg-blue-100 border-blue-300'
                        : theme === 'dark'
                          ? 'bg-gray-800/50 border-gray-700 hover:bg-gray-800'
                          : 'bg-white border-blue-200 hover:bg-blue-50'
                    }`}
                    onClick={() => setSelectedSuggestion(index)}
                  >
                    <p className={`text-sm font-medium mb-1 ${
                      theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                    }`}>
                      {suggestion.interval_label}
                    </p>
                    <p className={`text-xs ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      {suggestion.explanation}
                    </p>
                  </div>
                ))}
                
                <Button
                  onClick={handleApplySuggestion}
                  disabled={selectedSuggestion === null || isApplying}
                  className="w-full mt-2"
                  size="sm"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Apply This Reminder
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <p className={`text-sm ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Add a description to your task to get smart reminder suggestions!
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
