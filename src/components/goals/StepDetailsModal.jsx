import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, Link as LinkIcon, Video, FileText, Wrench, Globe, CheckCircle2, Lightbulb, X, Upload, Loader2, Pencil } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { dialogLook } from "./goalsTheme";
import LinkedText, { cleanHref } from "./LinkedText";
import { openInBrowser } from "@/components/utils/openInBrowser";

// A step's details (ported from the Goals app's StepDetailsModal): its
// description, resources, success criteria, tips, and the person's own notes
// and photos. Photos upload the same way a task's do (Core.UploadFile).

const resourceTypeIcons = {
  video: Video,
  book: BookOpen,
  article: FileText,
  tool: Wrench,
  course: BookOpen,
  website: Globe,
  other: LinkIcon,
};

export default function StepDetailsModal({ step, isOpen, onClose, onUpdate, onRename, theme, specialMode }) {
  const D = dialogLook(theme, specialMode);
  // The title renames in place here too, the same as on the goal's page
  // (onRename = GoalDetail's renameStep, which also renames the step's task
  // if it still has the step's name). Pencil beside it (Nov 1 2026).
  const [title, setTitle] = useState(step?.title || "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(step?.title || "");
  const saveTitle = async () => {
    const trimmed = titleText.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === title) { setTitleText(title); return; }
    setTitle(trimmed);
    await onRename?.({ ...step, title }, trimmed);
  };
  const [notes, setNotes] = useState(step?.notes || "");
  const [pictures, setPictures] = useState(step?.pictures || []);
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!step) return null;

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      await base44.entities.GoalStep.update(step.id, { notes, pictures });
      toast({ title: "Step updated!" });
      onUpdate?.();
    } catch (err) {
      toast({ title: "Error saving changes", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setPictures((prev) => [...prev, res.file_url]);
    } catch (err) {
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* Fits the screen: a long link in the text used to push the popup wider
          than the phone and make it scroll sideways (Anna, Nov 1 2026). The
          grid's children get min-w-0 so long words wrap instead. */}
      <DialogContent className={`max-h-[90vh] overflow-y-auto overflow-x-hidden w-[calc(100vw-2rem)] max-w-2xl rounded-2xl [&>*]:min-w-0 ${D.surface}`} onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="min-w-0">
          {editingTitle && onRename ? (
            <div className="flex items-center gap-2 pr-6">
              <DialogTitle className="sr-only">{title}</DialogTitle>
              <input
                autoFocus
                className={`flex-1 min-w-0 text-base font-semibold border rounded-lg px-2 py-1 focus:outline-none ${D.field}`}
                value={titleText}
                onChange={(e) => setTitleText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setEditingTitle(false); setTitleText(title); } }}
                aria-label="Step name"
              />
              <Button size="sm" onClick={saveTitle} className="bg-violet-600 hover:bg-violet-700 text-white">Save</Button>
            </div>
          ) : (
            <DialogTitle
              className={`text-xl text-left break-words pr-6 ${onRename ? "cursor-pointer" : ""} ${D.title}`}
              onClick={() => { if (onRename) { setTitleText(title); setEditingTitle(true); } }}
              title={onRename ? "Tap to edit" : undefined}
            >
              {title}
              {onRename && <Pencil className="inline-block w-3.5 h-3.5 ml-2 -mt-1 align-middle opacity-60" aria-hidden="true" />}
            </DialogTitle>
          )}
        </DialogHeader>

        <div className="space-y-6 min-w-0">
          {step.description && (
            <div>
              <h3 className={`text-sm font-semibold mb-2 ${D.title}`}>Description</h3>
              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${D.text}`}><LinkedText text={step.description} linkClassName={`underline font-semibold ${D.accent}`} /></p>
            </div>
          )}

          {Array.isArray(step.step_resources) && step.step_resources.length > 0 && (
            <div>
              <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${D.title}`}>
                <LinkIcon className="w-4 h-4 text-violet-500" />
                Resources
              </h3>
              <div className="space-y-3">
                {step.step_resources.map((resource, idx) => {
                  const Icon = resourceTypeIcons[resource.type] || resourceTypeIcons.other;
                  return (
                    <div key={idx} className={`p-3 border rounded-lg ${D.row}`}>
                      <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm ${D.title}`}>{resource.title}</p>
                          {resource.description && <p className={`text-xs mt-1 ${D.muted}`}><LinkedText text={resource.description} /></p>}
                          {resource.specific_details && <p className={`text-xs mt-1 italic ${D.subtle}`}><LinkedText text={resource.specific_details} /></p>}
                          {resource.url && (
                            <a href={cleanHref(resource.url)} onClick={(e) => { e.preventDefault(); openInBrowser(cleanHref(resource.url)); }} className={`text-xs font-semibold mt-2 inline-block ${D.accent}`}>
                              Click here →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Array.isArray(step.success_criteria) && step.success_criteria.length > 0 && (
            <div>
              <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${D.title}`}>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Success Criteria
              </h3>
              <div className="space-y-2">
                {step.success_criteria.map((criterion, idx) => (
                  <div key={idx} className="flex gap-2 text-sm">
                    <Checkbox disabled defaultChecked={false} className="mt-1" />
                    <span className={`min-w-0 ${D.text}`}><LinkedText text={criterion} /></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step.tips_and_guidance && (
            <div>
              <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${D.title}`}>
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Tips and Guidance
              </h3>
              <p className={`text-sm leading-relaxed border rounded-lg p-3 ${D.tip}`}><LinkedText text={step.tips_and_guidance} /></p>
            </div>
          )}

          <div>
            <label className={`text-sm font-semibold block mb-2 ${D.title}`}>Personal Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your notes, reflections, or progress updates..."
              className={`min-h-[100px] text-sm resize-none ${D.field}`}
            />
          </div>

          <div>
            <label className={`text-sm font-semibold block mb-2 ${D.title}`}>Photos</label>
            <div className="space-y-2">
              {pictures.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pictures.map((pic, idx) => (
                    <div key={idx} className="relative">
                      <img src={pic} alt="Step" className="w-20 h-20 rounded-lg object-cover border border-white/20" />
                      <button
                        onClick={() => setPictures((prev) => prev.filter((p) => p !== pic))}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"
                        aria-label="Remove photo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className={`flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-all ${D.row}`}>
                {uploading ? <Loader2 className={`w-4 h-4 animate-spin ${D.muted}`} /> : <Upload className={`w-4 h-4 ${D.muted}`} />}
                <span className={`text-sm ${D.muted}`}>Add photo</span>
                <input type="file" accept="image/*" onChange={handleUploadImage} className="hidden" disabled={uploading} />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-white/10">
            <Button variant="outline" onClick={onClose} className={D.outline}>Close</Button>
            <Button onClick={handleSaveChanges} disabled={isSaving || uploading} className="bg-violet-600 hover:bg-violet-700 text-white">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
