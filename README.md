# ADHDone

## STANDING FACTS — read before doing anything

- **Anna always tests on her Android phone (the installed app).** Not the preview, not desktop.
  Any fix that depends on a browser-only capability (popups, `window.open`, `window.closed`,
  new tabs) is invalid by default. She has said this many times.
- The app is served from the **custom domain `adhdone.space`**. The Base44 platform's
  OAuth connect URLs live on **`base44.app`** — a different origin. Anything that assumes
  same-origin session sharing during an OAuth hand-off is suspect.
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
Browser console shows **Cross-Origin-Opener-Policy blocking `window.closed`**, which means the
popup-based OAuth flow cannot work at all (and popups don't exist in the Android webview).

Failed attempts — do not repeat:
1. Removing `prompt=select_account` from the OAuth URL.
2. Revoking the connection before reconnecting (destroys valid tokens).
3. Popup OAuth with retry polling (blocked by COOP; unavailable on Android).