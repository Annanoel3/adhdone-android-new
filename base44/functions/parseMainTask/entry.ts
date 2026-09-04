import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import { runTaskParse } from "../../shared/runTaskParse.ts";

Deno.serve(async (req) => {
  const base44 = await createClientFromRequest(req);
  const { prompt } = await req.json();
  const response = await runTaskParse(base44, prompt);
  return Response.json({ response });
});