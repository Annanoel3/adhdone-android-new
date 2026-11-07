import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// "Report this response" in Support Space. Sent only when the user taps Report
// and confirms; carries just the reported AI reply and the one message of
// theirs right before it, never the rest of the conversation.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { ai_response, user_message, reason } = await req.json();
    if (!ai_response || !String(ai_response).trim()) {
      return Response.json({ error: 'Nothing to report' }, { status: 400 });
    }

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: 'mediocreatbestdev@outlook.com',
      from_name: 'ADHDone AI Reports',
      subject: `Support Space AI response reported by ${user.full_name || user.email}`,
      category: 'transactional',
      body: `A user reported an AI response in Support Space.

From: ${user.full_name || 'Unknown'} (${user.email})
Time: ${new Date().toISOString()}
${reason && String(reason).trim() ? `\nWhat was wrong (their words):\n"${String(reason).slice(0, 1000)}"\n` : ''}
Their message right before it:
"${user_message ? String(user_message).slice(0, 4000) : '(none, this was the opening message)'}"

The AI's response:
"${String(ai_response).slice(0, 4000)}"`,
    });

    return Response.json({ sent: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}