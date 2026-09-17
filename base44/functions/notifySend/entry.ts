// notifySend is SWITCHED OFF on purpose (Anna's decision, Sept 17 2026).
//
// It was the last sender that targeted by stored OneSignal player ids, which
// breaks hard rule 1 (external id / email only), and it refused to send at all
// when a user had none saved. Its callers — achievement unlocks, accountability
// partner requests, chat messages, challenge progress — are notifications Anna
// has chosen to keep OFF. Every caller already treats a non-success reply as
// "not sent", so they need no change.
//
// To bring one of these back: only when Anna asks for that specific
// notification, and only by external id (include_external_user_ids: [email]).
// Never player ids.
Deno.serve(async () => {
  return Response.json({ success: false, disabled: true, reason: 'notifySend is switched off' });
});