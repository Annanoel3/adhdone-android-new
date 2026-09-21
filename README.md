# ADHDone

## STANDING FACTS — read before doing anything

- **Anna always tests on her Android phone (the installed app).** Not the preview, not desktop.
  Any fix that depends on a browser-only capability (popups, `window.open`, `window.closed`,
  new tabs) is invalid by default. She has said this many times.
- **ADHDone is only used as the installed Android app — nobody uses it in a browser.** It is
  still a React web app running inside a WebView, so keep writing normal web code. But anything
  that needs a PHONE capability — the device calendar, the widget, the share sheet, the pinned
  notification — lives in `android/`, which you must not edit, and which needs Anna to build and
  upload a new AAB. When a request needs one of those, say so plainly and stop. Never build a
  web or server workaround to avoid the rebuild: the Google Calendar OAuth path is what that
  workaround looks like, and the outage described below came out of it.
- **A regression must be explained by something that CHANGED.** If it worked three days ago, a
  long-standing setup cannot explain it BY ITSELF — but the change can be on a third party's side
  (Cloudflare, Base44's platform) and land on that setup. Diff recent code first, then prove what
  changed with a test that fails and a test that passes; never guess from architecture.
- **Never tell Anna to contact Base44 support.** 98% of the time it is a problem I created and a
  problem I need to solve. "It's on the platform's side" is not an answer — keep digging until the
  real cause is found and fixed here.
- **Never state something about her data, her users, or app behavior as fact unless it was
  looked up in this session.** Query the entity, read the log, open the file. If it wasn't
  checked, say "I'm guessing — I'd have to look." Do not invent a reason she asked for a change.
- **At the end of every change, list every file you touched — including files Anna did not ask
  about — with one line each on what changed and why.** Base44 keeps no memory between
  conversations, so that list is the only record Anna gets. A change to a file she never
  mentioned (like the 2026-06-26 edit to `src/api/base44Client.js` that broke the app three
  months later) must be called out plainly, never buried in "done".

## Google Calendar connector (was an open issue; resolved 2026-09-20 — see the incident section below)

Google consent completes, but the platform stores no app-user connection:
`getCurrentAppUserConnection` returns no token (sync → 400), some calls → 500.
Another user (s2kap2chick@gmail.com) connected successfully on 2026-09-17, so it worked recently.
**Fixed by replacing the connector (2026-09-19):** the app now runs its OWN Google OAuth —
`googleCalendarConnect` → Google → `googleCalendarCallback` (redirect URI
`https://adhdone.space/functions/googleCalendarCallback`, must stay registered in Google Cloud) →
refresh token stored on the user record → `syncGoogleCalendar` refreshes it per sync. The platform
connector is only a fallback for accounts linked before the switch. Do not restore it.

History of the failure that forced this:

Server logs showed the real failure: `Base44Error: Request failed with status code 403` thrown inside
the function and returned to the app as a 500. `syncGoogleCalendar` now carries a `step` label and
logs `step / name / status / detail` when it fails, so the next failed sync names the exact call
that 403s. **Read that log before changing anything.**

Failed attempts and disproven theories — do not repeat:
1. Removing `prompt=select_account` from the OAuth URL.
2. Revoking the connection before reconnecting (destroys valid tokens).
3. Popup OAuth with retry polling (blocked by COOP; unavailable on Android).
4. **"Different origins (adhdone.space vs base44.app) break the OAuth hand-off."** The connector
   attribution version of this was wrong, and the real cause was not in the calendar code at all —
   but the domain DID matter: the app's calls were going through adhdone.space and Cloudflare blocked
   the functions' call-backs. Read the incident section below before reasoning about domains.
5. **"The sync-lock fields were missing from the User schema, so the lock write failed."** Disproven
   by direct test — Base44 accepts undeclared fields on User without error. (The two fields are now
   documented in the schema anyway, which is correct, but it was NOT the cause.)

## Incident, Sept 18–20 2026: every backend function failing from the app (RESOLVED Sept 20)

What Anna saw: "Connect Google Calendar" threw a 500 on her Android, the consent screen said success
and the Calendar page came back showing nothing connected, and sync kept failing. What was actually
happening was much wider: from the phone, nearly every backend function was failing — calendar
connect and sync, the motivation message, calendar emojis, saving the push player ID, the
notifications-off check (401). Only the calendar part got noticed.

### The mechanism (proven, not theorized)

1. Every backend function starts with `createClientFromRequest(req)`. That client has to call back
   into Base44 for `auth.me()`, entities and integrations. The platform tells it which host to call
   through the `Base44-Api-Url` request header, and it fills that header with whatever host the app
   was opened on.
2. The app is opened on `adhdone.space`, and `adhdone.space` sits behind Cloudflare's proxy (orange
   cloud). Cloudflare answered the function's server-to-server call-back with its bot check — the
   "Just a moment..." page, HTTP 403 — instead of passing it through. So the function could not even
   find out who was calling it: `auth.me()` threw, and the app got a 500 (or a 401 where the code
   catches it). The function logs showed exactly this: `Request failed with status code 403` with the
   challenge HTML.
3. Proof: the same functions, same signed-in user token, called through `https://base44.app/api/...`
   answered 200; called through `https://adhdone.space/api/...` answered 500/401. Every time, not
   intermittently.

### How the app ended up calling through its own domain

Anna's original `src/api/base44Client.js` (her commit, 2025-11-04) passed `serverUrl` from
`src/lib/app-params.js`, which resolves to `https://base44.app`. That was deliberate: the app keeps
working even if the custom domain ever lapses, and it matches Base44's own docs ("The SDK defaults to
`https://base44.app`. You don't need to set this for production use.").

On 2026-06-26, while working on the Google Calendar connect popup, base44-builder[bot] made four
commits to that file in sixteen minutes (33e6c41, fc895ad, 0150914, c3c97be) and the last one
replaced her setting with `serverUrl: ''` — which means "whatever domain the app was opened on".
From then on every entity, function and auth call went through `adhdone.space`. Anna did not ask
for that change and was not told about it.

### Why it kept working from June 26 until September 17

Browser traffic from the app passes Cloudflare fine (real browser, cookies, fingerprint). The
functions' own call-backs also passed until the 18th — calendar syncs succeeded for other users up to
2026-09-17. What flipped on the 18th is on Cloudflare's or Base44's side, not in this code: either
Cloudflare (Bot Fight Mode or a managed rule) started challenging those calls, or the calls started
looking different — function traffic now arrives from `base44-dispatcher-production.base44.workers.dev`
(Cloudflare Workers), which is exactly the kind of source a bot check challenges. Cloudflare's own
docs say Bot Fight Mode "may challenge API or mobile app traffic" and cannot be bypassed with WAF
rules. Base44's docs say a custom domain's records must be "DNS only" if the DNS provider proxies;
`adhdone.space` is proxied. The exact trigger and time are visible in Anna's Cloudflare dashboard
(Security → Events, Sept 17–18). Bottom line: the June change set the trap; a third party sprang it.

### What the Base44 AI got wrong on Sept 19 (do not repeat)

- It found the connector "not stored" and rebuilt the whole calendar connection as app-owned OAuth
  (connect / callback / disconnect functions). That work is fine to keep, but it was not the cause —
  the new functions failed the same way, because the failure was in every function.
- It saw the Cloudflare challenge in the logs and called it "an outdated SDK version calling the wrong
  host" (SDK bump) and then "intermittent" (added `withChallengeRetry`). Neither is true: every SDK
  version reads the same header, and the block happened on every call.
- It wrote "different origins" off as garbage after Anna pointed out nothing had changed in three days.
  The connector-attribution version of that theory was wrong; the domain still mattered, for the
  reason above. A long-standing setup can absolutely be the thing a third-party change breaks.
- Its tests always passed because the editor's Test Function calls the PREVIEW version of a function
  through `base44.app`, which never touches Cloudflare. It cannot reproduce this failure.

### The fix (published 2026-09-20)

- `src/api/base44Client.js`: back to `serverUrl` from app-params (`https://base44.app`), with a
  hard fallback to `https://base44.app` so it can never be blank. Every app request now goes to
  `base44.app` again. Verified after publish: myPushStatus 200, googleCalendarConnect 200, sync probe
  400 "not connected" (correct for an account with no grant).
- `base44/shared/sdkRetry.ts`: new `platformRequest(req)` — a copy of the request whose
  `Base44-Api-Url` says `https://base44.app`. Needed by any function that an outside service reaches
  THROUGH `adhdone.space`, because those never go through the app's client: Google's OAuth redirect
  into `googleCalendarCallback` (done), and any webhook registered on `adhdone.space`. Usage:
  `createClientFromRequest(platformRequest(req))`. Verified: the callback through `adhdone.space`
  now answers `gcal=expired` for a fake state (the lookup ran) instead of `gcal=failed` (blocked).
- `RULES.md` hard rule 9 records the rule. `withChallengeRetry` stays but is a leftover, not a fix.

### Standing rules from this

- Do not touch `src/api/base44Client.js` or `src/lib/app-params.js`. If a change there seems needed,
  stop and ask Anna first, and say plainly which host every call will go to afterwards.
- A backend function saved in the editor is the PREVIEW version only. The live app (and Anna's phone)
  runs the PUBLISHED version. Nothing backend reaches her until Publish.
- Recommended, Anna's action: set the `adhdone.space` DNS records in Cloudflare to "DNS only" (grey
  cloud), as Base44 requires. Then Cloudflare is out of the path even if something flips back.

## Open items for Base44 — DELETE EACH ITEM ONCE IT IS DONE

This section is a worklist, not permanent documentation. When you finish an item,
remove the item from this file in the same change. When the list is empty, delete
the whole section. Everything here was verified against live data on 2026-09-20.

### 1. Achievements are dead code that still runs on every completion
`checkAndAwardAchievements` is called from `src/components/home/TodaysTasks.jsx`
every time a task is completed, and it writes `Achievement` rows. But
`src/components/home/AchievementsCard.jsx` is imported by NOTHING, so no user has
ever seen one. Worse, each completion also does two full table reads to feed it:
`Task.list('-updated_date', 500)` and `DailySummary.list`. Either delete the
tracker call and the orphaned card, or ask Anna whether she wants the feature
revived — do not leave it writing rows nobody reads.
(`gamification.jsx` also creates Achievement rows on level-up. Points and level
ARE live and visible on MyAccount and Profile — do not remove those.)

### 2. Accountability partners is a dead feature
Partners, connection requests, find-partners and partner chat are not shipped.
The code is still present. Decide with Anna: remove it, or finish it. Until then,
never describe a user as "has no accountability partners" as if it were live.

### 3. The Daily Tips Cleanup workflow fails 401 every single day
`cronDailyTips` requires the `CRON_SECRET` (header `X-Secret`, query `secret`, or
a `secret` field in the body). The "Daily Tips Cleanup" workflow invokes it with
`args: {}` — no secret — so it returns 401 and exits before deleting anything.
The `DailyTip` table has therefore never been cleaned. Fix the workflow to pass
the secret (or make the function accept the workflow caller) and verify one run
actually deletes yesterday's rows.

### 4. Wording: every push a user receives IS a reminder
A smart nudge and a morning digest are reminders to the person holding the phone,
whatever the code calls them internally. Never write "no reminders were sent"
because a task had no `reminder_interval` / `next_reminder` chain. Say the task
had no scheduled reminder chain, and name the pushes that did go out. Anna's
words: "Anytime a user receives a push, that is a reminder." Once you have read
this and understood it, delete this item.

### 5. Historical note — do not re-break, then delete this item
Tasks captured from outside the app before roughly 2026-09-18 17:20 UTC were saved
with an EMPTY `notification_recipient_email`. `cronRefillReminders` requires that
field ("never fall back to created_by") and `cronDailyDigest` skips tasks without
it, so those tasks could never get a reminder booked. 360 of 454 tasks carry the
empty value; ZERO of them are still active, so there is nothing to backfill. It is
already fixed — native captures set the field now. Just never remove it again.
