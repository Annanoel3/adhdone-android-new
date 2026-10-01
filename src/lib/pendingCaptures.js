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
// No heartbeat for this long means the app that owned the capture is gone
// (three missed beats). Until then a stored capture is shown but not claimed.
const ABANDONED_AFTER_MS = 45 * 1000;
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
    fromIdea: capture.fromIdea || null,
    ownerEmail: capture.ownerEmail || null,
    parts: capture.parts || null,
    kind: capture.kind || null,
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
    // A held capture (see resumeAbandonedCaptures) is another app's until it
    // goes quiet; touching it would keep it looking alive forever.
    heartbeat = setInterval(() => captures.filter((c) => !c.held).forEach(persist), HEARTBEAT_MS);
  } else if (!captures.length && heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

const fromEntry = (entry) => ({
  id: entry.id,
  text: entry.text,
  presetDate: entry.presetDate ?? null,
  presetDueDateISO: entry.presetDueDateISO ?? null,
  fromIdea: entry.fromIdea || null,
  ownerEmail: entry.ownerEmail,
  parts: Array.isArray(entry.parts) ? entry.parts : null,
  kind: entry.kind || null,
  doneCount: entry.doneCount || 0,
  createdAt: entry.createdAt || Date.now(),
  resumed: true,
  started: false,
});

// Puts this account's unfinished captures — the ones no live app is working on
// any more — back on the queue. Called by the processor once it knows who is
// signed in. A capture that was touched moments ago may belong to another open
// tab, or to this app closed and reopened within seconds: it is shown right
// away (HELD — on the list as "still setting up", not claimed), and claimed
// once its heartbeat has clearly gone quiet. Before this the card simply
// vanished for that stretch, and a task typed moments earlier looked lost.
export function resumeAbandonedCaptures(email) {
  if (!email) return;
  const now = Date.now();
  let recheckIn = null;
  let changed = false;

  for (const entry of readStore()) {
    const inMemory = captures.find((c) => c.id === entry.id);
    if (inMemory && !inMemory.held) continue;
    // Too old, empty, or never tied to an account: not resumable for anyone.
    if (!entry.text || !entry.ownerEmail || now - (entry.createdAt || 0) > MAX_AGE_MS) {
      unpersist(entry.id);
      if (inMemory) { captures = captures.filter((c) => c !== inMemory); changed = true; }
      continue;
    }
    // Someone else's capture on a shared device: leave it for them.
    if (entry.ownerEmail !== email) continue;

    const quietFor = now - (entry.touchedAt || 0);
    if (quietFor < ABANDONED_AFTER_MS) {
      const wait = ABANDONED_AFTER_MS - quietFor + 1000;
      recheckIn = recheckIn === null ? wait : Math.min(recheckIn, wait);
      if (!inMemory) {
        captures.push({ ...fromEntry(entry), held: true, started: true });
        changed = true;
      }
      continue;
    }
    if (inMemory) {
      inMemory.held = false;
      inMemory.started = false;
    } else {
      captures.push(fromEntry(entry));
    }
    changed = true;
  }

  if (changed) {
    captures.filter((c) => !c.held).forEach(persist); // take ownership: the heartbeat starts now
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

// fromIdea: { id, pictures, notes } when a Parking Lot idea is being turned
// into a task. It goes through the same parser as anything typed in, as ONE
// task (no splitting, no task-or-idea question); its pictures and notes come
// along, and if no task gets made the idea goes back in the Parking Lot.
export function enqueueCapture({ text, presetDate = null, presetDueDateISO = null, fromIdea = null }) {
  const clean = text.trim();
  const capture = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: clean,
    presetDate,
    presetDueDateISO,
    fromIdea,
    ownerEmail: null,
    parts: fromIdea ? [clean] : null,
    kind: null,
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
// picked up twice if the processor re-renders). Skips one that is held for
// another app (above), one waiting out a retry pause, and one waiting for the
// app to be back on screen (see releaseCapture).
export function claimNextCapture() {
  const now = Date.now();
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const next = captures.find((c) =>
    !c.started && !c.held
    && !(c.retryAt && c.retryAt > now)
    && !(c.afterVisible && hidden)
  );
  if (next) {
    next.started = true;
    next.retryAt = null;
    next.afterVisible = false;
  }
  return next;
}

// Gives a capture back to the queue after an attempt that didn't finish —
// the app was sent to the background mid-parse (Android then cuts the
// request), the network was away, or the server failed. Nothing is lost: the
// card stays on the list and the next attempt carries on from the part that
// was interrupted. `afterVisible` waits for the app to be on screen again,
// `retryInMs` waits that long; `counted` says whether this was a real attempt.
export function releaseCapture(id, { retryInMs = 0, afterVisible = false, counted = true, error = '' } = {}) {
  const capture = captures.find((c) => c.id === id);
  if (!capture) return;
  capture.started = false;
  // Lets the processor check for a task this capture already made before the
  // attempt broke off (without the "finishing a task you added earlier" note
  // a resumed capture gets).
  capture.retrying = true;
  if (counted) capture.attempts = (capture.attempts || 0) + 1;
  capture.retryAt = retryInMs > 0 ? Date.now() + retryInMs : null;
  capture.afterVisible = !!afterVisible;
  capture.lastError = String(error || '').slice(0, 200);
  persist(capture);
  emit();
}

// Nothing is pending once every part is finished; the card goes before the
// capture is dropped so it never sits beside the task it became.
export function captureFinished(capture) {
  return Array.isArray(capture?.parts) && capture.parts.length > 0 && (capture.doneCount || 0) >= capture.parts.length;
}

// Remembers what kind of thing a capture turned out to be, how it was split and
// how many parts are finished, so a resumed capture carries on from the part
// that was interrupted without asking the AI again.
export function saveCaptureProgress(id, { parts, doneCount, kind }) {
  const capture = captures.find((c) => c.id === id);
  if (!capture) return;
  if (parts) capture.parts = parts;
  if (kind) capture.kind = kind;
  if (typeof doneCount === 'number') capture.doneCount = doneCount;
  persist(capture);
  emit();
}

export function removeCapture(id) {
  captures = captures.filter((c) => c.id !== id);
  unpersist(id);
  syncHeartbeat();
  emit();
}