import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import VoiceTaskInput from "@/components/tasks/VoiceTaskInput";

export default function MoodPromptCard({ onAnswer, onSkip }) {
  const [answer, setAnswer] = useState("");

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <p className="font-medium text-gray-900">How do you feel your day went today?</p>
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type it, or tap the mic and say it out loud..."
          rows={3}
          className="text-base"
        />
        <div className="flex items-center gap-2">
          <VoiceTaskInput inline onTranscription={(text) => setAnswer(text)} />
          <Button
            onClick={() => onAnswer(answer.trim())}
            disabled={!answer.trim()}
            className="flex-1"
          >
            Start my entry
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}