# ADHDone

## STANDING FACTS — read before doing anything

- **Anna always tests on her Android phone (the installed app).** Not the preview, not desktop.
  Any fix that depends on a browser-only capability (popups, `window.open`, `window.closed`,
  new tabs) is invalid by default. She has said this many times.
- **A regression must be explained by something that CHANGED.** If it worked three days ago, any
  theory about long-standing setup (the custom domain, the OAuth origins, the hosting) is wrong by
  construction. Diff recent code first; never reach for architecture to explain a regression.
- **Never tell Anna to contact Base44 support.** 98% of the time it is a problem I created and a
  problem I need to solve. "It's on the platform's side" is not an answer — keep digging until the
  real cause is found and fixed here.
- **Never state something about her data, her users, or app behavior as fact unless it was
  looked up in this session.** Query the entity, read the log, open the file. If it wasn't
  checked, say "I'm guessing — I'd have to look." Do not invent a reason she asked for a change.

## Known open issue: Google Calendar connector

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
4. **"Different origins (adhdone.space vs base44.app) break the OAuth hand-off."** Disproven: the
   domain setup has not changed and this worked three days ago. Never raise it again.
5. **"The sync-lock fields were missing from the User schema, so the lock write failed."** Disproven
   by direct test — Base44 accepts undeclared fields on User without error. (The two fields are now
   documented in the schema anyway, which is correct, but it was NOT the cause.)