import React, { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import WinBox from "./WinBox";
import { listWins, deleteWin, winDateLabel } from "./winsStore";
import { listDayMoods, isRoughMood } from "./moodStore";
import { winLook } from "./winsTheme";

// Every win they've saved, newest first — the place to land on a hard day.
// "+ Add a win" opens the win box on top; deleting asks first, right in the
// row. A win from a day they said felt Rough or Low gets a small "on a rough
// day" tag (Anna, Oct 31 2026: getting something done in a crappy mood is
// something to be proud of).
export default function WinsList({ open, onClose, theme, specialMode }) {
  const look = winLook(theme, specialMode);
  const [wins, setWins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [adding, setAdding] = useState(false);
  // Days they said felt Rough or Low. The tags are extra: if the moods can't
  // load, the wins still show, untagged.
  const [roughDays, setRoughDays] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    listDayMoods()
      .then((moods) => setRoughDays(new Set(moods.filter((m) => isRoughMood(m.mood)).map((m) => m.day))))
      .catch((e) => console.error("[Wins] Could not load moods for the tags:", e));
    try {
      setWins(await listWins(500));
    } catch (e) {
      console.error("[Wins] Could not load wins:", e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setConfirmId(null);
    load();
  }, [open, load]);

  const remove = async (win) => {
    setDeletingId(win.id);
    try {
      await deleteWin(win.id, win.win_date);
      setWins((prev) => prev.filter((w) => w.id !== win.id));
      setConfirmId(null);
    } catch (e) {
      console.error("[Wins] Could not delete a win:", e);
      toast({ title: "Couldn't delete that win", description: "Check your connection and try again.", duration: 4000 });
    } finally {
      setDeletingId(null);
    }
  };

  const count = wins.length;
  const countLabel = count >= 500 ? "500+ wins" : `${count} ${count === 1 ? "win" : "wins"}`;
  const danger = "bg-rose-600 hover:bg-rose-700 text-white";

  return (
    <>
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
        <DialogContent className={`max-w-lg w-[calc(100vw-2rem)] h-[85vh] flex flex-col gap-3 p-5 ${look.surface}`}>
          <DialogHeader className="text-left pr-6">
            <DialogTitle>Your wins 🏆</DialogTitle>
            <DialogDescription className={look.muted}>
              {loading || failed ? "Everything you've already done." : count ? `${countLabel} and counting.` : "Everything you've already done."}
            </DialogDescription>
          </DialogHeader>

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAdding(true)}
              className={look.outline}
            >
              <Plus className="w-4 h-4" />
              Add a win
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 -mx-1 px-1">
            {loading && count === 0 ? (
              <div className="flex justify-center py-10">
                <Loader2 className={`w-6 h-6 animate-spin ${look.subtle}`} />
              </div>
            ) : failed ? (
              <div className="py-10 text-center space-y-3">
                <p className={`text-sm ${look.muted}`}>{"Couldn't load your wins."}</p>
                <Button type="button" variant="ghost" size="sm" onClick={load} className={look.outline}>
                  Try again
                </Button>
              </div>
            ) : count === 0 ? (
              <p className={`py-10 text-center text-sm ${look.muted}`}>
                Your wins show up here once you add some.
              </p>
            ) : (
              wins.map((win) => (
                <div key={win.id} className={`rounded-xl border p-3 ${look.row}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium flex flex-wrap items-center gap-x-2 gap-y-1 ${look.subtle}`}>
                        <span>{winDateLabel(win.win_date || win.created_date?.slice(0, 10))}</span>
                        {win.win_date && roughDays.has(win.win_date) && (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${look.tag}`}>on a rough day</span>
                        )}
                      </p>
                      <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{win.text}</p>
                    </div>
                    {confirmId !== win.id && (
                      <button
                        type="button"
                        onClick={() => setConfirmId(win.id)}
                        className={`flex-shrink-0 p-1.5 rounded-md opacity-70 hover:opacity-100 ${look.subtle}`}
                        aria-label="Delete this win"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {confirmId === win.id && (
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <span className={`text-sm mr-auto ${look.muted}`}>Delete this win?</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmId(null)}
                        disabled={deletingId === win.id}
                        className={look.outline}
                      >
                        Keep
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => remove(win)}
                        disabled={deletingId === win.id}
                        className={danger}
                      >
                        {deletingId === win.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <WinBox
        open={adding}
        onClose={() => setAdding(false)}
        source="wins_list"
        theme={theme}
        specialMode={specialMode}
        onSaved={(win) => {
          if (win?.id) setWins((prev) => [win, ...prev.filter((w) => w.id !== win.id)]);
        }}
      />
    </>
  );
}
