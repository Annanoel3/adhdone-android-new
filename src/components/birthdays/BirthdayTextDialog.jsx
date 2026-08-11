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
import { findContactByName } from "../utils/contactMatcher";

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
  const [autoMatched, setAutoMatched] = useState(false);

  const personName = birthdayTask?.birthday_person || "Birthday";

  useEffect(() => {
    if (!isOpen || !birthdayTask) return;

    // Load saved phone number and message
    setPhone(birthdayTask.birthday_phone_number || "");
    setAutoMatched(false);
    // If the task already has a saved message, load it instead of re-drafting
    if (birthdayTask.birthday_text_message) {
      setDraft(birthdayTask.birthday_text_message);
      return;
    }

    let cancelled = false;

    // Auto-match a contact from the phone by the birthday person's name.
    // Best-effort — if it fails or finds nothing, the manual picker covers it.
    if (!birthdayTask.birthday_phone_number && birthdayTask.birthday_person) {
      findContactByName(birthdayTask.birthday_person).then((found) => {
        if (!cancelled && found?.phone) {
          setPhone(found.phone);
          setAutoMatched(true);
        }
      });
    }

    const fetchDraft = async () => {
      setLoading(true);
      try {
        const response = await base44.functions.invoke('draftBirthdayText', {
          personName,
        });
        const data = response.data || response;
        if (!cancelled && data.message) {
          setDraft(data.message);
        }
      } catch (e) {
        console.error('[BirthdayTextDialog] Failed to draft:', e);
        if (!cancelled) {
          setDraft(`Happy Birthday ${personName}! Hope you have a great day!`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDraft();
    return () => { cancelled = true; };
  }, [isOpen, birthdayTask]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const response = await base44.functions.invoke('draftBirthdayText', {
        personName,
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
    const body = encodeURIComponent(draft.trim());
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
    const cleanPhone = phone.trim().replace(/[^0-9+]/g, "");
    window.location.href = cleanPhone ? `sms:${cleanPhone}?body=${body}` : `sms:?&body=${body}`;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
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
                      setAutoMatched(false);
                    }}
                  />
                  {autoMatched && (
                    <p className="text-xs text-green-600">✓ Auto-matched from your contacts. Tap to change if it's wrong.</p>
                  )}
                  {!autoMatched && <p className="text-xs text-gray-500">Fills in the recipient line when you send.</p>}
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