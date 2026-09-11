import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Shuffle, RotateCcw } from "lucide-react";
import VoiceTaskInput from "@/components/tasks/VoiceTaskInput";
import ChoicePills from "@/components/decision/ChoicePills";
import DecisionResult from "@/components/decision/DecisionResult";
import { parseChoices, pickRandom } from "@/components/decision/parseChoices";

export default function DecisionMaker() {
  const [input, setInput] = useState("");
  const [winner, setWinner] = useState(null);

  const choices = useMemo(() => parseChoices(input), [input]);

  const decide = () => {
    setWinner(pickRandom(choices));
  };

  const reset = () => {
    setInput("");
    setWinner(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Decision Maker</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Too many options? Type or say them and let the app pick one for you.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <Textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setWinner(null);
            }}
            placeholder="Asian, Italian, Mexican, American"
            rows={3}
            className="text-base"
          />

          <div className="flex items-center gap-2">
            <VoiceTaskInput
              inline
              onTranscription={(text) => {
                setInput(text);
                setWinner(null);
              }}
            />
            <span className="text-xs text-gray-500">
              Tap the mic and say your options out loud
            </span>
          </div>

          <ChoicePills choices={choices} winner={winner} />

          <div className="flex gap-2">
            <Button
              onClick={decide}
              disabled={choices.length < 2}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              <Shuffle className="w-4 h-4 mr-2" />
              {winner ? "Pick again" : "Decide for me"}
            </Button>
            {(input || winner) && (
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>

          {choices.length === 1 && (
            <p className="text-xs text-gray-500">
              Add at least one more option — separate them with commas or "or".
            </p>
          )}
        </CardContent>
      </Card>

      <DecisionResult winner={winner} />
    </div>
  );
}