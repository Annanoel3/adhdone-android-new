import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import OpenAI from "npm:openai";
import { lean } from '../../shared/aiCost.ts';
import { privateOpenAiKey } from '../../shared/privateAi.ts';
import { secrets, waitUntil } from "base44:runtime";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { prompt, userMessage } = await req.json();
    const openai = lean(new OpenAI({ apiKey: privateOpenAiKey('supportSpaceChat') }), { name: 'supportSpaceChat' });

    const sourcingRules = `

RESEARCH & SOURCING REQUIREMENT:
Any claim you make about ADHD, executive function, attention, motivation, sleep, medication effects, or behavior-change strategy MUST be backed by a real source you actually found with the web_search tool. Search before you answer whenever the answer contains such a claim.
- Prefer peer-reviewed research, systematic reviews/meta-analyses, and official clinical guidance (CHADD, NIMH, CDC, AAP, NICE).
- End the message with a "Sources" list: author/organization, year, title, and the URL you actually retrieved.
- If a search turns up nothing solid, say plainly that there isn't good evidence for it and label the suggestion as untested practical advice — never invent a citation, journal, author, DOI, or URL.
- Questions about how the ADHDone app itself works are answered from the app reference in this prompt and need NO sources.

APP TROUBLESHOOTING STYLE:
When something in the app isn't working (a notification missing, a feature not showing, something that "was working before"), do NOT dump a list of possible causes. Give ONE most-likely fix, in a sentence or two, then ask if it worked.
- If it was working before and stopped, the first suggestion is almost always: fully close the app (swipe it away) and reopen it.
- Only if the user comes back and says that didn't help do you move on to the next most likely cause (permissions, the relevant setting, toggling the feature off/on, restarting the phone) — again one at a time.
- Order matters: lead with the fix that resolves it most of the time, not the most technical-sounding one. Permissions and settings are rarely the cause when the feature was working earlier — the app simply needs to be reopened so it can re-post/refresh.
- Before answering ANY "X isn't working" question, first work out how that specific feature actually works in ADHDone (from the app reference above) and what would realistically break it. Answer from that mechanism, not from a generic phone-troubleshooting checklist. Generic advice like "check permissions / restart your device" is the last resort, never the opening move.
- If the app reference doesn't tell you enough to name a likely cause, say so honestly, give the one thing worth trying (usually reopening the app), and point them to Report a Bug in Settings — do not pad the answer with guesses.
- Specific case: the pinned Quick Capture notification disappears when Android clears it or the app hasn't been opened in a while. It re-posts when the app is opened, so the answer is "fully close and reopen ADHDone and it should come back" — nothing else first.`;

    // The person's message is checked first (OpenAI moderation): for
    // self-harm (below) and for the acceptable-use alert at the end.
    let userMod: any = null;
    if (userMessage) {
      try {
        const m = await openai.moderations.create({ model: 'omni-moderation-latest', input: userMessage });
        userMod = m.results?.[0] || null;
      } catch (e) {
        console.error('Message check failed:', (e as any)?.message || e);
      }
    }

    const response = await openai.responses.create({
      model: "gpt-6-astra",
      tools: [{ type: "web_search" }],
      input: prompt + sourcingRules
    });

    let message = response.output_text;

    // The AI's own reply is checked BEFORE it is shown (App Store 1.2: AI
    // content apps must filter objectionable material). Until Nov 6 2026 only
    // the person's message was checked, after the reply had already gone out,
    // and only to email Anna (Anna: "This is already supposed to happen"). A
    // reply flagged for one of the clearly objectionable kinds is replaced; a
    // caring reply about self-harm or a hard subject is not ("self-harm",
    // "self-harm/intent", plain "violence" and "harassment" are left alone,
    // since a supportive answer trips those).
    const BLOCK_KINDS = ['sexual', 'sexual/minors', 'hate', 'hate/threatening', 'harassment/threatening', 'violence/graphic', 'self-harm/instructions', 'illicit/violent'];
    let replyBlocked: string[] = [];
    let replyMod: any = null;
    if (message) {
      try {
        const out = await openai.moderations.create({ model: 'omni-moderation-latest', input: message });
        replyMod = out.results?.[0] || null;
        const scores = replyMod?.category_scores || {};
        replyBlocked = BLOCK_KINDS.filter((c) => replyMod?.categories?.[c] && (scores[c] ?? 0) >= 0.5);
      } catch (e) {
        console.error('Reply check failed:', (e as any)?.message || e);
      }
    }
    const originalReply = message;
    if (replyBlocked.length) {
      // Anna's words, Nov 6 2026.
      message = "Sorry, I can't reply to that. Could you tell me a bit more about what you’d like help with.";
      waitUntil((async () => {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: 'mediocreatbestdev@outlook.com',
            from_name: 'ADHDone Safety Alerts',
            subject: `ADHDone: an AI reply was blocked (${replyBlocked[0]})`,
            body: `A Support Space reply was blocked before it was shown and replaced.\n\nUser: ${user.full_name || 'Unknown'} (${user.email})\nTime: ${new Date().toISOString()}\nBlocked for: ${replyBlocked.join(', ')}\n\nBlocked reply:\n"${(originalReply || '').slice(0, 1500)}"`
          });
        } catch (e) {
          console.error('Blocked-reply alert failed:', (e as any)?.message || e);
        }
      })());
    }

    // Anything about self-harm, in what they wrote or in the reply: the reply
    // starts by telling them where to get help right now; a caring reply
    // follows unless it was blocked above. Anna, Nov 6 2026: "something about
    // self harm should immediately tell them to seek help. But a caring reply
    // about a hard subject is fine". A low bar on purpose (0.3, or OpenAI's
    // own flag): a help line shown once too often costs nothing.
    const SELF_HARM = ['self-harm', 'self-harm/intent', 'self-harm/instructions'];
    const aboutSelfHarm = (r: any) => !!r && SELF_HARM.some((c) => r.categories?.[c] || (r.category_scores?.[c] ?? 0) >= 0.3);
    if (aboutSelfHarm(userMod) || aboutSelfHarm(replyMod)) {
      const help = "If you're thinking about hurting yourself, please reach out for help right now. In the US, call or text 988 (Suicide & Crisis Lifeline). Outside the US, findahelpline.com lists free helplines in your country. If you're in danger, call your local emergency number.";
      message = replyBlocked.length ? help : `${help}\n\n${message || ''}`.trim();
    }

    // Acceptable-use monitoring: flag only genuinely severe content (OpenAI
    // moderation, checked above), then alert the app owner by email. Sent after
    // the response so it never slows down or breaks the chat.
    if (userMessage && userMod) {
      waitUntil((async () => {
        try {
          const result = userMod;
          if (!result?.flagged) return;

          const scores = result.category_scores || {};
          const triggered = Object.keys(result.categories || {})
            .filter((c) => result.categories[c] && (scores[c] ?? 0) >= 0.5);
          if (triggered.length === 0) return;

          const details = triggered
            .map((c) => `${c} (${((scores[c] ?? 0) * 100).toFixed(1)}%)`)
            .join(', ');

          await base44.asServiceRole.integrations.Core.SendEmail({
            to: 'mediocreatbestdev@outlook.com',
            from_name: 'ADHDone Safety Alerts',
            subject: `ADHDone: acceptable-use flag (${triggered[0]})`,
            body: `A Support Space message crossed the acceptable-use threshold.

User: ${user.full_name || 'Unknown'} (${user.email})
Time: ${new Date().toISOString()}
Flagged categories: ${details}

Message:
"${userMessage}"

Assistant reply:
"${(message || '').slice(0, 1500)}"`
          });
        } catch (e) {
          console.error('Acceptable-use alert failed:', e.message);
        }
      })());
    }

    return Response.json({ message });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}