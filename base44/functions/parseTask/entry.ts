import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import { runTaskParse } from "../../shared/runTaskParse.ts";
// Shared files are bundled into this function when it is deployed, so a change
// to the shared prompt (taskParsePrompt.ts) only reaches users after this
// function is saved and redeployed again.

Deno.serve(async (req) => {
  const base44 = await createClientFromRequest(req);
  const { prompt } = await req.json();
  // The user's about-me line lets the parser judge work vs personal for this
  // specific person. Missing (skipped onboarding) is fine — the model falls
  // back to plain common sense.
  const user = await base44.auth.me().catch(() => null);
  const response = await runTaskParse(base44, prompt, user?.timezone, user?.about_me);
  return Response.json({ response });
});