// Retired Oct 1, 2026: Google Calendar's own sign-in is gone. The phone's
// calendars are ADHDone's only calendar source (src/lib/calendarSync.js and
// syncGoogleCalendar's device path), nobody had ever connected Google here,
// and the five google_* fields are off the User record. Nothing calls this;
// it answers 410 so a stale link can't do anything. The file is still here
// only because the code editor can't remove a function — delete the folder
// from the dashboard whenever convenient.
Deno.serve(() => Response.json({ error: 'retired', message: 'Google Calendar sign-in is no longer part of ADHDone.' }, { status: 410 }));
