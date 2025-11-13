import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Flag, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ReportContentDialog({
  isOpen,
  onClose,
  contentType,
  reportedUserEmail,
  reportedUserName,
  contentId,
  contentText,
  theme
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      alert("Please select a reason for reporting");
      return;
    }

    setIsSubmitting(true);
    try {
      const currentUser = await base44.auth.me();

      // Create report record
      await base44.entities.ReportedContent.create({
        reporter_email: currentUser.email,
        reporter_name: currentUser.display_name || currentUser.full_name,
        content_type: contentType,
        reported_user_email: reportedUserEmail,
        reported_user_name: reportedUserName,
        content_id: contentId,
        content_text: contentText,
        reason: reason,
        details: details.trim() || null,
        status: "pending"
      });

      // Send email notification to admin
      const emailBody = `
New Content Report

Reporter: ${currentUser.display_name || currentUser.full_name} (${currentUser.email})
Content Type: ${contentType}
Reported User: ${reportedUserName || 'N/A'} (${reportedUserEmail || 'N/A'})
Reason: ${reason}

Details:
${details || 'No additional details provided'}

${contentText ? `\nReported Content:\n"${contentText}"` : ''}

---
Report ID: Will be in the ReportedContent entity
Date: ${new Date().toLocaleString()}
      `.trim();

      await base44.integrations.Core.SendEmail({
        to: "adhdone.space@gmail.com",
        subject: `⚠️ Content Report: ${reason} - ${contentType}`,
        body: emailBody
      });

      alert("Report submitted successfully. Thank you for helping keep our community safe.");
      
      setReason("");
      setDetails("");
      onClose();
    } catch (error) {
      console.error("Error submitting report:", error);
      alert("Failed to submit report. Please try again.");
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-md ${theme === 'dark' ? 'bg-gray-800 text-gray-100' : ''}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-600" />
            Report Content
          </DialogTitle>
          <DialogDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
            Help us maintain a safe community. All reports are reviewed by our team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Reason for Report *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className={`mt-2 ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="harassment">Harassment or Bullying</SelectItem>
                <SelectItem value="spam">Spam or Unwanted Content</SelectItem>
                <SelectItem value="inappropriate">Inappropriate Content</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Additional Details (Optional)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Please provide any additional context..."
              className={`mt-2 min-h-[100px] ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
              maxLength={1000}
            />
            <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              {details.length}/1000 characters
            </p>
          </div>

          {reportedUserName && (
            <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <span className="font-medium">Reporting:</span> {reportedUserName}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason || isSubmitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Flag className="w-4 h-4 mr-2" />
                Submit Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}