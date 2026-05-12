import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

Deno.serve(async (req) => {
  await createClientFromRequest(req);
  const { audio_base64, filename } = await req.json();
  const binaryStr = atob(audio_base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const audioFile = new File([bytes], filename || 'audio.webm', { type: 'audio/webm' });
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  const transcription = await openai.audio.transcriptions.create({ file: audioFile, model: "whisper-1" });
  return Response.json({ text: transcription.text });
});