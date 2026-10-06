# Phase 7 AI verification scripts

Both scripts were actually executed against this repo's real source files
(via Node's native TypeScript stripping) and passed in full — see the Phase 7
section of the top-level README for what each one checks and why.

- `prompts.test.mjs` — imports and runs the real `lib/ai/prompts.ts` directly.
- `extract-json.test.mjs` — tests the exact JSON-extraction logic from
  `lib/ai/service.ts`, copied inline because the parent file imports `zod`,
  which is not installed in the build sandbox (no network to `npm install`).

Neither script calls a real AI provider or a real Supabase project — see the
README's "What still requires live verification" for what's left.
