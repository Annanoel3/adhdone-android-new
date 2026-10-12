import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Cake, Sparkles, Loader2, Send, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import ContactPickerButton from "./ContactPickerButton";
import BirthdayRelationshipDialog from "./BirthdayRelationshipDialog";
import { openSmsApp } from "@/components/utils/openSmsApp";
import { setBirthdayAnimal } from "@/components/utils/birthdayScheduler";
import { toast } from "@/components/ui/use-toast";

/**
 * Prompts the user to draft a birthday text message when a birthday is created.
 * Starts with an AI-drafted "Happy Birthday [name]" message, lets the user
 * edit manually or adjust with AI (sub-popup asks what they want to say +
 * formal/casual toggle). Saves the message to the task. Provides a "Send via
 * Messages" button that opens the phone's messaging app with the text pre-typed.
 */
export default function BirthdayTextDialog({ isOpen, onClose, birthdayTask, onSaved }) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAiPopup, setShowAiPopup] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiFormal, setAiFormal] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [askRelationship, setAskRelationship] = useState(false);

  const personName = birthdayTask?.birthday_person || "Birthday";

  useEffect(() => {
    if (!isOpen || !birthdayTask) return;
    // A pet's birthday has no text (Anna, Oct 12 2026).
    if (birthdayTask.birthday_animal) {
      onClose?.();
      return;
    }

    // Load saved phone number and message
    setPhone(birthdayTask.birthday_phone_number || "");
    // If the task already has a saved message, load it instead of re-drafting
    if (birthdayTask.birthday_text_message) {
      setDraft(birthdayTask.birthday_text_message);
      return;
    }

    // Ask how they're related first — the tone of the message depends on it.
    setAskRelationship(true);
  }, [isOpen, birthdayTask]); // eslint-disable-line react-hooks/exhaustive-deps

  // A pet: same reminders, worded to celebrate them, and no text at all. The
  // text box closes at once; the reminders are re-worded behind it (Oct 12
  // 2026: it sat on screen, empty, while that saved).
  const makePet = async (animal) => {
    onClose?.();
    try {
      await setBirthdayAnimal(birthdayTask, animal);
      toast({
        title: `🐾 Got it`,
        description: `No text needed for ${personName}. The reminders will just say to celebrate.`,
        duration: 4000,
      });
      onSaved?.();
    } catch (e) {
      console.error('[BirthdayTextDialog] Saving the pet failed:', e);
      toast({ title: "That didn't save", description: 'Check your connection and try again.' });
    }
  };

  const fetchDraft = async (rel, typed = false) => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('draftBirthdayText', {
        personName,
        relationship: rel || "",
        // Typed in ("my hamster"): it may say this is an animal.
        askIfAnimal: !!(typed && rel),
      });
      const data = response.data || response;
      if (data.animal) {
        await makePet(data.animal);
        return;
      }
      if (data.message) setDraft(data.message);
    } catch (e) {
      console.error('[BirthdayTextDialog] Failed to draft:', e);
      setDraft(`Happy Birthday ${personName}! Hope you have a great day!`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const response = await base44.functions.invoke('draftBirthdayText', {
        personName,
        relationship,
        instructions: aiInstructions,
        formal: aiFormal,
      });
      const data = response.data || response;
      if (data.message) {
        setDraft(data.message);
      }
    } catch (e) {
      console.error('[BirthdayTextDialog] Regenerate failed:', e);
    } finally {
      setRegenerating(false);
      setShowAiPopup(false);
      setAiInstructions("");
    }
  };

  const handleSave = async () => {
    if (!draft.trim() || !birthdayTask) return;
    setSaving(true);
    try {
      await base44.entities.Task.update(birthdayTask.id, {
        birthday_text_message: draft.trim(),
        birthday_phone_number: phone.trim(),
      });
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('[BirthdayTextDialog] Save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSendText = async () => {
    if (!draft.trim()) return;
    if (birthdayTask?.id) {
      try {
        await base44.entities.Task.update(birthdayTask.id, {
          birthday_text_sent: true,
          birthday_phone_number: phone.trim(),
        });
      } catch (e) {
        console.error('[BirthdayTextDialog] Failed to mark text as sent:', e);
      }
    }
    openSmsApp(phone, draft.trim());
  };

  return (
    <>
      <BirthdayRelationshipDialog
        isOpen={askRelationship}
        personName={personName}
        onClose={() => { setAskRelationship(false); onClose?.(); }}
        onConfirm={(rel, animal, typed) => {
          setRelationship(rel);
          setAskRelationship(false);
          if (animal) {
            makePet(animal);
            return;
          }
          fetchDraft(rel, typed);
        }}
      />

      {/* Not shown while "Who is ___ to you?" is up: for a pet it never shows at all. */}
      <Dialog open={isOpen && !askRelationship} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cake className="w-5 h-5 text-pink-600" /> Birthday Text for {personName}
            </DialogTitle>
            <DialogDescription>
              We drafted a birthday text for you. Edit it, adjust with AI, or send as-is on the big day.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-pink-600" />
                <span className="ml-2 text-sm text-gray-500">Drafting your message…</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Their phone number (optional)</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 555-123-4567"
                    type="tel"
                  />
                  <ContactPickerButton
                    theme={undefined}
                    onContactPicked={({ phone: pickedPhone }) => {
                      if (pickedPhone) setPhone(pickedPhone);
                    }}
                  />
                  <p className="text-xs text-gray-500">Fills in the recipient line when you send.</p>
                </div>

                <div className="space-y-2">
                  <Label>Your birthday text</Label>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-h-[120px]"
                    placeholder="Happy Birthday…"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={!draft.trim() || saving}
                    className="flex-1 bg-pink-600 hover:bg-pink-700 text-white"
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {saving ? "Saving…" : "Save & Schedule"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowAiPopup(true)}
                    disabled={loading || regenerating}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Adjust with AI
                  </Button>
                </div>

                <Button
                  variant="outline"
                  onClick={handleSendText}
                  disabled={!draft.trim()}
                  className="w-full"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send via Messages
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Adjust Popup */}
      <Dialog open={showAiPopup} onOpenChange={(o) => !o && setShowAiPopup(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" /> Adjust with AI
            </DialogTitle>
            <DialogDescription>
              Tell the AI what you want to say. It'll keep things short and natural.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>What do you want to say?</Label>
              <Textarea
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
                placeholder="e.g. mention we haven't seen each other in a while, or add something funny"
                className="min-h-[80px]"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Formal relationship?</p>
                <p className="text-xs text-gray-500">Boss, coworker, professional contact</p>
              </div>
              <Switch
                checked={aiFormal}
                onCheckedChange={setAiFormal}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {regenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {regenerating ? "Regenerating…" : "Regenerate"}
              </Button>
              <Button variant="outline" onClick={() => setShowAiPopup(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}