import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Task } from "@/entities/Task";
import { Save } from "lucide-react";

export default function TaskEditModal({ task, isOpen, onClose, onUpdate, theme }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    urgency: 'medium',
    energy_required: 'medium',
    reminder_interval: ''
  });

  useEffect(() => {
    if (task && isOpen) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        urgency: task.urgency || 'medium',
        energy_required: task.energy_required || 'medium',
        reminder_interval: task.reminder_interval || ''
      });
    }
  }, [task, isOpen]);

  const handleSave = async () => {
    if (!task) return;
    
    // Cancel any pending OneSignal notifications before updating reminder settings
    if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
      try {
        const { base44 } = await import('@/api/base44Client');
        await base44.functions.invoke('cancelTaskNotifications', { taskId: task.id });
        console.log('Cancelled pending notifications for task:', task.id);
      } catch (error) {
        console.error('Error canceling notifications:', error);
      }
    }
    
    await Task.update(task.id, formData);
    onUpdate();
    onClose();
  };

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={theme === 'dark' ? 'text-white' : ''}>Edit Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Task Title</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder="What needs to be done?"
              className={theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : ''}
            />
          </div>

          <div>
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Description (Optional)</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Add more details..."
              className={theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : ''}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Priority</Label>
              <Select
                value={formData.urgency}
                onValueChange={(value) => setFormData({...formData, urgency: value})}
              >
                <SelectTrigger className={theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : ''}>
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
              <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Energy Required</Label>
              <Select
                value={formData.energy_required}
                onValueChange={(value) => setFormData({...formData, energy_required: value})}
              >
                <SelectTrigger className={theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Reminder (Optional)</Label>
            <Select
              value={formData.reminder_interval}
              onValueChange={(value) => setFormData({...formData, reminder_interval: value})}
            >
              <SelectTrigger className={theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : ''}>
                <SelectValue placeholder="No reminder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>No reminder</SelectItem>
                <SelectItem value="10min">Every 10 minutes</SelectItem>
                <SelectItem value="20min">Every 20 minutes</SelectItem>
                <SelectItem value="30min">Every 30 minutes</SelectItem>
                <SelectItem value="1hour">Every hour</SelectItem>
                <SelectItem value="2hours">Every 2 hours</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="every_other_day">Every other day</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!formData.title.trim()}
            className={theme === 'minimalist'
              ? 'bg-green-600 hover:bg-green-700'
              : theme === 'dark'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
            }
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}