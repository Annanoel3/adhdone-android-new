import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Sparkles, Target, Plus, Check, ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import VoiceTaskInput from "@/components/tasks/VoiceTaskInput";
import GoalsGate from "@/components/goals/GoalsGate";
import { useGoalTheme, goalLook } from "@/components/goals/goalsTheme";
import { runGoalSync } from "@/components/goals/GoalStepSync";
import { notifyGoalsChanged } from "@/components/goals/goalLogic";
import {
  readLocalSession, writeLocalSession, clearLocalSession, sessionTime, loadAccountDraft,
  saveAccountDraft, completeAccountDraft, persistSession, flushAccountDraft,
} from "@/components/goals/plannerDraft";

// The Goals planner (ported Oct 31 2026 from Anna's Goals app, Planner.jsx;
// GOALS_PORT.md). Same conversation, same approval flow, same plan view. In
// ADHDone: its own theme looks, ADHDone's mic, a planner error shows a Retry
// (never an assistant message), and saving a plan puts its first step on the
// task list (GoalStepSync) instead of booking goal notifications.

// The chat in progress is saved on this device (localStorage, as before) and
// to the account (GoalPlannerDraft; plannerDraft.js), so it comes back on any
// device (Anna, Nov 1 2026). readSession: this device's copy.
const readSession = readLocalSession;
// Every save goes to the account right away too: before the planner is asked
// and after each answer.
const writeSession = (data) => persistSession(data, { now: true });
// The chat is finished (a goal saved): gone from this device, marked
// completed on the account (kept, never restored).
const clearSession = () => { clearLocalSession(); completeAccountDraft(); };
const deviceTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
};

export default function PlannerPage() {
  return (
    <GoalsGate>
      <Planner />
    </GoalsGate>
  );
}

function Planner() {
  const [messages, setMessages] = useState(() => {
    // Restore an in-progress session right away (not when ?edit is in the URL).
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit")) return [];
    const d = readSession();
    return d?.messages?.length > 0 ? d.messages : [];
  });
  const [input, setInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'plan_proposed' | 'edit_approved'
  const [pendingGoalId, setPendingGoalId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [firstTwoMonthsReady, setFirstTwoMonthsReady] = useState(false);
  const [stepsFailed, setStepsFailed] = useState(false);
  const [goals, setGoals] = useState([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [isDraftingFirstPlan, setIsDraftingFirstPlan] = useState(false);
  const [user, setUser] = useState(null);
  // A long plan still being written (continue_plan), one call at a time.
  const [continuing, setContinuing] = useState(false);
  // "Plan New Goal" (and Goals' New Goal, /Planner?new=1) opens a fresh plan.
  // In the Goals app that button left the goals list on screen.
  const [forceNew, setForceNew] = useState(() => new URLSearchParams(window.location.search).get("new") === "1");
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(messages);
  const savedStepsRef = useRef(null);
  const continuingRef = useRef(false);
  const convoGenRef = useRef(0); // bumped when the conversation is replaced
  const touchedRef = useRef(false); // they've typed or started fresh since opening
  const mountedRef = useRef(true);
  const editingGoalRef = useRef(null);
  const pendingActionRef = useRef(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme, specialMode } = useGoalTheme();
  const L = goalLook(theme, specialMode);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { editingGoalRef.current = editingGoal; }, [editingGoal]);
  useEffect(() => { pendingActionRef.current = pendingAction; }, [pendingAction]);
  // Leaving the page or the app: a save still waiting goes now.
  useEffect(() => {
    mountedRef.current = true;
    const onHide = () => { if (document.visibilityState === "hidden") flushAccountDraft(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onHide);
      flushAccountDraft();
    };
  }, []);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isChatLoading]);

  const loadGoals = useCallback(async () => {
    try {
      const all = await base44.entities.Goal.list("-created_date", 100);
      setGoals(all || []);
      return all || [];
    } catch (e) {
      return [];
    } finally {
      setGoalsLoaded(true);
    }
  }, []);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    const editId = searchParams.get("edit");
    Promise.all([loadGoals(), editId ? Promise.resolve(null) : loadAccountDraft()]).then(([all, account]) => {
      if (editId) {
        const goal = all.find((g) => g.id === editId);
        if (goal) startEditSession(goal);
        return;
      }
      // They typed or started fresh while this loaded: what they're doing wins.
      if (touchedRef.current) return;
      // This device's chat (shown above) or the account's, whichever changed
      // last. The account's comes back on any device; this device's goes up
      // to the account when it's the newer one.
      let d = readSession();
      if (account && sessionTime(account) > sessionTime(d)) {
        if (account.completed || account.messages.length === 0) {
          // Finished or started fresh on another device since: not restored.
          if (d?.messages?.length) {
            clearLocalSession();
            messagesRef.current = [];
            setMessages([]);
          }
          d = null;
        } else {
          d = writeLocalSession(account, { keepTime: true });
          messagesRef.current = account.messages;
          setMessages(account.messages);
        }
      } else if (d?.messages?.length) {
        saveAccountDraft(d, { now: true });
      }
      // Bring back the approval buttons only if the last message is a full plan.
      const lastMsg = d?.messages?.[d.messages.length - 1];
      const lastContent = lastMsg?.content || "";
      const looksLikePlan = lastContent.includes("Month 1") && (lastContent.includes("Month 2") || lastContent.includes("Week 1"));
      // A conversation about changing a saved goal stays about that goal (the
      // Goals app restored it as a new plan, and approving it made a second goal).
      const editGoal = d?.editGoalId ? all.find((g) => g.id === d.editGoalId) : null;
      if (editGoal && d?.messages?.length) {
        setEditingGoal(editGoal);
        editingGoalRef.current = editGoal;
      }
      if (editGoal && lastMsg?.role === "assistant" && (d?.pendingAction === "edit_approved" || lastContent.includes("EDIT_APPROVED"))) {
        setPendingAction("edit_approved");
        setPendingGoalId(editGoal.id);
      } else if (looksLikePlan && lastMsg?.role === "assistant") setPendingAction("plan_proposed");
      // Closed while the planner was answering: the question is saved, the
      // answer never came. Offer to ask again.
      if (lastMsg?.role === "user") setChatError(true);
      // A plan that wasn't finished (closed while it was being written, or
      // from before long plans were finished): pick up where it stopped.
      if (lastMsg?.role === "assistant" && planNeedsWriting(d.messages)) continueWriting();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEditSession = (goal) => {
    convoGenRef.current += 1;
    touchedRef.current = true;
    editingGoalRef.current = goal;
    setEditingGoal(goal);
    setChatError(false);
    if (goal.conversation_history && goal.conversation_history.length > 0) {
      const monthTitles = goal.month_titles || {};
      setMessages(goal.conversation_history.map((m) =>
        m.role === "assistant" ? { ...m, goalMonthTitles: m.goalMonthTitles || monthTitles } : m
      ));
    } else {
      setMessages([{
        role: "assistant",
        content: `I'm ready to help you update **"${goal.title}"**. What would you like to change?`,
        editExamples: [
          "Extend the timeline by 2 months",
          "Make the steps easier and more manageable",
          "I've been slacking — help me get back on track",
          "Add a new phase focused on accountability",
          "Remove Month 3 and compress the rest",
          "Change my goal's focus to be more practical",
          "I finished early — what should I do next?",
          "The deadlines feel too tight, can you loosen them?",
        ],
      }]);
    }
    setPendingAction(null);
    setSaved(false);
    setPendingGoalId(null);
    setShowApprovalModal(false);
    setShowCelebration(false);
  };

  const handleNewPlan = () => {
    setMessages([]);
    setPendingAction(null);
    setPendingGoalId(null);
    setSaved(false);
    setInput("");
    setEditingGoal(null);
    setShowApprovalModal(false);
    setShowCelebration(false);
    setChatError(false);
    setSaveError(false);
    setStepsFailed(false);
    convoGenRef.current += 1;
    touchedRef.current = true;
    editingGoalRef.current = null;
    // A fresh start: this device's chat is emptied and the account's draft
    // marked finished.
    writeLocalSession({ startedAt: new Date().toISOString(), messages: [], pendingAction: null });
    completeAccountDraft();
  };

  const startFreshPlan = () => {
    handleNewPlan();
    setForceNew(true);
  };

  // A long plan the time ran out on: continue_plan writes the rest, one call
  // at a time (each with the planner's full time budget), at most 4 calls a
  // go, into that same answer, saving after each. Then "Looks good" shows;
  // if it still isn't finished, "Keep writing" (PlanProgress) runs it again.
  const continueWriting = useCallback(async () => {
    if (continuingRef.current) return;
    const start = messagesRef.current;
    const lastAt = start.length - 1;
    if (lastAt < 0 || start[lastAt].role !== "assistant") return;
    continuingRef.current = true;
    setContinuing(true);
    const gen = convoGenRef.current;
    // Unfinished until the planner says otherwise, so a failed call leaves
    // "Keep writing", never "Looks good".
    if (start[lastAt].planIncomplete !== true) {
      const m0 = start[lastAt];
      const marked = [...start.slice(0, lastAt), {
        ...m0,
        planIncomplete: true,
        monthsDone: m0.monthsDone ?? monthsWritten(m0.content),
        monthsTotal: m0.monthsTotal ?? (planLength(m0.content, m0.goalMonthTitles || {}) || null),
      }];
      messagesRef.current = marked;
      setMessages(marked);
    }
    try {
      for (let call = 0; call < 4; call++) {
        const convo = messagesRef.current;
        const idx = convo.length - 1;
        const last = convo[idx];
        if (!last || last.role !== "assistant") return;
        const goal = editingGoalRef.current;
        const payload = {
          mode: "continue_plan",
          messages: convo.slice(0, idx).filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
          plan_text: last.content,
          tz: deviceTz(),
        };
        if (goal) payload.goal_id = goal.id;
        let data = null;
        try {
          const res = await base44.functions.invoke("goalPlannerChat", payload);
          data = res?.data || null;
        } catch (e) {
          console.error("[Planner] writing the rest of the plan failed:", e);
        }
        if (convoGenRef.current !== gen) return; // a fresh start or another goal since
        if (!data || data.error || !data.message) continue;
        const done = data.incomplete !== true;
        const updatedMsg = {
          ...last,
          content: data.message,
          planIncomplete: !done,
          monthsDone: data.months_done ?? last.monthsDone ?? null,
          monthsTotal: data.months_total ?? last.monthsTotal ?? null,
          goalMonthTitles: { ...(last.goalMonthTitles || {}), ...(data.month_titles || {}) },
        };
        const updated = [...convo.slice(0, idx), updatedMsg];
        messagesRef.current = updated;
        persistSession({
          startedAt: new Date().toISOString(),
          messages: updated,
          pendingAction: pendingActionRef.current || "plan_proposed",
          completed: false,
          editGoalId: goal?.id || null,
        }, { now: true });
        // Left the Planner: saved, and it carries on the next time it opens.
        if (!mountedRef.current) return;
        setMessages(updated);
        if (done) {
          setPendingAction("plan_proposed");
          return;
        }
      }
    } finally {
      continuingRef.current = false;
      setContinuing(false);
    }
  }, []);

  // One planner turn for the conversation as it stands (the user's message is
  // already in it). Used by Send and by Retry.
  const askPlanner = useCallback(async (convo, latestText) => {
    setIsChatLoading(true);
    setChatError(false);
    const priorAssistantMessages = convo.filter((m) => m.role === "assistant").length;
    const planAlreadyWritten = convo.some((m) => m.role === "assistant" && /Month\s+\d+/i.test(m.content) && /Week\s+\d+/i.test(m.content));
    const isRevisionRequest = /revise|change|rewrite|redo|adjust|update|swap|remove|extend|shorten|easier|harder|restructure|skip|simplif|speed|slow|accelerate|compress|expand/i.test(latestText || "");
    setIsDraftingFirstPlan((!planAlreadyWritten && priorAssistantMessages >= 1) || (planAlreadyWritten && isRevisionRequest));
    let needsMore = false;
    try {
      const payload = {
        messages: convo.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
        mode: "chat",
        tz: deviceTz(),
      };
      if (editingGoal) payload.goal_id = editingGoal.id;
      const res = await base44.functions.invoke("goalPlannerChat", payload);
      const data = res?.data || {};
      if (data.error || !data.message) throw new Error(data.error || "No answer");
      const { message, action, goal_id, month_titles } = data;

      const newMonthTitles = (month_titles && Object.keys(month_titles).length > 0)
        ? month_titles
        : (editingGoal?.month_titles || {});
      // A plan the time ran out on comes back incomplete; the rest is written
      // below (continueWriting).
      const progress = typeof data.incomplete === "boolean"
        ? { planIncomplete: data.incomplete, monthsDone: data.months_done ?? null, monthsTotal: data.months_total ?? null }
        : {};
      const updatedMessages = [...convo, { role: "assistant", content: message, goalMonthTitles: newMonthTitles, ...progress }];
      messagesRef.current = updatedMessages;
      setMessages(updatedMessages);
      needsMore = data.incomplete === true;
      writeSession({ startedAt: new Date().toISOString(), messages: updatedMessages, pendingAction: action || null, completed: false, editGoalId: editingGoal?.id || null });

      const looksLikeFullPlan = message.includes("Month 1") && (message.includes("Month 2") || message.includes("Week 1") || message.includes("Week 2"));
      if (action === "edit_approved" || message.includes("EDIT_APPROVED")) {
        setPendingAction("edit_approved");
        const resolvedGoalId = goal_id || editingGoal?.id;
        setPendingGoalId(resolvedGoalId);
        if (!editingGoal && resolvedGoalId) {
          const found = goals.find((g) => g.id === resolvedGoalId);
          if (found) setEditingGoal(found);
        }
      } else if (!editingGoal && (action === "plan_proposed" || looksLikeFullPlan)) {
        setPendingAction("plan_proposed");
      } else if (editingGoal && looksLikeFullPlan) {
        setPendingAction("plan_proposed");
      } else {
        setPendingAction(null);
      }
    } catch (err) {
      // The conversation stays exactly as it was; Retry asks again.
      console.error("[Planner] planner turn failed:", err);
      setChatError(true);
    } finally {
      setIsChatLoading(false);
      setIsDraftingFirstPlan(false);
    }
    if (needsMore) continueWriting();
  }, [editingGoal, goals, continueWriting]);

  const sendMessage = useCallback(async (content) => {
    if (!content || !content.trim() || isChatLoading || continuingRef.current) return;
    touchedRef.current = true;
    const userMsg = { role: "user", content: content.trim() };
    const newMessages = [...messagesRef.current, userMsg];
    setMessages(newMessages);
    setInput("");
    // Saved before the planner answers: closing the app mid-answer keeps it.
    writeSession({ startedAt: new Date().toISOString(), messages: newMessages, pendingAction, completed: false, editGoalId: editingGoal?.id || null });
    await askPlanner(newMessages, content);
  }, [isChatLoading, pendingAction, askPlanner, editingGoal]);

  const retryLast = () => {
    const convo = messagesRef.current;
    if (!convo.length || isChatLoading) return;
    const lastUser = [...convo].reverse().find((m) => m.role === "user");
    // Only a conversation whose last word is theirs is waiting on an answer.
    if (convo[convo.length - 1].role !== "user") { setChatError(false); return; }
    askPlanner(convo, lastUser?.content || "");
  };

  // Puts the saved plan's steps in (idempotent: steps already saved are
  // skipped), then the first step on the task list.
  const saveSteps = async (goalId, steps) => {
    setStepsFailed(false);
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        const res = await base44.functions.invoke("createRemainingGoalSteps", { goal_id: goalId, steps, start_order_index: 0 });
        ok = res?.data?.ok === true || ((res?.data?.created || 0) + (res?.data?.skipped || 0)) >= steps.length;
      } catch (e) {
        console.error("[Planner] saving steps failed:", e);
      }
    }
    if (!ok) {
      setStepsFailed(true);
      return;
    }
    setFirstTwoMonthsReady(true);
    notifyGoalsChanged();
    if (user) runGoalSync(user);
  };

  const handleSaveNewGoal = async (retryCount = 0) => {
    setIsSaving(true);
    setSaveError(false);
    try {
      const allMessages = messagesRef.current.filter((m) => m.role !== "system");
      const res = await base44.functions.invoke("goalPlannerChat", {
        messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
        mode: "extract_plan",
        tz: deviceTz(),
      });
      if (res?.data?.error) throw new Error(res.data.error);
      const plan = res?.data?.plan;
      if (!plan?.steps || plan.steps.length === 0) throw new Error("No steps found in plan. Please try again.");

      // Month titles from the plan's own text, if the structured answer missed some.
      if (!plan.month_titles || Object.keys(plan.month_titles).length < 3) {
        const monthTitlesFromText = {};
        const lines = allMessages[allMessages.length - 1]?.content?.split("\n") || [];
        for (const line of lines) {
          const monthMatch = line.match(/\*\*Month\s+(\d+)[:\s—–-]+(.+?)\*\*/);
          if (monthMatch) {
            const num = parseInt(monthMatch[1], 10);
            const title = monthMatch[2].trim().replace(/\*+/g, "").trim();
            if (title && !/^month/i.test(title)) monthTitlesFromText[num] = title;
          }
        }
        if (Object.keys(monthTitlesFromText).length > Object.keys(plan.month_titles || {}).length) {
          plan.month_titles = { ...plan.month_titles, ...monthTitlesFromText };
        }
      }

      const goal = await base44.entities.Goal.create({
        title: plan.title,
        description: plan.description,
        plan_summary: plan.plan_summary,
        timeline: plan.timeline,
        target_date: plan.target_date,
        category: plan.category || "personal",
        status: "active",
        preferred_time: plan.preferred_time || null,
        conversation_history: allMessages,
        month_titles: plan.month_titles || {},
        requires_daily_action: plan.requires_daily_action ?? false,
        weekdays_only: plan.weekdays_only ?? false,
        include_weekend_reminders: plan.include_weekend_reminders ?? true,
        habit_days_of_week: plan.habit_days_of_week ?? [],
        start_date: plan.start_date || null,
      });

      setPendingGoalId(goal.id);
      setIsSaving(false);
      setSaved(true);
      setShowCelebration(true);
      clearSession();
      setGoals((prev) => [goal, ...prev]);

      if (plan.month_titles && Object.keys(plan.month_titles).length > 0) {
        setMessages((prev) => prev.map((m, i) =>
          i === prev.length - 1 && m.role === "assistant" ? { ...m, goalMonthTitles: { ...plan.month_titles } } : m
        ));
      }

      savedStepsRef.current = { goalId: goal.id, steps: plan.steps };
      saveSteps(goal.id, plan.steps);
    } catch (err) {
      if (retryCount < 3) {
        toast({ title: "Something went wrong", description: "Retrying in a moment..." });
        setTimeout(() => handleSaveNewGoal(retryCount + 1), 2000);
      } else {
        toast({ title: "Error saving goal", description: "Please try again.", variant: "destructive" });
        setIsSaving(false);
        setSaveError(true);
      }
    }
  };

  const handleApplyEdits = async (retryCount = 0) => {
    setIsSaving(true);
    setSaveError(false);
    try {
      const allMessages = messagesRef.current.filter((m) => m.role !== "system");
      const gid = pendingGoalId || editingGoal?.id;
      if (gid) await base44.entities.Goal.update(gid, { conversation_history: allMessages });
      const res = await base44.functions.invoke("goalPlannerChat", {
        messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
        mode: "apply_edit",
        goal_id: gid,
        tz: deviceTz(),
      });
      if (res?.data?.error || res?.data?.success === false) throw new Error(res?.data?.error || "Edit not applied");
      setIsSaving(false);
      setSaved(true);
      clearSession();
      notifyGoalsChanged();
      if (user) runGoalSync(user);
    } catch (err) {
      if (retryCount < 3) {
        toast({ title: "Something went wrong", description: "Retrying in a moment..." });
        setTimeout(() => handleApplyEdits(retryCount + 1), 2000);
      } else {
        toast({ title: "Error applying changes", description: "Please try again.", variant: "destructive" });
        setIsSaving(false);
        setSaveError(true);
      }
    }
  };

  const isEmpty = messages.length === 0;
  const activeGoals = goals.filter((g) => g.status === "active");
  const hasSavedSession = (readSession()?.messages?.length || 0) > 0;
  const showGoalsList = goalsLoaded && activeGoals.length > 0 && !editingGoal && isEmpty && !hasSavedSession && !forceNew;
  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";
  const lastMsg = messages[messages.length - 1];
  // The plan in the last answer isn't finished: no "Looks good" until it is.
  const planUnfinished = continuing || (lastMsg?.role === "assistant" && lastMsg.planIncomplete === true);

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 pt-4 space-y-4">
        {/* Header */}
        <div className={`rounded-2xl px-4 py-3 ${L.card}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className={`text-base font-bold leading-none truncate ${L.title}`}>
                  {editingGoal ? `Editing: ${editingGoal.title}` : showGoalsList ? "My Goals" : "Planner"}
                </h1>
                <p className={`text-[11px] mt-0.5 ${L.muted}`}>
                  {editingGoal ? "Evolve your goal" : showGoalsList ? "Click to adjust" : "AI-powered goal planning"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(editingGoal || messages.length > 0) && (
                <Button variant="ghost" size="sm" onClick={handleNewPlan} disabled={isSaving || isChatLoading || continuing} className={`text-xs h-7 px-3 rounded-full ${L.soft}`}>
                  {editingGoal ? "Back" : "New"}
                </Button>
              )}
              <Button variant="ghost" size="sm" disabled={isSaving || isChatLoading} className={`text-xs h-7 px-3 rounded-full ${L.soft}`} onClick={() => navigate("/Goals")}>
                <Target className="w-3 h-3 mr-1" />
                Goals
              </Button>
            </div>
          </div>
        </div>

        {showGoalsList ? (
          <GoalsList goals={activeGoals} onSelectGoal={startEditSession} onNewChat={startFreshPlan} L={L} />
        ) : isEmpty ? (
          <EmptyState onExampleClick={sendMessage} L={L} />
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} L={L} onExampleClick={i === 0 ? sendMessage : null} />
            ))}

            {isChatLoading && <TypingIndicator isDrafting={isDraftingFirstPlan} L={L} />}

            {planUnfinished && !isChatLoading && (
              <PlanProgress msg={lastMsg} writing={continuing} onKeepWriting={() => continueWriting()} L={L} />
            )}

            {chatError && !isChatLoading && lastIsUser && (
              <div className={`rounded-2xl px-4 py-3 flex items-center justify-between gap-3 ${L.card}`}>
                <p className={`text-sm ${L.danger}`}>Couldn't reach the planner. Your conversation is saved.</p>
                <Button size="sm" onClick={retryLast} className={`rounded-xl text-xs font-semibold ${L.primary}`}>
                  <RotateCw className="w-3.5 h-3.5 mr-1" /> Try again
                </Button>
              </div>
            )}

            {/* 2-step approval flow */}
            {pendingAction === "plan_proposed" && !planUnfinished && !isChatLoading && !saved && !editingGoal && !showCelebration && !showApprovalModal && (
              <div className="flex flex-col items-center gap-3 pt-4 pb-4">
                <Button onClick={() => setShowApprovalModal(true)} className={`rounded-2xl px-6 py-2.5 font-semibold shadow-lg ${L.primary}`}>
                  <Check className="w-4 h-4 mr-2" />
                  Looks good
                </Button>
                <Button variant="outline" onClick={() => sendMessage("I'd like to work on it some more")} className={`rounded-2xl px-6 py-2.5 border-2 font-semibold ${L.outline}`}>
                  I'd like to work on it some more
                </Button>
              </div>
            )}

            {/* Create Plan confirmation */}
            {showApprovalModal && !planUnfinished && !saved && !showCelebration && (
              <div className={`flex flex-col items-center gap-3 pt-4 pb-4 border-t-2 border-dashed mt-4 ${L.dark ? "border-gray-700" : "border-gray-300"}`}>
                <p className={`text-sm font-medium ${L.text}`}>Create your plan now?</p>
                <Button onClick={() => { setShowCelebration(true); handleSaveNewGoal(); }} className="rounded-2xl px-6 py-2.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
                  <Check className="w-4 h-4 mr-2" />
                  Create Plan
                </Button>
                <Button variant="outline" onClick={() => setShowApprovalModal(false)} className={`rounded-2xl px-6 py-2.5 border-2 font-semibold ${L.outline}`}>
                  Go Back
                </Button>
              </div>
            )}

            {/* Edit session: the planner wrote a revised plan */}
            {pendingAction === "plan_proposed" && !planUnfinished && !isChatLoading && !saved && editingGoal && !showCelebration && (
              <div className="flex flex-col items-center gap-3 pt-4 pb-4">
                <Button onClick={() => { setPendingGoalId(editingGoal.id); setShowCelebration(true); handleApplyEdits(); }} className="rounded-2xl px-6 py-2.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
                  <Check className="w-4 h-4 mr-2" />
                  Looks good! Apply changes
                </Button>
                <Button variant="outline" onClick={() => sendMessage("I'd like to adjust it some more")} className={`rounded-2xl px-6 py-2.5 border-2 font-semibold ${L.outline}`}>
                  I'd like to adjust it some more
                </Button>
              </div>
            )}

            {/* Saving state — both new and edit */}
            {showCelebration && !saved && (
              <>
                {isSaving ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <SavingProgressBar isEdit={!!editingGoal} L={L} />
                  </div>
                ) : saveError ? (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <p className={`text-sm font-medium ${L.danger}`}>Something went wrong saving your goal.</p>
                    <Button onClick={() => (editingGoal ? handleApplyEdits() : handleSaveNewGoal())} className={`rounded-2xl px-6 py-2.5 font-semibold ${L.primary}`}>
                      Retry
                    </Button>
                  </div>
                ) : null}
              </>
            )}

            {/* Edit approval */}
            {pendingAction === "edit_approved" && !saved && !showCelebration && (
              <div className="flex justify-center py-2">
                {isSaving ? (
                  <SavingProgressBar isEdit L={L} />
                ) : (
                  <Button onClick={() => { setPendingGoalId(editingGoal?.id || pendingGoalId); setShowCelebration(true); handleApplyEdits(); }} className="rounded-2xl px-6 py-2.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
                    <Check className="w-4 h-4 mr-2" />Looks good! Apply changes
                  </Button>
                )}
              </div>
            )}

            {saved && (
              <div className="flex flex-col items-center gap-3 py-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {(pendingAction === "edit_approved" || editingGoal) ? (
                  <>
                    <div className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold border ${L.rowDone} ${L.dark ? "text-green-400" : "text-green-700"}`}>
                      <Check className="w-4 h-4" />
                      Changes applied!
                    </div>
                    <Button size="sm" className={`rounded-xl text-xs font-semibold ${L.primary}`} onClick={() => navigate(`/goal/${pendingGoalId || editingGoal?.id}`)}>
                      Go to Goal →
                    </Button>
                  </>
                ) : (
                  <>
                    <div className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold border ${L.rowDone} ${L.dark ? "text-green-400" : "text-green-700"}`}>
                      <Check className="w-4 h-4" />
                      Goal created! 🎉
                    </div>
                    <div className={`rounded-2xl px-5 py-4 max-w-sm text-center ${L.card}`}>
                      <p className={`text-sm font-medium mb-1 ${L.accent}`}>Your plan is a living document 🌱</p>
                      <p className={`text-xs leading-relaxed mb-3 ${L.soft}`}>Come back anytime to adjust difficulty, add resources, skip ahead, extend the timeline, or completely restructure a phase. Just tell me what's working and what isn't.</p>
                      {stepsFailed ? (
                        <div className="space-y-2">
                          <p className={`text-xs ${L.danger}`}>Your plan's steps didn't save.</p>
                          <Button size="sm" className={`rounded-xl text-xs font-semibold ${L.primary}`} onClick={() => savedStepsRef.current && saveSteps(savedStepsRef.current.goalId, savedStepsRef.current.steps)}>
                            <RotateCw className="w-3.5 h-3.5 mr-1" /> Try again
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-center">
                          <Button size="sm" disabled={!firstTwoMonthsReady} className={`rounded-xl text-xs font-semibold ${!firstTwoMonthsReady ? "opacity-50 cursor-not-allowed" : ""} ${L.primary}`} onClick={() => navigate(`/goal/${pendingGoalId}`)}>
                            {firstTwoMonthsReady ? "Go to Goal →" : "Loading plan…"}
                          </Button>
                          <Button size="sm" variant="outline" className={`rounded-xl text-xs font-semibold ${L.outline}`} onClick={handleNewPlan}>
                            Plan Another
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input bar */}
      <div className={`sticky bottom-0 z-20 mt-4 backdrop-blur-lg px-4 py-3 ${L.bar}`} style={{ paddingBottom: "max(0.75rem, calc(0.75rem + env(safe-area-inset-bottom)))" }}>
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <div className="flex-shrink-0">
            <VoiceTaskInput onTranscription={(text) => sendMessage(text)} theme={theme} />
          </div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            // Enter makes a new line; only the send button sends (Anna, Nov 1
            // 2026: "make it so that the enter button creates a new line and
            // doesn't send the message").
            placeholder={
              editingGoal
                ? `What changes do you want for "${editingGoal.title}"?`
                : isEmpty
                  ? "Tell me your goal… e.g. 'I want to learn Spanish in 5 months'"
                  : "Continue the conversation…"
            }
            className={`flex-1 min-h-[56px] max-h-64 text-sm resize-none rounded-2xl ${L.input}`}
            disabled={isChatLoading || continuing}
            rows={1}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isChatLoading || continuing}
            aria-label="Send"
            className="w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md transition-all disabled:opacity-40 disabled:shadow-none"
          >
            {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onExampleClick, L }) {
  const examples = [
    "I want to learn Spanish in 5 months",
    "Run a 5K in 3 months",
    "Launch a side business this year",
    "Read 24 books this year",
  ];
  return (
    <div className={`flex flex-col items-center justify-center py-10 px-6 text-center rounded-2xl ${L.card}`}>
      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-sm ${L.chip}`}>
        <Sparkles className="w-10 h-10" />
      </div>
      <h2 className={`text-2xl font-bold mb-2 ${L.title}`}>What's your goal?</h2>
      <p className={`text-sm max-w-xs leading-relaxed mb-8 ${L.muted}`}>
        Describe your goal and I'll build a detailed, phased plan with milestones to get you there.
      </p>
      <div className="space-y-2 w-full max-w-xs">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => onExampleClick(ex)}
            className={`w-full border rounded-xl px-4 py-2.5 text-sm text-left transition-all ${L.row} ${L.soft}`}
          >
            "{ex}"
          </button>
        ))}
      </div>
    </div>
  );
}

function renderInlineText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = String(text || "").split(/(\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g);
  const cleanUrl = (url) => url.replace(/[.,;:!?)]+$/, "");
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.match(urlRegex)) {
      const href = cleanUrl(part);
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity font-semibold break-all">{href}</a>
      );
    }
    return part;
  });
}

function renderPreamble(text) {
  const lines = text.split("\n").map((l) => l
    .replace(/^#{1,6}\s+/, "")
    .replace(/^---+$/, "")
    .replace(/\*\*/g, "")
    .trim()
  ).filter((l) => l.length > 0);
  return lines.join("\n");
}

// Plan text → Month > Week > tasks (verbatim from the Goals app).
function parsePlanHierarchy(text, goalMonthTitles = {}) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
  const months = [];
  let currentMonth = null;
  let currentWeek = null;
  const preamble = [];

  const isCombinedHeader = (l) => /Month\s+\d+[,\s]+Week\s+\d+/i.test(l.replace(/\*\*/g, ""));
  const isPureMonthHeader = (l) => /^(#{1,4}\s+)?(\*\*)?Month\s+\d+(\*\*)?(?:[:\s-].*)?$/i.test(l.replace(/\*\*/g, "").trim());
  const isPureWeekHeader = (l) => /^(#{1,4}\s+)?(\*\*)?Week\s+\d+(\*\*)?[:\s-]*/i.test(l.replace(/\*\*/g, "").trim()) && !/Month/i.test(l);
  const isTaskLine = (l) => /^[-•*]\s+/.test(l) || /^\d+\.\s+/.test(l) || /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Day\s*\d+)/i.test(l);
  const cleanHeader = (l) => l.replace(/^#{1,4}\s+/, "").replace(/\*\*/g, "").replace(/\*/g, "").replace(/:$/, "").trim();
  const cleanTask = (l) => l.replace(/^[-•*]\s+/, "").replace(/^\d+\.\s+/, "").replace(/\*\*/g, "").replace(/\*/g, "").trim();

  const getOrCreateMonth = (mNum) => {
    const mTitle = `Month ${mNum}`;
    let month = months.find((m) => m.title === mTitle);
    if (!month) {
      month = { title: mTitle, weeks: [] };
      months.push(month);
    }
    return month;
  };

  let prevLineWasMonthHeader = false;
  for (const line of lines) {
    if (isCombinedHeader(line)) {
      prevLineWasMonthHeader = false;
      const mNum = line.match(/Month\s+(\d+)/i)?.[1];
      if (mNum) {
        currentMonth = getOrCreateMonth(mNum);
        currentWeek = { title: cleanHeader(line), tasks: [] };
        currentMonth.weeks.push(currentWeek);
      }
    } else if (isPureMonthHeader(line)) {
      const mNum = line.match(/Month\s+(\d+)/i)?.[1];
      if (mNum) {
        currentMonth = getOrCreateMonth(mNum);
        const subtitle = cleanHeader(line).replace(/^Month\s+\d+\s*[-–—:]\s*/i, "").trim();
        const isDateOnly = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(subtitle);
        if (subtitle && !isDateOnly && !/^Month\s+\d+$/i.test(subtitle)) currentMonth.subtitle = subtitle;
        currentWeek = null;
        prevLineWasMonthHeader = true;
      }
    } else if (isPureWeekHeader(line)) {
      prevLineWasMonthHeader = false;
      if (currentMonth) {
        const weekTitle = cleanHeader(line).replace(/:\s*$/, "").trim();
        currentWeek = { title: weekTitle, tasks: [] };
        currentMonth.weeks.push(currentWeek);
      }
    } else if (isTaskLine(line)) {
      prevLineWasMonthHeader = false;
      const task = cleanTask(line);
      if (!task) continue;
      if (currentWeek) {
        currentWeek.tasks.push(task);
      } else if (currentMonth) {
        currentWeek = { title: "Tasks", tasks: [] };
        currentMonth.weeks.push(currentWeek);
        currentWeek.tasks.push(task);
      }
    } else {
      if (prevLineWasMonthHeader && currentMonth && !currentMonth.subtitle) {
        const candidateSubtitle = line.replace(/\*+/g, "").replace(/^[-–—:]\s*/, "").trim();
        const isDateOnly = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(candidateSubtitle);
        const isTooLong = candidateSubtitle.length > 80;
        if (candidateSubtitle && !isDateOnly && !isTooLong) currentMonth.subtitle = candidateSubtitle;
      }
      prevLineWasMonthHeader = false;
      if (months.length === 0) preamble.push(line);
      if (currentWeek && line.trim().length > 3) {
        const cleanLine = line.trim().replace(/^#{1,4}\s+/, "").replace(/\*\*/g, "").replace(/\*/g, "").replace(/^---+$/, "").trim();
        if (cleanLine) currentWeek.description = (currentWeek.description ? currentWeek.description + " " : "") + cleanLine;
      }
    }
  }

  for (const month of months) {
    const hasExplicitWeeks = month.weeks.some((w) => /^Week\s+\d+/i.test(w.title));
    if (!hasExplicitWeeks) {
      const allTasks = month.weeks.flatMap((w) => w.tasks);
      const desc = month.weeks[0]?.description || "";
      month.weeks = [1, 2, 3, 4].map((n, idx) => ({
        title: "Week " + n,
        tasks: allTasks.filter((_, i) => i % 4 === idx),
        description: idx === 0 ? desc : "",
      }));
    } else if (month.weeks.length > 4) {
      month.weeks = month.weeks.slice(0, 4);
    }
  }

  // The Goals app padded empty month cards up to the plan's length here, so a
  // plan the time ran out on looked finished with empty months (Anna, Nov 1
  // 2026: months 15+ empty). Only the months written are shown; an unfinished
  // plan shows how far it got and "Keep writing" (PlanProgress).

  for (const month of months) {
    const mNum = month.title.match(/\d+/)?.[0];
    if (mNum && !month.subtitle) {
      const rawTitle = goalMonthTitles[mNum] || goalMonthTitles[parseInt(mNum)];
      if (rawTitle) month.subtitle = String(rawTitle).replace(/^\d+:\s*/, "").replace(/\*+/g, "").trim();
    }
  }

  months.sort((a, b) => parseInt(a.title.match(/\d+/)?.[0] || 999) - parseInt(b.title.match(/\d+/)?.[0] || 999));
  return { months, preamble: preamble.join("\n") };
}

// How long the plan is, by its own month titles only (for "months X-Y
// aren't written yet"). Not its free text: the Goals app took the first
// "<number> month" in it, which can grab the wrong number (a year right
// before the word "Month" reads as 2028, capped to 36), and padded the plan
// view up to it (Anna, Nov 1 2026: a 14-month plan showed Months 15-36
// empty). The server says how long the plan is (months_total).
function planLength(text, goalMonthTitles = {}) {
  const titleNums = Object.keys(goalMonthTitles || {}).map((k) => parseInt(k, 10)).filter((n) => !isNaN(n));
  return Math.min(36, titleNums.length ? Math.max(...titleNums) : 0);
}

// Months 1..N written with something in them, in a row.
function monthsWritten(text) {
  const { months } = parsePlanHierarchy(String(text || ""));
  const nums = new Set(months
    .filter((m) => m.weeks.some((w) => w.tasks.length > 0))
    .map((m) => parseInt(m.title.match(/\d+/)?.[0] || "0", 10)));
  let n = 0;
  while (nums.has(n + 1)) n++;
  return n;
}

// The last answer is a plan that isn't finished: the planner said so, or (a
// chat saved before Nov 1 2026) it ends with the old "continue expanding any
// remaining months" line. Never by counting "N month" words in it, which
// made a finished 14-month plan look 36 months long.
function planNeedsWriting(msgs) {
  const last = msgs?.[msgs.length - 1];
  if (!last || last.role !== "assistant") return false;
  if (last.planIncomplete === true) return true;
  if (last.planIncomplete === false) return false;
  const text = String(last.content || "");
  if (!/Month\s+\d+/i.test(text) || !/Week\s+\d+/i.test(text)) return false;
  return /continue expanding any remaining months/i.test(text);
}

// A long plan being written, or stopped before its last month.
function PlanProgress({ msg, writing, onKeepWriting, L }) {
  const from = (Number(msg?.monthsDone) || 0) + 1;
  const to = Number(msg?.monthsTotal) || 0;
  const range = to >= from ? (to === from ? `month ${from}` : `months ${from}–${to}`) : null;
  if (writing) {
    return (
      <div className={`rounded-2xl px-4 py-3 flex items-center gap-2 ${L.card}`}>
        <Loader2 className={`w-4 h-4 animate-spin flex-shrink-0 ${L.accent}`} />
        <p className={`text-sm ${L.soft}`}>{range ? `Writing ${range}…` : "Writing the rest of your plan…"}</p>
      </div>
    );
  }
  return (
    <div className={`rounded-2xl px-4 py-3 flex items-center justify-between gap-3 ${L.card}`}>
      <p className={`text-sm ${L.text}`}>
        {range ? `Your plan isn't finished: ${range} ${to === from ? "isn't" : "aren't"} written yet.` : "Your plan isn't finished yet."}
      </p>
      <Button size="sm" onClick={onKeepWriting} className={`rounded-xl text-xs font-semibold flex-shrink-0 ${L.primary}`}>
        <RotateCw className="w-3.5 h-3.5 mr-1" /> Keep writing
      </Button>
    </div>
  );
}

function WeekDropdown({ week, L }) {
  const [open, setOpen] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  return (
    <div className={`border rounded-xl overflow-hidden mb-1.5 ${L.row}`}>
      <div className="flex items-center">
        <button onClick={(e) => { e.stopPropagation(); setChecked((v) => !v); }} className="pl-3 pr-1 py-2.5 flex-shrink-0" aria-label="Mark week">
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${checked ? "bg-violet-500 border-violet-500" : L.dark ? "border-gray-600" : "border-gray-300"}`}>
            {checked && <Check className="w-2.5 h-2.5 text-white" />}
          </div>
        </button>
        <button onClick={() => setOpen((v) => !v)} className="flex-1 flex items-center gap-2 px-2 py-2.5 text-left">
          <span className={`font-medium text-xs flex-1 ${checked ? `line-through ${L.muted}` : L.text}`}>{week.title}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${L.muted} ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className={`px-4 pb-3 pt-2 border-t ${L.panel}`}>
          {week.description && <p className={`text-xs leading-relaxed mb-2 italic ${L.soft}`}>{week.description}</p>}
          {week.tasks.length > 0 ? (
            <ul className="space-y-1">
              {week.tasks.map((task, i) => (
                <li key={i} className={`text-xs leading-relaxed flex gap-1.5 ${L.text}`}>
                  <span className="mt-0.5 text-violet-400">•</span>
                  <span>{task}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`text-xs italic ${L.muted}`}>Activities for this week</p>
          )}
        </div>
      )}
    </div>
  );
}

function MonthDropdown({ month, L }) {
  const [open, setOpen] = React.useState(false);
  const cleanSubtitle = (s) => {
    if (!s) return s;
    const m = s.match(/\(e\.g\.,\s*\\?"(.+?)\\?"\s*by\s+(.+?)\)/i);
    if (m) return `${m[1]} by ${m[2]}`.trim();
    return s;
  };
  const displayTitle = cleanSubtitle(month.subtitle);
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const monthMatch = month.subtitle?.match(/\((january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})?\)/i);
  let dateRange = null;
  if (monthMatch) {
    const mIdx = monthNames.indexOf(monthMatch[1].toLowerCase());
    const year = monthMatch[2] ? parseInt(monthMatch[2]) : new Date().getFullYear();
    const start = new Date(year, mIdx, 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 27);
    const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dateRange = `${fmt(start)} - ${fmt(end)}`;
  }
  return (
    <div className={`rounded-xl mb-2 overflow-hidden border shadow-sm ${L.row}`}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <div className="w-1.5 h-5 bg-violet-500 rounded-full flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`font-bold text-sm ${L.title}`}>{month.title}</span>
            {displayTitle && <span className={`text-sm font-medium ${L.accent}`}>— {displayTitle}</span>}
          </div>
          <p className={`text-xs mt-0.5 ${L.muted}`}>{month.weeks.length} weeks{dateRange && <span className="ml-1">· {dateRange}</span>}</p>
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${L.muted} ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`border-t px-3 py-2 space-y-1.5 ${L.panel}`}>
          {month.weeks.map((week, i) => <WeekDropdown key={i} week={week} L={L} />)}
        </div>
      )}
    </div>
  );
}

function PlanView({ text, goalMonthTitles = {}, L }) {
  const [showMarkdown, setShowMarkdown] = React.useState(false);
  const { months, preamble } = parsePlanHierarchy(text, goalMonthTitles);
  const cleanedPreamble = preamble ? renderPreamble(preamble) : "";
  const toggle = `text-xs px-2 py-1 rounded mb-2 border ${L.row} ${L.soft}`;
  if (showMarkdown) {
    return (
      <div>
        <button onClick={() => setShowMarkdown(false)} className={toggle}>Show Plan View</button>
        <pre className={`text-xs leading-relaxed overflow-auto p-3 rounded-lg whitespace-pre-wrap border ${L.panel} ${L.text}`} style={{ maxHeight: "400px" }}>{text}</pre>
      </div>
    );
  }
  return (
    <div>
      <button onClick={() => setShowMarkdown(true)} className={toggle}>Show Markdown</button>
      {cleanedPreamble && <p className="text-sm leading-relaxed mb-3 whitespace-pre-wrap">{renderInlineText(cleanedPreamble)}</p>}
      {months.length > 0
        ? months.map((month, i) => <MonthDropdown key={i} month={month} L={L} />)
        : <span className="whitespace-pre-wrap text-sm">{renderInlineText(text)}</span>}
    </div>
  );
}

function MessageBubble({ msg, onExampleClick, L }) {
  const isUser = msg.role === "user";
  const isPlanMessage = (text) => /Month\s+\d+/i.test(text) && /Week\s+\d+/i.test(text);

  const renderMarkdown = (text) => {
    const lines = String(text || "").split("\n");
    const elements = [];
    lines.forEach((line, idx) => {
      if (line.startsWith("###")) {
        elements.push(<h3 key={`h3-${idx}`} className="font-bold text-sm mt-2">{line.replace(/^#+\s*/, "")}</h3>);
      } else if (line.startsWith("##")) {
        elements.push(<h4 key={`h2-${idx}`} className="font-bold text-base mt-2">{line.replace(/^#+\s*/, "")}</h4>);
      } else if (line.startsWith("#")) {
        elements.push(<h4 key={`h1-${idx}`} className="font-bold text-lg mt-2">{line.replace(/^#+\s*/, "")}</h4>);
      } else if (line.trim()) {
        const parts = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|-\s)/g);
        const jsxParts = parts.map((part, i) => {
          if (!part) return null;
          if (part.startsWith("**") && part.endsWith("**")) return <strong key={`b-${i}`}>{part.slice(2, -2)}</strong>;
          const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (link) return <a key={`l-${i}`} href={link[2]} className="text-blue-500 underline" target="_blank" rel="noopener noreferrer">{link[1]}</a>;
          if (part === "- ") return null;
          return <span key={`t-${i}`}>{part}</span>;
        });
        if (line.startsWith("-")) elements.push(<li key={`li-${idx}`} className="ml-4 text-sm">{jsxParts}</li>);
        else elements.push(<p key={`p-${idx}`} className="text-sm">{jsxParts}</p>);
      } else if (idx > 0) {
        elements.push(<div key={`br-${idx}`} className="h-2" />);
      }
    });
    return <div className="space-y-1">{elements}</div>;
  };

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div className={`flex ${isUser ? "justify-end" : "justify-start"} w-full`}>
        {!isUser && (
          <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 flex-shrink-0 mt-1 shadow-sm bg-gradient-to-br from-violet-500 to-indigo-600">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        <div className={`max-w-[88%] min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed break-words ${isUser ? `${L.bubbleMe} rounded-br-sm shadow-md` : `${L.bubbleAi} rounded-bl-sm shadow-sm`}`}>
          {isUser ? renderInlineText(msg.content) : (
            isPlanMessage(msg.content)
              ? <PlanView text={msg.content} goalMonthTitles={msg.goalMonthTitles || {}} L={L} />
              : renderMarkdown(msg.content)
          )}
        </div>
      </div>
      {!isUser && msg.editExamples && onExampleClick && (
        <div className="ml-9 mt-2 flex flex-wrap gap-2 max-w-[88%]">
          {msg.editExamples.map((ex) => (
            <button key={ex} onClick={() => onExampleClick(ex)} className={`text-xs px-3 py-1.5 rounded-full border transition-all ${L.row} ${L.soft}`}>
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SavingProgressBar({ isEdit = false, L }) {
  const newGoalSteps = [
    { label: "Classifying your goal…", target: 8 },
    { label: "Structuring the timeline…", target: 18 },
    { label: "Building monthly milestones…", target: 32 },
    { label: "Adding resources and guidance…", target: 48 },
    { label: "Setting up success criteria…", target: 62 },
    { label: "Writing your step-by-step plan…", target: 76 },
    { label: "Finalizing all phases…", target: 88 },
    { label: "Almost done…", target: 94 },
  ];
  const editSteps = [
    { label: "Reading your requested changes…", target: 15 },
    { label: "Updating milestones…", target: 40 },
    { label: "Applying your edits…", target: 70 },
    { label: "Almost done…", target: 90 },
  ];
  const steps = isEdit ? editSteps : newGoalSteps;
  const [progress, setProgress] = React.useState(2);
  React.useEffect(() => {
    const totalDuration = isEdit ? 10000 : 12000;
    const sliceDuration = totalDuration / steps.length;
    let currentStep = 0;
    const stepTimer = setInterval(() => { currentStep = Math.min(currentStep + 1, steps.length - 1); }, sliceDuration);
    const progressTimer = setInterval(() => {
      setProgress((p) => {
        const targetP = steps[Math.min(currentStep, steps.length - 1)].target;
        if (p >= targetP) return p;
        const gap = targetP - p;
        return Math.min(p + Math.max(0.5, gap * 0.08), targetP);
      });
    }, 300);
    return () => { clearInterval(stepTimer); clearInterval(progressTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`w-full max-w-sm rounded-2xl px-5 py-4 shadow-md ${L.card}`}>
      <div className={`h-2 rounded-full overflow-hidden ${L.track}`}>
        <div className={`h-full rounded-full transition-all duration-1000 ease-out ${L.fill}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function TypingIndicator({ isDrafting = false, L }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-full flex items-center justify-center shadow-sm flex-shrink-0 mt-1 bg-gradient-to-br from-violet-500 to-indigo-600">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div className={`rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm ${L.bubbleAi}`}>
        <div className="flex gap-1 items-center mb-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        {isDrafting && <p className={`text-xs mt-1.5 ${L.muted}`}>Drafting your plan, this may take a moment…</p>}
      </div>
    </div>
  );
}

function GoalsList({ goals, onSelectGoal, onNewChat, L }) {
  return (
    <div className={`flex flex-col items-center py-10 px-6 rounded-2xl ${L.card}`}>
      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-sm ${L.chip}`}>
        <Target className="w-10 h-10" />
      </div>
      <h2 className={`text-2xl font-bold mb-2 ${L.title}`}>Your Goals</h2>
      <p className={`text-sm max-w-xs leading-relaxed mb-8 text-center ${L.muted}`}>
        Click any goal to refine, extend, or adjust your plan.
      </p>
      <div className="w-full max-w-sm space-y-3 mb-8">
        {goals.map((goal) => (
          <button key={goal.id} onClick={() => onSelectGoal(goal)} className={`w-full border rounded-xl px-4 py-3.5 text-left transition-all group ${L.row}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm truncate ${L.title}`}>{goal.title}</p>
                <p className={`text-xs mt-1 line-clamp-1 ${L.muted}`}>{goal.timeline || "Timeline TBD"}</p>
              </div>
              <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 ${L.muted}`} />
            </div>
          </button>
        ))}
      </div>
      <Button onClick={onNewChat} className={`rounded-2xl px-6 py-2.5 font-semibold shadow-lg ${L.primary}`}>
        <Plus className="w-4 h-4 mr-2" />
        Plan New Goal
      </Button>
    </div>
  );
}
