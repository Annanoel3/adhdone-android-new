
import React, { useState } from "react";
import { Task } from "@/entities/Task";
import { User } from "@/entities/User";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Mic, Keyboard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import VoiceTaskInput from "../components/tasks/VoiceTaskInput";
import { motion, AnimatePresence } from "framer-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
// Fixed import: scheduleReminder from reminderScheduler
import { scheduleReminder } from "../components/utils/reminderScheduler";

export default function AddTask() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [isSaving, setIsSaving] = useState(false);
  const [inputMode, setInputMode] = useState('voice');
  const [textInput, setTextInput] = useState('');
  const [editingTask, setEditingTask] = useState(null);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleVoiceTranscription = (transcription) => {
    if (!transcription.trim()) return;

    const newTask = {
      id: `temp-${Date.now()}`,
      title: transcription,
      description: '',
      reminder_interval: '2hours', // Default reminder interval
      urgency: 'medium',
      energy_required: 'medium'
    };

    setTasks(prev => [...prev, newTask]);
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    const newTask = {
      id: `temp-${Date.now()}`,
      title: textInput.trim(),
      description: '',
      reminder_interval: '2hours', // Default reminder interval
      urgency: 'medium',
      energy_required: 'medium'
    };

    setTasks(prev => [...prev, newTask]);
    setTextInput('');
  };

  const handleDeleteTask = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const handleTaskUpdate = (taskId, updates) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
  };

  const handleSaveAll = async () => {
    if (tasks.length === 0) return;

    setIsSaving(true);
    try {
      // Fetch current user once for all tasks
      const currentUser = await User.me();
      if (!currentUser || !currentUser.email) {
        throw new Error("User not logged in or email not available for reminders.");
      }

      for (const task of tasks) {
        let nextReminderTime = null;
        const now = new Date();

        // Calculate next reminder time based on interval
        // Only if a reminder interval is set and not 'once' (which means no recurring reminder)
        if (task.reminder_interval && task.reminder_interval !== 'once') {
          nextReminderTime = new Date(now.getTime());
          
          switch (task.reminder_interval) {
            case '10min':
              nextReminderTime.setMinutes(nextReminderTime.getMinutes() + 10);
              break;
            case '20min':
              nextReminderTime.setMinutes(nextReminderTime.getMinutes() + 20);
              break;
            case '30min':
              nextReminderTime.setMinutes(nextReminderTime.getMinutes() + 30);
              break;
            case '1hour':
              nextReminderTime.setHours(nextReminderTime.getHours() + 1);
              break;
            case '2hours':
              nextReminderTime.setHours(nextReminderTime.getHours() + 2);
              break;
            case 'daily':
              nextReminderTime.setDate(nextReminderTime.getDate() + 1);
              break;
            case 'every_other_day':
              nextReminderTime.setDate(nextReminderTime.getDate() + 2);
              break;
            default:
              // If it's 'once' or some other unhandled value, nextReminderTime remains null
              nextReminderTime = null;
              break;
          }
          // The outline included a console log here for setting initial reminder
          if (nextReminderTime) {
            console.log(`🕐 [NEW TASK] Setting initial reminder for ${nextReminderTime.toLocaleString()} (${nextReminderTime.toISOString()})`);
          }
        }
        
        // Create the task in the database
        const createdTask = await Task.create({
          title: task.title,
          description: task.description,
          reminder_interval: task.reminder_interval,
          reminder_count: 0,
          next_reminder: nextReminderTime ? nextReminderTime.toISOString() : null, // Store calculated next reminder
          urgency: task.urgency,
          energy_required: task.energy_required,
          status: 'active'
        });

        // Schedule push notification if a reminder is set and it's not a 'once' type reminder
        if (nextReminderTime && task.reminder_interval !== 'once') {
          try {
            await scheduleReminder({
              email: currentUser.email,
              title: "Task Reminder 📋",
              body: createdTask.title,
              sendAtISO: nextReminderTime.toISOString(),
              taskId: createdTask.id,
              data: {
                screen: "/Tasks",
                taskId: createdTask.id,
                urgency: createdTask.urgency,
                type: 'task_reminder'
              }
            });
            console.log(`✅ [NEW TASK] Scheduled reminder for ${nextReminderTime.toLocaleString()} for task: "${createdTask.title}"`);
          } catch (error) {
            console.error(`Failed to schedule reminder for task "${createdTask.title}":`, error);
          }
        }
      }

      navigate(createPageUrl("Home"), { state: { reload: true } });
    } catch (error) {
      console.error("Error saving tasks:", error);
      alert("Failed to save tasks. Please try again.");
    }
    setIsSaving(false);
  };

  const getUrgencyColor = (urgency) => {
    if (theme === 'dark') {
      return {
        low: 'bg-gray-700 text-gray-300',
        medium: 'bg-blue-700 text-blue-200',
        high: 'bg-amber-700 text-amber-200',
        urgent: 'bg-red-700 text-red-200'
      }[urgency];
    }
    return {
      low: 'bg-gray-100 text-gray-700',
      medium: 'bg-blue-100 text-blue-700',
      high: 'bg-amber-100 text-amber-700',
      urgent: 'bg-red-100 text-red-700'
    }[urgency];
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl("Home"))}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          {tasks.length > 0 && (
            <Button
              onClick={handleSaveAll}
              disabled={isSaving}
              className={
                theme === 'minimalist'
                  ? 'bg-green-600 hover:bg-green-700'
                  : theme === 'dark'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
              }
            >
              {isSaving ? 'Saving...' : `Save ${tasks.length} Task${tasks.length === 1 ? '' : 's'}`}
            </Button>
          )}
        </div>

        <Card className={`border-none shadow-2xl overflow-hidden ${
          theme === 'dark'
            ? 'bg-gray-800'
            : theme === 'minimalist'
              ? 'bg-white'
              : 'bg-gradient-to-br from-purple-50 via-white to-orange-50'
        }`}>
          <CardContent className="p-8 md:p-12">
            <div className="flex justify-center gap-3 mb-8">
              <Button
                variant={inputMode === 'voice' ? 'default' : 'ghost'}
                onClick={() => setInputMode('voice')}
                className={`px-6 h-12 ${
                  inputMode === 'voice' && theme === 'minimalist'
                    ? 'bg-green-600 hover:bg-green-700'
                    : inputMode === 'voice' && theme !== 'dark'
                      ? 'bg-gradient-to-r from-purple-600 to-orange-600'
                      : ''
                }`}
              >
                <Mic className="w-5 h-5 mr-2" />
                Voice
              </Button>
              <Button
                variant={inputMode === 'text' ? 'default' : 'ghost'}
                onClick={() => setInputMode('text')}
                className={`px-6 h-12 ${
                  inputMode === 'text' && theme === 'minimalist'
                    ? 'bg-green-600 hover:bg-green-700'
                    : inputMode === 'text' && theme !== 'dark'
                      ? 'bg-gradient-to-r from-purple-600 to-orange-600'
                      : ''
                }`}
              >
                <Keyboard className="w-5 h-5 mr-2" />
                Type
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {inputMode === 'voice' ? (
                <motion.div
                  key="voice"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col items-center gap-8 py-12"
                >
                  <div className={`p-6 rounded-3xl ${
                    theme === 'minimalist'
                      ? 'bg-green-100'
                      : theme === 'dark'
                        ? 'bg-purple-900/30'
                        : 'bg-gradient-to-br from-purple-100 to-orange-100'
                  }`}>
                    <Sparkles className={`w-16 h-16 ${
                      theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                    }`} />
                  </div>
                  <div className="text-center space-y-3 max-w-md">
                    <h2 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Ready to capture your tasks?
                    </h2>
                    <p className={`text-lg ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      Tap the mic and speak - say them one at a time or all at once
                    </p>
                  </div>
                  <VoiceTaskInput
                    onTranscription={handleVoiceTranscription}
                    theme={theme}
                    inline={false}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="text"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6 py-8"
                >
                  <div className="text-center space-y-3 max-w-md mx-auto">
                    <h2 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Type your tasks
                    </h2>
                    <p className={`text-lg ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      Enter each task and press Enter to add
                    </p>
                  </div>
                  <form onSubmit={handleTextSubmit} className="max-w-xl mx-auto">
                    <Input
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="What needs to be done?"
                      className="h-14 text-lg"
                      autoFocus
                    />
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {tasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            {tasks.map((task, index) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className={`border shadow-lg hover:shadow-xl transition-all cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-gray-800 border-gray-700'
                      : theme === 'minimalist'
                        ? 'bg-white hover:border-green-200'
                        : 'bg-gradient-to-r from-purple-50/50 to-orange-50/50 hover:from-purple-100/50 hover:to-orange-100/50'
                  }`}
                  onClick={() => setEditingTask(task)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className={`font-semibold text-lg mb-3 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                          {task.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getUrgencyColor(task.urgency)}`}>
                            {task.urgency}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-sm ${
                            theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {task.energy_required} energy
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTask(task.id);
                        }}
                        className="text-red-500 hover:bg-red-50"
                      >
                        Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {editingTask && (
          <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configure Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Priority</label>
                  <Select
                    value={editingTask.urgency}
                    onValueChange={(value) => handleTaskUpdate(editingTask.id, { urgency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Energy Required</label>
                  <Select
                    value={editingTask.energy_required}
                    onValueChange={(value) => handleTaskUpdate(editingTask.id, { energy_required: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Reminder Interval</label>
                  <Select
                    value={editingTask.reminder_interval}
                    onValueChange={(value) => handleTaskUpdate(editingTask.id, { reminder_interval: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10min">Every 10 minutes</SelectItem>
                      <SelectItem value="20min">Every 20 minutes</SelectItem>
                      <SelectItem value="30min">Every 30 minutes</SelectItem>
                      <SelectItem value="1hour">Every hour</SelectItem>
                      <SelectItem value="2hours">Every 2 hours</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="every_other_day">Every other day</SelectItem>
                      <SelectItem value="once">Once (no recurring reminders)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={() => setEditingTask(null)}
                  className={`w-full ${
                    theme === 'minimalist'
                      ? 'bg-green-600 hover:bg-green-700'
                      : theme === 'dark'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-gradient-to-r from-purple-600 to-orange-600'
                  }`}
                >
                  Done
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
