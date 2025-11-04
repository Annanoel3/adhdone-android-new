import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mic, Keyboard, Plus, Trash2, Clock, Zap, Sparkles } from "lucide-react";
import VoiceTaskInput from "../tasks/VoiceTaskInput";
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

export default function TaskBatchEntry({ tasks, setTasks, theme, handleDeleteTask }) {
  const [inputMode, setInputMode] = useState('voice');
  const [textInput, setTextInput] = useState('');
  const [editingTask, setEditingTask] = useState(null);

  const handleVoiceTranscription = (transcription) => {
    if (!transcription.trim()) return;

    const newTask = {
      id: `temp-${Date.now()}`,
      title: transcription,
      description: '',
      reminder_interval: '2hours',
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
      reminder_interval: '2hours',
      urgency: 'medium',
      energy_required: 'medium'
    };

    setTasks(prev => [...prev, newTask]);
    setTextInput('');
  };

  const handleTaskUpdate = (taskId, updates) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
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
    <div className="space-y-6">
      <Card className={`border-none shadow-xl overflow-hidden ${
        theme === 'dark' 
          ? 'bg-gray-800 border-gray-700' 
          : theme === 'minimalist'
            ? 'bg-white'
            : 'bg-gradient-to-br from-purple-50 via-white to-orange-50'
      }`}>
        <CardContent className="p-8">
          <div className="flex gap-3 mb-6">
            <Button
              variant={inputMode === 'voice' ? 'default' : 'outline'}
              onClick={() => setInputMode('voice')}
              className={`flex-1 h-12 text-base ${
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
              variant={inputMode === 'text' ? 'default' : 'outline'}
              onClick={() => setInputMode('text')}
              className={`flex-1 h-12 text-base ${
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

          {inputMode === 'voice' ? (
            <div className="flex flex-col items-center gap-6 py-12">
              <div className={`p-4 rounded-2xl ${
                theme === 'minimalist' 
                  ? 'bg-green-100' 
                  : theme === 'dark'
                    ? 'bg-purple-900/30'
                    : 'bg-gradient-to-br from-purple-100 to-orange-100'
              }`}>
                <Sparkles className={`w-12 h-12 ${
                  theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                }`} />
              </div>
              <div className="text-center space-y-2">
                <h3 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Speak Your Tasks
                </h3>
                <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                  Tap the mic and let it flow - say them one at a time or all at once
                </p>
              </div>
              <VoiceTaskInput
                onTranscription={handleVoiceTranscription}
                theme={theme}
                inline={false}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleTextSubmit} className="flex gap-3">
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type a task and press Enter..."
                  className="flex-1 h-12 text-base"
                  autoFocus
                />
                <Button type="submit" size="lg" className="px-6">
                  <Plus className="w-5 h-5" />
                </Button>
              </form>
              <p className={`text-sm text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                Press Enter to add each task
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card
              key={task.id}
              className={`border shadow-md hover:shadow-xl transition-all cursor-pointer ${
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
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                      }`}>
                        <Zap className="w-3 h-3 inline mr-1" />
                        {task.energy_required} energy
                      </span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                      }`}>
                        <Clock className="w-3 h-3 inline mr-1" />
                        {task.reminder_interval === '10min' ? 'Every 10 min' :
                         task.reminder_interval === '20min' ? 'Every 20 min' :
                         task.reminder_interval === '30min' ? 'Every 30 min' :
                         task.reminder_interval === '1hour' ? 'Every hour' :
                         task.reminder_interval === '2hours' ? 'Every 2 hours' :
                         task.reminder_interval === 'daily' ? 'Daily' :
                         task.reminder_interval === 'every_other_day' ? 'Every other day' :
                         'Once'}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTask(task.id);
                    }}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editingTask && (
        <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Configure Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className={`text-sm font-medium mb-2 block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                  Priority
                </label>
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
                <label className={`text-sm font-medium mb-2 block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                  Energy Required
                </label>
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
                <label className={`text-sm font-medium mb-2 block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                  Reminder Interval
                </label>
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
                    <SelectItem value="once">Once (no reminders)</SelectItem>
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
  );
}