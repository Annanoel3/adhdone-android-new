// Tasks the user has spoken/typed that are still being parsed by the AI.
// Lives outside React so the queue survives navigation — the user is sent
// straight back Home and sees a placeholder card with a spinner while the
// processing continues in the background.
//
// The queue is ALSO mirrored to localStorage. Parsing runs inside the app and
// takes a few seconds; if the app is closed in the middle of it, the capture
// used to vanish without a trace — the user typed a task, left, and it never
// existed. Anything still in storage when the app next starts was never
// finished, so it goes back on the queue and is finished then.
//
// Three things keep that safe:
//   - OWNER: every stored capture carries the email of the account that made
//     it, and is only ever resumed for that same account.
//   - HEARTBEAT: a capture that a live app is still working on is refreshed
//     every few seconds, so a second tab never mistakes it for an abandoned one.
//   - PROGRESS: the split parts and how many of them are finished are stored,
//     so a resumed capture carries on where it stopped instead of starting over.

const STORAGE_KEY = 'adhdone_pending_captures_v1';
const HEARTBEAT_MS = 15 * 1000;
// No heartbeat for this long means the app that owned the capture is gone.
const ABANDONED_AFTER_MS = 90 * 1000;
// Older than this is dropped rather than resumed — a task surfacing days later
// is more confusing than helpful.
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

let captures = [];
const listeners = new Set();
let heartbeat = null;

const emit = () => {
  const snapshot = [...captures];
  listeners.forEach((fn) => fn(snapshot));
};

// ── Storage (best effort — the in-memory queue works without it) ────────────
function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeStore(list) {
  try {
    if (list.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* storage full or unavailable */ }
}

function persist(capture) {
  const entry = {
    id: capture.id,
    text: capture.text,
    presetDate: capture.presetDate,
    presetDueDateISO: capture.presetDueDateISO,
    ownerEmail: capture.ownerEmail || null,
    parts: capture.parts || null,
    doneCount: capture.doneCount || 0,
    createdAt: capture.createdAt,
    touchedAt: Date.now(),
  };
  writeStore([...readStore().filter((c) => c.id !== capture.id), entry]);
}

function unpersist(id) {
  writeStore(readStore().filter((c) => c.id !== id));
}

function syncHeartbeat() {
  if (captures.length && !heartbeat) {
    heartbeat = setInterval(() => captures.forEach(persist), HEARTBEAT_MS);
  } else if (!captures.length && heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

// Puts this account's unfinished captures — the ones no live app is working on
// any more — back on the queue. Called by the processor once it knows who is
// signed in. A capture that was touched moments ago may belong to another open
// tab, or to this app closed and reopened within seconds, so it is looked at
// again once its heartbeat would have gone quiet.
export function resumeAbandonedCaptures(email) {
  if (!email) return;
  const now = Date.now();
  let recheckIn = null;
  let restored = false;

  for (const entry of readStore()) {
    if (captures.some((c) => c.id === entry.id)) continue;
    // Too old, empty, or never tied to an account: not resumable for anyone.
    if (!entry.text || !entry.ownerEmail || now - (entry.createdAt || 0) > MAX_AGE_MS) {
      unpersist(entry.id);
      continue;
    }
    // Someone else's capture on a shared device: leave it for them.
    if (entry.ownerEmail !== email) continue;

    const quietFor = now - (entry.touchedAt || 0);
    if (quietFor < ABANDONED_AFTER_MS) {
      const wait = ABANDONED_AFTER_MS - quietFor + 1000;
      recheckIn = recheckIn === null ? wait : Math.min(recheckIn, wait);
      continue;
    }
    captures.push({
      id: entry.id,
      text: entry.text,
      presetDate: entry.presetDate ?? null,
      presetDueDateISO: entry.presetDueDateISO ?? null,
      ownerEmail: entry.ownerEmail,
      parts: Array.isArray(entry.parts) ? entry.parts : null,
      doneCount: entry.doneCount || 0,
      createdAt: entry.createdAt || now,
      resumed: true,
      started: false,
    });
    restored = true;
  }

  if (restored) {
    captures.forEach(persist); // take ownership: the heartbeat starts now
    syncHeartbeat();
    emit();
  }
  if (recheckIn !== null) setTimeout(() => resumeAbandonedCaptures(email), recheckIn);
}

// ── Queue API ────────────────────────────────────────────────────────────────
export function subscribeCaptures(fn) {
  listeners.add(fn);
  fn([...captures]);
  return () => listeners.delete(fn);
}

export function enqueueCapture({ text, presetDate = null, presetDueDateISO = null }) {
  const capture = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: text.trim(),
    presetDate,
    presetDueDateISO,
    ownerEmail: null,
    parts: null,
    doneCount: 0,
    createdAt: Date.now(),
    resumed: false,
    started: false,
  };
  captures.push(capture);
  persist(capture);
  syncHeartbeat();
  emit();
  return capture.id;
}

// Stamps every capture that has no owner yet with the signed-in account. The
// processor calls this the moment a capture arrives, so a stored capture can
// always be matched to the account it belongs to.
export function stampCaptureOwner(email) {
  if (!email) return;
  for (const capture of captures) {
    if (capture.ownerEmail) continue;
    capture.ownerEmail = email;
    persist(capture);
  }
}

// Claims the next unprocessed capture (marks it started so it can't be
// picked up twice if the processor re-renders).
export function claimNextCapture() {
  const next = captures.find((c) => !c.started);
  if (next) next.started = true;
  return next;
}

// Remembers how a capture was split and how many parts are finished, so a
// resumed capture carries on from the part that was interrupted.
export function saveCaptureProgress(id, { parts, doneCount }) {
  const capture = captures.find((c) => c.id === id);
  if (!capture) return;
  if (parts) capture.parts = parts;
  if (typeof doneCount === 'number') capture.doneCount = doneCount;
  persist(capture);
}

export function removeCapture(id) {
  captures = captures.filter((c) => c.id !== id);
  unpersist(id);
  syncHeartbeat();
  emit();
}