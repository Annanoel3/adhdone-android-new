import React, { useState } from "react";
import { Flag, Loader2, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

// A small "Report" link under each Support Space reply. Nothing is sent until
// they confirm, and the dialog says exactly what goes: this reply and their
// one message right before it.
export default function ReportResponseButton({ aiMessage, userMessage, theme }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    setSending(true);
    setError("");
    try {
      await base44.functions.invoke("reportAiResponse", {
        ai_response: aiMessage, user_message: userMessage || "", reason,
      });
      setSent(true);
      setOpen(false);
    } catch (e) {
      setError("Couldn't send the report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const linkColor = theme === "dark" ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700";

  if (sent) {
    return <p className={`mt-2 text-xs flex items-center gap-1 ${linkColor}`}><Check className="w-3 h-3" /> Reported, thank you</p>;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`mt-2 text-xs flex items-center gap-1 ${linkColor}`}>
        <Flag className="w-3 h-3" /> Report
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report this response?</DialogTitle>
            <DialogDescription>
              This sends the developer this reply and your one message right before it, so it can be fixed. Nothing else from your chat is sent.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What was wrong with it? (optional)"
            className="min-h-[80px]"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={send} disabled={sending}>
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending</> : "Send report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}