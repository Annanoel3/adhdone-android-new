
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Battery, BatteryMedium, BatteryLow, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { EnergyLog } from "@/entities/EnergyLog";
import { Task } from "@/entities/Task";
import { InvokeLLM } from "@/integrations/Core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function EnergyCheckInModal({ isOpen, onClose, theme }) {
  const [selectedEnergy, setSelectedEnergy] = useState(null);
  const [moodNote, setMoodNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const energyLevels = [
    {
      level: 'low',
      icon: BatteryLow,
      title: 'Low',
      emoji: '😴',
      color: theme === 'minimalist' ? 'border-red-200 hover:bg-red-50' : theme === 'dark' ? 'border-red-800 hover:bg-red-900/20' : 'border-red-300 hover:bg-red-100'
    },
    {
      level: 'medium',
      icon: BatteryMedium,
      title: 'Medium',
      emoji: '😐',
      color: theme === 'minimalist' ? 'border-amber-200 hover:bg-amber-50' : theme === 'dark' ? 'border-amber-800 hover:bg-amber-900/20' : 'border-amber-300 hover:bg-amber-100'
    },
    {
      level: 'high',
      icon: Battery,
      title: 'High',
      emoji: '⚡',
      color: theme === 'minimalist' ? 'border-green-200 hover:bg-green-50' : theme === 'dark' ? 'border-green-800 hover:bg-green-900/20' : 'border-green-300 hover:bg-green-100'
    }
  ];

  const handleSubmit = async () => {
    if (!selectedEnergy) return;
    
    await EnergyLog.create({
      energy_level: selectedEnergy,
      mood_note: moodNote,
      logged_at: new Date().toISOString()
    });

    setHasSubmitted(true);
    
    // Auto-close after 2 seconds
    setTimeout(() => {
      handleClose();
    }, 2000);
  };

  const handleGetSuggestions = async () => {
    if (!selectedEnergy) return;
    
    setIsLoading(true);
    
    await EnergyLog.create({
      energy_level: selectedEnergy,
      mood_note: moodNote,
      logged_at: new Date().toISOString()
    });

    const tasks = await Task.filter({ status: 'active' });
    
    const prompt = `A user with ADHD has reported their current energy level as "${selectedEnergy}"${moodNote ? ` with this note: "${moodNote}"` : ''}.

    Here are their active tasks:
    ${tasks.map(t => `- ${t.title} (energy required: ${t.energy_required}, urgency: ${t.urgency})`).join('\n')}

    Suggest 2-3 specific tasks that would be perfect to work on right now based on their energy level. Be encouraging, realistic, and specific.`;

    const response = await InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                task_title: { type: "string" },
                reason: { type: "string" }
              }
            }
          },
          encouragement: { type: "string" }
        }
      }
    });

    setSuggestions(response.suggestions || []);
    setHasSubmitted(true);
    setIsLoading(false);
  };

  const handleClose = () => {
    setSelectedEnergy(null);
    setMoodNote("");
    setSuggestions([]);
    setHasSubmitted(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">How's your energy right now?</DialogTitle>
        </DialogHeader>

        {!hasSubmitted ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-3">
              {energyLevels.map((energy) => (
                <Card
                  key={energy.level}
                  className={`cursor-pointer border-2 transition-all ${
                    selectedEnergy === energy.level 
                      ? theme === 'minimalist'
                        ? 'border-green-500 bg-green-50 scale-105'
                        : theme === 'dark'
                          ? 'border-green-600 bg-green-900/30 scale-105'
                          : 'border-purple-500 bg-gradient-to-br from-purple-100 to-orange-100 scale-105'
                      : `${energy.color} ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`
                  }`}
                  onClick={() => setSelectedEnergy(energy.level)}
                >
                  <CardContent className="p-4 text-center">
                    <div className="text-3xl mb-2">{energy.emoji}</div>
                    <p className={`font-medium ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{energy.title}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {selectedEnergy && (
              <div className="space-y-2">
                <Textarea
                  value={moodNote}
                  onChange={(e) => setMoodNote(e.target.value)}
                  placeholder="Anything else? (optional)"
                  className="h-20"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={!selectedEnergy}
                variant="outline"
                className="flex-1"
              >
                Submit
              </Button>
              
              <Button
                onClick={handleGetSuggestions}
                disabled={!selectedEnergy || isLoading}
                className={`flex-1 ${
                  theme === 'minimalist' 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : theme === 'dark'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Getting suggestions...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Get Task Suggestions
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="py-8 text-center">
            <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
              theme === 'minimalist' 
                ? 'bg-green-100' 
                : theme === 'dark'
                  ? 'bg-green-900/30'
                  : 'bg-gradient-to-br from-green-100 to-teal-100'
            }`}>
              <CheckCircle2 className={`w-8 h-8 ${
                theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-green-600'
              }`} />
            </div>
            <p className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Energy logged! ✨
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className={`p-4 rounded-xl ${
              theme === 'minimalist' 
                ? 'bg-blue-50 border border-blue-200' 
                : theme === 'dark'
                  ? 'bg-blue-900/20 border border-blue-800'
                  : 'bg-gradient-to-r from-purple-100 to-orange-100 border border-purple-300'
            }`}>
              <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                Based on your {selectedEnergy} energy, here's what might work well:
              </p>
            </div>

            {suggestions.map((suggestion, index) => (
              <Card key={index} className={`border-none shadow-sm ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
                <CardContent className="p-4">
                  <h4 className={`font-semibold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                    {suggestion.task_title}
                  </h4>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{suggestion.reason}</p>
                </CardContent>
              </Card>
            ))}

            <Button onClick={handleClose} variant="outline" className="w-full">
              Got it, thanks!
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
