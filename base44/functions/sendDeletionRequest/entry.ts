import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// "Request deletion" buttons on the Delete Data / Delete Account pages: emails
// the owner instead of asking the person to write an email themselves. Works
// signed out too (those pages are public), with the email they type.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* signed out */ }

    const { kind, email, details } = await req.json();
    const from = String(user?.email || email || '').trim().slice(0, 200);
    if (!/^\S+@\S+\.\S+$/.test(from)) {
      return Response.json({ error: 'Please enter the email on your account.' }, { status: 400 });
    }
    const what = kind === 'account' ? 'Account Deletion Request' : 'Data Deletion Request';

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: 'mediocreatbestdev@outlook.com',
      from_name: 'ADHDone Deletion Requests',
      subject: `ADHDone ${what}: ${from}`,
      category: 'transactional',
      body: `${what}

Account email: ${from}
Name: ${user?.full_name || '(not signed in)'}
Signed in when sent: ${user ? 'yes (email verified by sign-in)' : 'no (email typed in, not verified)'}
Time: ${new Date().toISOString()}

${kind === 'account' ? 'They asked for their whole account to be deleted.' : `What they want deleted:\n${String(details || '(not specified)').slice(0, 3000)}`}`,
    });

    return Response.json({ sent: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}