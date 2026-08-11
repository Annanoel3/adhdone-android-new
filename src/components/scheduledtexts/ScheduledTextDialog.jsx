import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Phone, Sparkles, Loader2, Send, X } from "lucide-react";
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
import ContactPickerButton from "../birthdays/ContactPickerButton";
import { rescheduleScheduledTextReminder } from "../utils/scheduledTextScheduler";

/**
 * Create / edit a general scheduled text. Mirrors BirthdayTextDialog:
 * pick a contact (or type a name), choose a date, AI drafts a short message,
 * edit manually or adjust with AI, save → schedules a morning-of reminder.
 */
export default function ScheduledTextDialog({ isOpen, onClose, onSaved, user, editScheduledText }) {
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [occasion, setOccasion] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [useSpecificTime, setUseSpecificTime] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAiPopup, setShowAiPopup] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiFormal, setAiFormal] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const userEditedRef = useRef(false);
  const draftedKeyRef = useRef("");

  useEffect(() => {
    if (!isOpen) return;
    userEditedRef.current = false;
    draftedKeyRef.current = "";
    if (editScheduledText) {
      setRecipientName(editScheduledText.recipient_name || "");
      setPhone(editScheduledText.phone_number || "");
      setOccasion(editScheduledText.occasion || "");
      setDraft(editScheduledText.message || "");
      if (editScheduledText.send_at) {
        setDate(new Date(editScheduledText.send_at).toISOString().slice(0, 10));
      }
      if (editScheduledText.send_time) {
        setTime(editScheduledText.send_time);
        setUseSpecificTime(true);
      } else {
        setTime("");
        setUseSpecificTime(false);
      }
      // editing an existing draft — don't re-draft
      draftedKeyRef.current = `${editScheduledText.recipient_name}|${editScheduledText.send_at}`;
    } else {
      setRecipientName("");
      setPhone("");
      setOccasion("");
      setDate("");
      setTime("");
      setUseSpecificTime(false);
      setDraft("");
    }
  }, [isOpen, editScheduledText]);

  // Auto-draft once the user has a name + date and hasn't typed their own.
  useEffect(() => {
    if (!isOpen) return;
    if (userEditedRef.current) return;
    if (!recipientName.trim() || !date) return;
    const key = `${recipientName.trim()}|${date}`;
    if (key === draftedKeyRef.current) return;
    if (draft) return; // already have a draft for this combo

    let cancelled = false;
    const fetchDraft = async () => {
      setLoading(true);
      try {
        const response = await base44.functions.invoke("draftScheduledText", {
          recipientName: recipientName.trim(),
          occasion,
        });
        const data = response.data || response;
        if (!cancelled && data.message) {
          setDraft(data.message);
          draftedKeyRef.current = key;
        }
      } catch (e) {
        if (!cancelled) setDraft(`Hey ${recipientName.trim()}! Just wanted to reach out.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDraft();
    return () => { cancelled = true; };
  }, [isOpen, recipientName, date, occasion, draft]);

  const handleManualEdit = (e) => {
    userEditedRef.current = true;
    setDraft(e.target.value);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const response = await base44.functions.invoke("draftScheduledText", {
        recipientName: recipientName.trim(),
        occasion,
        instructions: aiInstructions,
        formal: aiFormal,
      });
      const data = response.data || response;
      if (data.message) {
        setDraft(data.message);
        userEditedRef.current = false;
      }
    } catch (e) {
      console.error("[ScheduledTextDialog] Regenerate failed", e);
    } finally {
      setRegenerating(false);
      setShowAiPopup(false);
      setAiInstructions("");
    }
  };

  const handleSave = async () => {
    if (!draft.trim() || !recipientName.trim() || !date || !user?.email) return;
    if (useSpecificTime && !time) return;
    setSaving(true);
    try {
      // Day-only → 9 AM local; time-specific → chosen date+time (local).
      const sendAt = useSpecificTime
        ? new Date(`${date}T${time}`)
        : new Date(date + "T09:00:00");
      const sendTime = useSpecificTime ? time : "";

      if (editScheduledText) {
        const updated = {
          ...editScheduledText,
          recipient_name: recipientName.trim(),
          phone_number: phone.trim(),
          occasion: occasion.trim(),
          message: draft.trim(),
          send_at: sendAt.toISOString(),
          send_time: sendTime,
        };
        await base44.entities.ScheduledText.update(editScheduledText.id, {
          recipient_name: updated.recipient_name,
          phone_number: updated.phone_number,
          occasion: updated.occasion,
          message: updated.message,
          send_at: updated.send_at,
          send_time: updated.send_time,
        });
        await rescheduleScheduledTextReminder(updated);
      } else {
        const created = await base44.entities.ScheduledText.create({
          recipient_name: recipientName.trim(),
          phone_number: phone.trim(),
          occasion: occasion.trim(),
          message: draft.trim(),
          send_at: sendAt.toISOString(),
          send_time: sendTime,
          sent: false,
          onesignal_notification_ids: [],
          notification_recipient_email: user.email,
        });
        await rescheduleScheduledTextReminder(created);
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error("[ScheduledTextDialog] Save failed", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-blue-600" /> Schedule a Text
            </DialogTitle>
            <DialogDescription>
              Pick a contact, choose a day, and we'll remind you to send it on the morning of.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Who's it for?</Label>
              <Input
                value={recipientName}
                onChange={(e) => {
                  const val = e.target.value;
                  setRecipientName(val);
                  // Typing a phone number manually captures it as the recipient's number.
                  const digits = val.replace(/[^\d+]/g, "");
                  if (digits.length >= 7) {
                    setPhone(val.trim());
                  } else if (!val.trim()) {
                    setPhone("");
                  }
                }}
                placeholder="Type a name or number, or pick a contact"
              />
              <ContactPickerButton
                theme={undefined}
                onContactPicked={({ name, phone: pickedPhone }) => {
                  if (name) setRecipientName(name);
                  if (pickedPhone) setPhone(pickedPhone);
                }}
              />
              {phone && <p className="text-xs text-gray-500">📱 {phone}</p>}
            </div>

            <div className="space-y-2">
              <Label>When to send</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Specific time?</p>
                  <p className="text-xs text-gray-500">Off = remind at 9 AM that morning. On = remind at an exact time, then 10 min later, then hourly.</p>
                </div>
                <Switch checked={useSpecificTime} onCheckedChange={(v) => { setUseSpecificTime(v); if (!v) setTime(""); }} />
              </div>
              {useSpecificTime && (
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              )}
              {!useSpecificTime && <p className="text-xs text-gray-500">We'll remind you at 9 AM that morning, then hourly until you send.</p>}
            </div>

            <div className="space-y-2">
              <Label>What's it about? (optional)</Label>
              <Input
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                placeholder="e.g. follow up about brunch, thank you for dinner"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span className="ml-2 text-sm text-gray-500">Drafting your message…</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Your message</Label>
                  <Textarea
                    value={draft}
                    onChange={handleManualEdit}
                    onFocus={(e) => {
                      setTimeout(() => {
                        e.target.scrollIntoView({ behavior: "smooth", block: "center" });
                      }, 300);
                      setTimeout(() => {
                        e.target.scrollIntoView({ behavior: "smooth", block: "center" });
                      }, 600);
                      }}
                    className="min-h-[90px]"
                    placeholder="Type your message or let the AI draft one…"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={!draft.trim() || !recipientName.trim() || !date || (useSpecificTime && !time) || saving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {saving ? "Saving…" : "Save & Schedule"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowAiPopup(true)}
                    disabled={loading || regenerating || !draft}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Adjust with AI
                  </Button>
                </div>
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
              Tell the AI how to change it. It'll keep things short and natural.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>What do you want to say?</Label>
              <Textarea
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
                placeholder="e.g. make it more enthusiastic, add something funny, make it shorter"
                className="min-h-[80px]"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Formal relationship?</p>
                <p className="text-xs text-gray-500">Boss, coworker, professional contact</p>
              </div>
              <Switch checked={aiFormal} onCheckedChange={setAiFormal} />
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