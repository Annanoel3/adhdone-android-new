# PROJECT RULES — DO NOT VIOLATE

## 1. NO BASE44 LLM — EVER

**This is a hard, non-negotiable rule. Never call `base44.integrations.Core.InvokeLLM` or `base44.asServiceRole.integrations.Core.InvokeLLM` anywhere in this codebase — not in backend functions, not in frontend components, not in utilities. No exceptions.**

All LLM/AI calls must use the OpenAI SDK directly with the app's `OPENAI_API_KEY` environment variable.

**Backend (Deno) pattern:**
```ts
import OpenAI from 'npm:openai';
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [/* ... */],
});
```

**Frontend pattern** — call a backend function that uses OpenAI; do NOT call Base44's InvokeLLM from the client.

If you need to add AI/LLM functionality, use OpenAI only. If you are not sure whether something uses Base44's LLM, search the codebase for `InvokeLLM` before proceeding.

### Files that previously violated this rule (now fixed):
- `base44/functions/generateReminderSchedule/entry.ts`
- `base44/functions/generateDailyTip/entry.ts`
- `src/components/utils/birthdayScheduler.jsx`
- `src/components/utils/calendarEmojiResolver.js`

Before finishing ANY task involving AI/LLM, run a codebase search for `InvokeLLM` to confirm zero results.