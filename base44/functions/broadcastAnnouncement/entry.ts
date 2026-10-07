import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

// THE ONLY WAY an app-wide announcement may be sent.
//
// History: an announcement about fixing duplicate reminders was itself sent
// twice, because it went out through TWO targeting paths in one breath
// (include_player_ids AND include_external_user_ids). Same phones, two pushes.
// This function exists so that mistake is not possible to repeat:
//
//   1. ONE targeting path, always. Accounts (external user ids) only —
//      OneSignal resolves those to the account's live devices itself.
//   2. A hard duplicate guard: the same announcement key cannot go out twice
//      within 24 hours. The second attempt is refused, not sent.
//   3. dryRun mode returns the exact recipient list without sending, so a
//      broadcast can always be inspected before it reaches anyone.

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ success: false, error: 'Admins only' }, { status: 403 });
    }

    // deliveryTimeOfDay (e.g. "9:00AM") hands OneSignal a local time of day and it
    // delivers at that hour in each person's own timezone, so a fix announced at
    // midnight Central does not wake anyone up. Left out = send right now.
    // emails: send to just these accounts instead of everyone (every one must
    // exist, or nothing goes out). ask: 'feedback' stamps feedback_ask.asked_at
    // on each recipient's profile so the app shows them the one-time "What can
    // we do better?" popup (FeedbackAskPrompt) — on the tap, or the next time
    // they open the app on their own. The stamp goes on BEFORE the push, so a
    // push that never lands still gets them the popup.
    const { title, body, dryRun = true, confirm = false, deliveryTimeOfDay = null, emails: onlyEmails = null, ask = null } = await req.json();
    if (!title || !body) {
      return Response.json({ success: false, error: 'title and body are required' }, { status: 400 });
    }

    const key = `announcement:${title.trim().toLowerCase()}`;
    const since = new Date(Date.now() - ONE_DAY_MS).toISOString();

    // Duplicate guard — has this exact announcement already gone out today?
    const priorAll = await base44.asServiceRole.entities.NotificationLedger.filter({
      kind: 'general',
      task_id: key,
    });
    const prior = priorAll.filter((e: any) => e.send_at >= since);
    if (prior.length > 0) {
      return Response.json({
        success: false,
        refused: 'already_sent',
        message: `"${title}" was already broadcast at ${prior[0].send_at}. Refusing to send it again within 24h.`,
      });
    }

    const users = await base44.asServiceRole.entities.User.list('-created_date', 1000);
    let recipients = users.filter((u: any) => u.email);
    if (Array.isArray(onlyEmails)) {
      const want = new Set(onlyEmails.map((e: any) => String(e || '').trim().toLowerCase()).filter(Boolean));
      recipients = recipients.filter((u: any) => want.has(String(u.email).toLowerCase()));
      const found = new Set(recipients.map((u: any) => String(u.email).toLowerCase()));
      const missing = [...want].filter((e) => !found.has(e));
      if (missing.length > 0 || want.size === 0) {
        return Response.json({ success: false, error: want.size === 0 ? 'emails is empty' : `No account for: ${missing.join(', ')}` }, { status: 400 });
      }
    }
    const emails = recipients.map((u: any) => u.email);

    if (dryRun || !confirm) {
      return Response.json({
        success: true,
        dryRun: true,
        recipientCount: emails.length,
        recipients: emails,
        ask,
        title,
        body,
        deliveryTimeOfDay,
        note: 'Nothing was sent. Re-run with dryRun:false and confirm:true to actually broadcast.',
      });
    }

    if (ask === 'feedback') {
      const askedAt = new Date().toISOString();
      for (const u of recipients) {
        await base44.asServiceRole.entities.User.update(u.id, { feedback_ask: { asked_at: askedAt } });
      }
    }

    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Deno.env.get('ONESIGNAL_REST_API_KEY')!.trim()}`,
      },
      body: JSON.stringify({
        app_id: Deno.env.get('ONESIGNAL_APP_ID')!.trim(),
        // Single targeting path. Never add a second one here.
        include_external_user_ids: emails,
        headings: { en: title },
        contents: { en: body },
        data: { type: ask === 'feedback' ? 'feedback_ask' : 'announcement' },
        ...(deliveryTimeOfDay
          ? { delayed_option: 'timezone', delivery_time_of_day: deliveryTimeOfDay }
          : {}),
      }),
    });
    const out = await res.json();

    // Record it BEFORE reporting success so a retry can't slip a second copy out.
    await base44.asServiceRole.entities.NotificationLedger.create({
      user_email: user.email,
      task_id: key,
      kind: 'general',
      source: 'broadcastAnnouncement',
      send_at: new Date().toISOString(),
      notification_id: out?.id || '',
      title,
    });

    return Response.json({
      success: true,
      sent: true,
      recipientCount: emails.length,
      onesignal: { id: out?.id || null, recipients: out?.recipients ?? null, errors: out?.errors || null },
    });
  } catch (error) {
    console.error('broadcastAnnouncement failed:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});