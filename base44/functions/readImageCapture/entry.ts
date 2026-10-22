import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import OpenAI from 'npm:openai';

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
- what the thing is (the event/appointment/title)
- the date, written as it appears
- the time or time range
- the place — full street address if one is shown

Rules:
- Only report what is actually visible. Never invent, complete, or guess a date, time, address, or name.
- Do not add commentary, advice, or formatting. No bullet points, no labels, no markdown.
- If the image shows nothing worth remembering (a selfie, a meme, a random photo), reply with exactly: NOTHING

Write it the way a person would say it out loud, e.g.:
JDM Night on Sept 12th from 6-9pm at 7025 Burnet Rd Austin TX 78757`;

export default async function (req: Request): Promise<Response> {
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
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: READ_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      }],
    });

    const text = String(completion.choices[0]?.message?.content || '').trim();
    // "NOTHING" is the model's way of saying this photo isn't a task — passed
    // back so the UI can say so instead of creating a junk task from a selfie.
    if (!text || text.toUpperCase().startsWith('NOTHING')) {
      return Response.json({ text: null, nothing_found: true });
    }

    return Response.json({ text });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}