import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Battery, BatteryMedium, BatteryLow, Zap, Heart, Sparkles, Brain, Cloud, Loader2 } from "lucide-react";
import { MoodCheckIn } from "@/entities/MoodCheckIn";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const moodOptions = [
  { value: 'focused', label: 'Focused', icon: Zap, color: 'blue', emoji: '🎯' },
  { value: 'low_energy', label: 'Low Energy', icon: BatteryLow, color: 'gray', emoji: '😴' },
  { value: 'distracted', label: 'Distracted', icon: Cloud, color: 'purple', emoji: '🌀' },
  { value: 'motivated', label: 'Motivated', icon: Sparkles, color: 'green', emoji: '⚡' },
  { value: 'overwhelmed', label: 'Overwhelmed', icon: Brain, color: 'red', emoji: '😰' }
];

export default function MoodCheckInCard({ theme, onCheckIn }) {
  const [selectedMood, setSelectedMood] = useState(null);
  const [energyLevel, setEnergyLevel] = useState(3);
  const [focusNote, setFocusNote] = useState("");
  const [shareWithPartners, setShareWithPartners] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedMood) {
      alert("Please select your mood");
      return;
    }

    setIsSubmitting(true);

    try {
      await MoodCheckIn.create({
        mood: selectedMood,
        energy_level: energyLevel,
        focus_note: focusNote || null,
        check_in_date: new Date().toISOString().split('T')[0],
        shared_with_partners: shareWithPartners
      });

      // Reset form
      setSelectedMood(null);
      setEnergyLevel(3);
      setFocusNote("");
      
      if (onCheckIn) onCheckIn();
    } catch (error) {
      console.error("Error creating mood check-in:", error);
      alert("Failed to save mood check-in");
    }

    setIsSubmitting(false);
  };

  return (
    <Card className={`border-none shadow-lg ${
      theme === 'dark' ? 'bg-gray-800' : 'bg-white'
    }`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
          <Heart className="w-5 h-5" />
          How are you feeling right now?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mood Selection */}
        <div>
          <Label className={`mb-2 block ${theme === 'dark' ? 'text-gray-200' : ''}`}>
            Your Mood
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {moodOptions.map((mood) => {
              const Icon = mood.icon;
              return (
                <button
                  key={mood.value}
                  onClick={() => setSelectedMood(mood.value)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedMood === mood.value
                      ? theme === 'minimalist'
                        ? `border-${mood.color}-500 bg-${mood.color}-50`
                        : theme === 'dark'
                          ? `border-${mood.color}-600 bg-${mood.color}-900/30`
                          : `border-${mood.color}-500 bg-${mood.color}-100`
                      : theme === 'dark'
                        ? 'border-gray-700 hover:border-gray-600 bg-gray-900/50'
                        : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-1">{mood.emoji}</div>
                    <p className={`text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                    }`}>
                      {mood.label}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Energy Level */}
        <div>
          <Label className={`mb-2 block ${theme === 'dark' ? 'text-gray-200' : ''}`}>
            Energy Level: {"⚡".repeat(energyLevel)}
          </Label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => setEnergyLevel(level)}
                className={`flex-1 p-2 rounded-lg border-2 transition-all ${
                  energyLevel >= level
                    ? theme === 'minimalist'
                      ? 'border-yellow-500 bg-yellow-50'
                      : theme === 'dark'
                        ? 'border-yellow-600 bg-yellow-900/30'
                        : 'border-yellow-500 bg-yellow-100'
                    : theme === 'dark'
                      ? 'border-gray-700 bg-gray-900/50'
                      : 'border-gray-200 bg-gray-50'
                }`}
              >
                <span className="text-xl">⚡</span>
              </button>
            ))}
          </div>
        </div>

        {/* Focus Note */}
        <div>
          <Label className={`mb-2 block ${theme === 'dark' ? 'text-gray-200' : ''}`}>
            What are you focusing on today? (optional)
          </Label>
          <Textarea
            value={focusNote}
            onChange={(e) => setFocusNote(e.target.value)}
            placeholder="e.g., Working on project report, studying for exam..."
            className="h-20"
          />
        </div>

        {/* Share Toggle */}
        <div className="flex items-center justify-between">
          <Label className={theme === 'dark' ? 'text-gray-200' : ''}>
            Share with accountability partners
          </Label>
          <Switch
            checked={shareWithPartners}
            onCheckedChange={setShareWithPartners}
          />
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={!selectedMood || isSubmitting}
          className={`w-full ${
            theme === 'minimalist'
              ? 'bg-green-600 hover:bg-green-700'
              : theme === 'dark'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Heart className="w-4 h-4 mr-2" />
              Check In
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}