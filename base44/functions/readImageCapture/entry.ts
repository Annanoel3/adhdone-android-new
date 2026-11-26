// Re-saved Nov 25 2026 (night) so the bundled shared/claudeAi.ts and shared/aiCost.ts are picked up: Claude for everyone is ready and held off until the app's disclosures name Anthropic (CLAUDE_JOBS_LIVE, CLAUDE_EVERYONE), and when the Claude credit runs out calls go straight to OpenAI (CREDITS GONE). Nothing else in this file changes.
// Nov 18 2026: each read also leaves a CaptureTrace row ("imageRead": share or app, found or nothing, how many characters; never the words). The log lines from Nov 14 can't be read back (the function logs come back empty), so a shared picture that saved nothing still couldn't be traced.
// Nov 14 2026: logs one line per read (share or app, found or nothing, never the words). Nothing else changes.
// Nov 10 2026: says what they'll actually do (a lab order is a lab visit), what to bring, and leaves out order numbers, order dates, opening hours and fine print. Anna, on a shared lab-order screenshot whose task title carried all of it: "I wish it would have gotten rid of the extra crap in the title. Its a blood drawing."
// Re-saved Nov 6 2026 (night) so the bundled shared/aiCost.ts is picked up: AI token counts per feature (counting only, nothing else changes).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import OpenAI from 'npm:openai';
import { lean } from '../../shared/aiCost.ts';
import { aiServe } from '../../shared/aiPerson.ts';

// Turns a PHOTO (event flyer, appointment card, invitation, handwritten note,
// screenshot) into the same kind of plain sentence a user would have typed.
//
// It deliberately stops there and does NOT build a task. The photo becomes
// text, and that text goes through the one existing parser + task saver like
// every other capture — so a flyer gets identical date/time/location handling,
// reminder decisions and scheduling. Parsing the image straight into a task
// record here would be a second parser, which is the exact mistake this app
// has already paid for twice.
const READ_PROMPT = `Read this image and write out, in one or two plain sentences, what someone would need to remember from it.

Include EXACTLY what the image says, using its own wording where possible:
- what the thing is (the event/appointment/title), in plain words: what they will actually do (an order confirmation that sends them to a lab is a lab visit there; say so)
- anything it says to bring or do beforehand
- the date, written as it appears
- the time or time range
- the place — full street address if one is shown

Rules:
- Only report what is actually visible. Never invent, complete, or guess a date, time, address, or name.
- Leave out what they won't need: order or account numbers, the date the document was sent or ordered, opening hours, and fine print, unless it's a code they'll have to show or say to get it done.
- Do not add commentary, advice, or formatting. No bullet points, no labels, no markdown.
- If the image shows nothing worth remembering (a selfie, a meme, a random photo), reply with exactly: NOTHING

Write it the way a person would say it out loud, e.g.:
JDM Night on Sept 12th from 6-9pm at 7025 Burnet Rd Austin TX 78757`;

async function aiHandledRequest(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, image_base64, mime_type } = await req.json();
    // Two callers: the web app sends a public UploadFile URL; the Android
    // share target (CaptureActivity → CaptureSyncWorker) sends the downscaled
    // JPEG itself, base64, so a shared screenshot never has to open the app.
    const imageUrl = file_url
      || (image_base64 ? `data:${mime_type || 'image/jpeg'};base64,${String(image_base64).replace(/^data:[^,]*,/, '')}` : null);
    if (!imageUrl) return Response.json({ error: 'file_url or image_base64 is required' }, { status: 400 });

    // OpenAI on the app's own key (RULES.md rule 1). A public URL is fetched by
    // the model itself; a data URL carries the bytes inline.
    const openai = lean(new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') }), { name: 'readImageCapture' });
    // gpt-6-astra (was gpt-5.4 from Sept 18 2026). Anna, Oct 17 2026: "Move them to astra like I already asked weeks ago" (she asked for the newest model everywhere on Sept 17 2026).
    const completion = await openai.chat.completions.create({
      model: 'gpt-6-astra',
      reasoning_effort: 'low',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: READ_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      }],
    });

    const text = String(completion.choices[0]?.message?.content || '').trim();
    // One line per read, with none of the picture's words in it: where it came
    // from (the share sheet sends the picture itself, the app sends a link) and
    // whether anything was found. Nov 14 2026: a photo Anna shared was read
    // here, nothing was saved from it, and nothing kept said what this
    // function had answered.
    const from = file_url ? 'app' : 'share';
    // The same thing kept as a row (see the Nov 18 2026 note at the top):
    // what the reader answered for this picture, without any of its words.
    const note = async (found: boolean, chars: number) => {
      try {
        await base44.asServiceRole.entities.CaptureTrace.create({
          step: 'imageRead',
          detail: JSON.stringify({ from, found, chars }),
          user_email: user.email,
        });
      } catch (_) { /* a trace is never worth failing a read for */ }
    };
    // "NOTHING" is the model's way of saying this photo isn't a task — passed
    // back so the UI can say so instead of creating a junk task from a selfie.
    if (!text || text.toUpperCase().startsWith('NOTHING')) {
      console.log(`[readImageCapture] ${from}: nothing found`);
      await note(false, 0);
      return Response.json({ text: null, nothing_found: true });
    }

    console.log(`[readImageCapture] ${from}: read ${text.length} chars`);
    await note(true, text.length);
    return Response.json({ text });
  } catch (error) {
    console.error('[readImageCapture] error:', error?.message || error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Whose AI calls this request makes (shared/aiPerson.ts, Nov 24 2026).
export default aiServe(aiHandledRequest);