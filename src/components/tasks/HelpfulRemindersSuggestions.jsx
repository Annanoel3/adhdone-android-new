
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, X } from "lucide-react";
import { Task } from "@/entities/Task";
import { Badge } from "@/components/ui/badge";

export default function HelpfulRemindersSuggestions({ theme, onTaskCreated }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [addedSuggestions, setAddedSuggestions] = useState([]);

  const specialMode = localStorage.getItem('special_mode') || 'normal';

  const suggestions = [
    {
      title: "Drink water",
      interval: "1hour",
      count: 8,
      urgency: "low",
      energy: "low",
      icon: "💧"
    },
    {
      title: "Take medication",
      interval: "daily",
      count: 0,
      urgency: "high",
      energy: "low",
      icon: "💊"
    },
    {
      title: "Stretch break",
      interval: "2hours",
      count: 4,
      urgency: "low",
      energy: "low",
      icon: "🧘"
    },
    {
      title: "Check emails",
      interval: "2hours",
      count: 3,
      urgency: "medium",
      energy: "medium",
      icon: "📧"
    },
    {
      title: "Weekly house cleaning",
      interval: "daily",
      count: 1,
      urgency: "medium",
      energy: "high",
      icon: "🧹"
    },
    {
      title: "Call a friend",
      interval: "daily",
      count: 1,
      urgency: "low",
      energy: "medium",
      icon: "📞"
    },
    {
      title: "Take a walk",
      interval: "daily",
      count: 1,
      urgency: "low",
      energy: "medium",
      icon: "🚶"
    },
    {
      title: "Journal for 5 minutes",
      interval: "daily",
      count: 1,
      urgency: "low",
      energy: "low",
      icon: "📝"
    }
  ];

  const handleAddSuggestion = async (suggestion) => {
    await Task.create({
      title: suggestion.title,
      reminder_interval: suggestion.interval,
      reminder_count: suggestion.count,
      urgency: suggestion.urgency,
      energy_required: suggestion.energy,
      status: 'active',
      steps: [],
      total_steps: 0,
      completed_steps: 0
    });

    setAddedSuggestions([...addedSuggestions, suggestion.title]);
    if (onTaskCreated) onTaskCreated();
  };

  const availableSuggestions = suggestions.filter(
    s => !addedSuggestions.includes(s.title)
  );

  if (!isExpanded) {
    return (
      <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md cursor-pointer ${
        specialMode === 'normal' ? (
          theme === 'minimalist' 
            ? 'bg-gradient-to-r from-blue-50 to-purple-50' 
            : 'bg-gradient-to-r from-purple-100 via-pink-100 to-orange-100'
        ) : ''
      }`} onClick={() => setIsExpanded(true)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${
                theme === 'minimalist' ? 'bg-purple-100' : 'bg-white/70'
              }`}>
                <Sparkles className={`w-5 h-5 ${
                  theme === 'minimalist' ? 'text-purple-600' : 'text-purple-700'
                }`} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Helpful Reminders</h3>
                <p className="text-sm text-gray-600">
                  Quick setup for daily habits
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {availableSuggestions.length} ideas
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg ${
      specialMode === 'normal' ? (
        theme === 'minimalist' 
          ? 'bg-gradient-to-br from-blue-50 to-purple-50' 
          : 'bg-gradient-to-br from-purple-100 via-pink-100 to-orange-100'
      ) : ''
    }`}>
      <CardHeader className={`border-b ${specialMode !== 'normal' ? 'border-white/30' : 'border-white/50'}`}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Helpful Reminder Ideas
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Quick-add common ADHD-friendly reminders:
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          {availableSuggestions.map((suggestion) => (
            <Card key={suggestion.title} className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-sm ${
              specialMode === 'normal' ? 'bg-white/80' : ''
            }`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{suggestion.icon}</span>
                      <h4 className="font-medium text-gray-900">
                        {suggestion.title}
                      </h4>
                    </div>
                    <p className="text-xs text-gray-600">
                      Every {suggestion.interval.replace('_', ' ')} • {
                        suggestion.count === 0 
                          ? 'Until done' 
                          : `${suggestion.count}x`
                      }
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddSuggestion(suggestion)}
                    className={theme === 'minimalist' 
                      ? 'bg-purple-600 hover:bg-purple-700' 
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                    }
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
