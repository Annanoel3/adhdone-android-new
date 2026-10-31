import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Plus } from "lucide-react";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import WinsList from "./WinsList";
import WinBox from "./WinBox";
import { WINS_CHANGED, listWins } from "./winsStore";

export { default as WinsList } from "./WinsList";

// The wins spot on Insights: somewhere to tap on a stuck, overwhelmed day and
// see everything they've already done. Opens the full list; with no wins yet
// it just offers to add one.
//
// Opens the list by itself when the page is reached as /Progress?wins=1 (the
// slump popup links there) or when openOnMount is set. Either way the list is
// a popup that opened without a tap on this page, so it waits its turn like
// one, and wins=1 is taken back out of the address once it's up.
export default function WinsSpot({ theme, specialMode, openOnMount = false, className = "md:col-span-2" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [count, setCount] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [autoWanted, setAutoWanted] = useState(!!openOnMount);
  const fromLink = new URLSearchParams(location.search).get("wins") === "1";

  useEffect(() => {
    if (openOnMount) setAutoWanted(true);
  }, [openOnMount]);
  useEffect(() => {
    if (fromLink) setAutoWanted(true);
  }, [fromLink, location.key]);

  const autoShown = usePopupTurn(autoWanted, { reactive: true });

  // wins=1 comes off the address when the list closes, not while it's up: a
  // navigation while it's open could remount the page and close it in the
  // same instant it appeared (the same flash as the first "new Insights"
  // popup, Oct 30 2026).
  const closeList = () => {
    setListOpen(false);
    setAutoWanted(false);
    const params = new URLSearchParams(location.search);
    if (params.get("wins") !== "1") return;
    params.delete("wins");
    const rest = params.toString();
    navigate(`${location.pathname}${rest ? `?${rest}` : ""}`, { replace: true, state: location.state });
  };

  useEffect(() => {
    let gone = false;
    const load = () => {
      listWins(500)
        .then((wins) => { if (!gone) setCount(wins.length); })
        .catch((e) => console.error("[Wins] Could not count wins:", e));
    };
    load();
    window.addEventListener(WINS_CHANGED, load);
    return () => {
      gone = true;
      window.removeEventListener(WINS_CHANGED, load);
    };
  }, []);

  const dark = theme === "dark";
  const main = dark ? "text-white" : "text-gray-900";
  const soft = dark ? "text-gray-400" : "text-gray-600";
  const none = count === 0;

  return (
    <>
      <Card className={`border-none shadow-lg ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Your wins
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className={`text-sm ${soft}`}>
            {none
              ? "Your wins show up here once you add some."
              : "Feeling stuck? Look at what you've already done."}
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {!none && (
                <>
                  <span className={`text-2xl font-bold ${main}`}>
                    {count == null ? "…" : count >= 500 ? "500+" : count}
                  </span>
                  <span className={`ml-1.5 text-sm ${soft}`}>{count === 1 ? "win saved" : "wins saved"}</span>
                </>
              )}
            </div>
            {none ? (
              <Button
                type="button"
                onClick={() => setAdding(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Plus className="w-4 h-4" />
                Add a win
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => setListOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                See my wins
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <WinsList
        open={listOpen || autoShown}
        onClose={closeList}
        theme={theme}
        specialMode={specialMode}
      />

      <WinBox
        open={adding}
        onClose={() => setAdding(false)}
        source="wins_list"
        theme={theme}
        specialMode={specialMode}
      />
    </>
  );
}
