import { base44 } from "@/api/base44Client";

// The planner chat in progress. Saved on this device (localStorage
// plannerInProgress, as before) AND to the account (entity GoalPlannerDraft,
// one row per person), so it comes back on any phone (Anna, Nov 1 2026: "yes
// make it save to the account").
// - One row: the newest one is found and updated; a row is created only when
//   there is none.
// - Two devices: the newest updated_at wins. A save older than what the
//   account already has is dropped.
// - A finished chat (a goal saved, a fresh start, Dismiss on My Goals) is
//   marked completed, never deleted, and never restored.
// - The account copy is best effort: a failed call never blocks the chat and
//   never touches what's saved on the device.

export const SESSION_KEY = "plannerInProgress";

// When a session (device or account) was last changed, in ms (0 = unknown).
// Device sessions saved before Nov 1 2026 only have startedAt, which was
// re-stamped on every save.
export function sessionTime(s) {
  const t = Date.parse(s?.updated_at || s?.startedAt || "");
  return Number.isFinite(t) ? t : 0;
}

export function readLocalSession() {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

export function writeLocalSession(data, { keepTime = false } = {}) {
  const out = { ...data, updated_at: keepTime && data?.updated_at ? data.updated_at : new Date().toISOString() };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(out)); } catch (e) { /* storage unavailable */ }
  return out;
}

export function clearLocalSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* storage unavailable */ }
}

function sessionFromRow(row) {
  return {
    messages: Array.isArray(row?.messages) ? row.messages : [],
    pendingAction: row?.pending_action || null,
    editGoalId: row?.edit_goal_id || null,
    completed: row?.completed === true,
    updated_at: row?.updated_at || row?.updated_date || null,
  };
}

function rowFromSession(s) {
  return {
    messages: Array.isArray(s?.messages) ? s.messages : [],
    pending_action: s?.pendingAction || null,
    edit_goal_id: s?.editGoalId || null,
    completed: s?.completed === true,
    updated_at: s?.updated_at || new Date().toISOString(),
  };
}

async function newestRow() {
  const rows = await base44.entities.GoalPlannerDraft.list("-updated_date", 10);
  const list = Array.isArray(rows) ? [...rows] : [];
  list.sort((a, b) => sessionTime(sessionFromRow(b)) - sessionTime(sessionFromRow(a)));
  return list[0] || null;
}

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(() => resolve(undefined), ms)),
]);

// The account's draft as a session ({ messages, pendingAction, editGoalId,
// completed, updated_at }), or null: none, the call failed, or it took longer
// than timeoutMs (the Planner never waits on the network for long).
export async function loadAccountDraft(timeoutMs = 6000) {
  try {
    const row = await withTimeout(newestRow(), timeoutMs);
    return row ? sessionFromRow(row) : null;
  } catch (e) {
    return null;
  }
}

let queue = Promise.resolve();
let pending = null;
let timer = null;

async function push(row, onlyIfExists) {
  const current = await newestRow();
  // Changed later on another device: that one wins.
  if (current && sessionTime(sessionFromRow(current)) > Date.parse(row.updated_at)) return;
  if (current) await base44.entities.GoalPlannerDraft.update(current.id, row);
  else if (!onlyIfExists) await base44.entities.GoalPlannerDraft.create(row);
}

// Saves are one at a time, in order; only the latest waiting one is sent.
export function flushAccountDraft() {
  clearTimeout(timer);
  timer = null;
  if (!pending) return queue;
  const job = pending;
  pending = null;
  queue = queue
    .then(() => push(job.row, job.onlyIfExists))
    .catch((e) => console.warn("[planner] chat not saved to the account (it's still on this device):", e?.message || e));
  return queue;
}

// The account copy of a device session: right away with `now`, else within
// 2 seconds (a newer save replaces a waiting one).
export function saveAccountDraft(session, { now = false } = {}) {
  if (!session) return;
  pending = { row: rowFromSession(session), onlyIfExists: false };
  if (now) {
    flushAccountDraft();
  } else {
    clearTimeout(timer);
    timer = setTimeout(flushAccountDraft, 2000);
  }
}

// The chat is finished: the account's draft is marked completed (kept, never
// restored). Nothing is created if there is no draft.
export function completeAccountDraft() {
  pending = { row: { completed: true, updated_at: new Date().toISOString() }, onlyIfExists: true };
  flushAccountDraft();
}

// Where the Planner saves the chat: this device first, then the account.
export function persistSession(data, { now = false } = {}) {
  const saved = writeLocalSession({ ...data, completed: false });
  saveAccountDraft(saved, { now });
  return saved;
}
