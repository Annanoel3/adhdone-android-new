import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import OpenAI from "npm:openai";
import { lean } from '../../shared/aiCost.ts';

// The platform's calls occasionally fail once and pass a moment later.
async function whoIsAsking(base44: any) {
  for (let i = 0; i < 3; i++) {
    try {
      return await base44.auth.me();
    } catch (_) {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  return null;
}

Deno.serve(async (req) => {
  // Only signed-in people may use this: it runs whatever prompt it's handed
  // on the app's OpenAI account.
  const base44 = await createClientFromRequest(req);
  if (!(await whoIsAsking(base44))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { prompt, file_url } = await req.json();
  const openai = lean(new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') }), { name: 'categorizeIdea' });
  // Every call here runs on gpt-6-astra. It ran on gpt-4o-mini from May 12
  // 2026 (Base44's AI) until Oct 17 2026, although Anna had told it on Aug 26
  // not to use Mini; on it, the Parking Lot's tracker look logged "this is an
  // idea" as a heart rate reading and made "supplies to buy" a tracker. "Move them to astra like I already asked weeks ago" (she asked for the newest model everywhere on Sept 17 2026).
  //
  // file_url: a photo or PDF to read along with the prompt (the work-schedule
  // import, which used Base44's own AI until Oct 17 2026, against RULES.md
  // rule 1). A photo goes as an image; a PDF's bytes go as a file.
  let content: any = String(prompt || '');
  if (file_url) {
    const url = String(file_url);
    let isPdf = /\.pdf($|\?)/i.test(url) || url.startsWith('data:application/pdf');
    let pdfData = url.startsWith('data:application/pdf') ? url : '';
    if (!pdfData && !url.startsWith('data:')) {
      const res = await fetch(url).catch(() => null);
      const type = res?.headers.get('content-type') || '';
      if (res?.ok && (isPdf || type.includes('pdf'))) {
        isPdf = true;
        const bytes = new Uint8Array(await res.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        pdfData = `data:application/pdf;base64,${btoa(bin)}`;
      }
    }
    content = [
      { type: 'text', text: content },
      isPdf && pdfData
        ? { type: 'file', file: { filename: 'schedule.pdf', file_data: pdfData } }
        : { type: 'image_url', image_url: { url } },
    ];
  }
  const completion = await openai.chat.completions.create({
    model: "gpt-6-astra",
    reasoning_effort: "low",
    messages: [{ role: "user", content }]
  });
  const message = completion.choices[0].message.content;
  return Response.json({ message });
});