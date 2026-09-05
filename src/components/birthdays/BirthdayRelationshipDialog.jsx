import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart } from "lucide-react";

const QUICK_PICKS = [
  "Mom", "Dad", "Sister", "Brother", "Grandma", "Grandpa",
  "Husband", "Wife", "Partner", "Son", "Daughter",
  "Sister-in-law", "Brother-in-law", "Mother-in-law", "Father-in-law",
  "Aunt", "Uncle", "Cousin", "Best friend", "Friend", "Coworker", "Boss", "Neighbor",
];

/**
 * Asks who this person is to the user before AI drafts the birthday text,
 * so the message tone and wording actually fit the relationship.
 */
export default function BirthdayRelationshipDialog({ isOpen, personName, onConfirm, onClose }) {
  const [value, setValue] = useState("");

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-pink-600" /> Who is {personName} to you?
          </DialogTitle>
          <DialogDescription>
            This helps us write a message that actually sounds right.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {QUICK_PICKS.map((p) => (
              <button
                key={p}
                onClick={() => setValue(p)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  value === p
                    ? "bg-pink-600 text-white border-pink-600"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-pink-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Or type it</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. my wife's grandma"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => onConfirm(value.trim())}
              disabled={!value.trim()}
              className="flex-1 bg-pink-600 hover:bg-pink-700 text-white"
            >
              Draft my text
            </Button>
            <Button variant="outline" onClick={() => onConfirm("")}>
              Skip
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}