# AI-Assisted Topic Selection V1 — release gate

Last updated: 2026-07-30.

## Current state

AI topic suggestions are gated by:

```text
NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED=1
```

Keep the flag unset or set to `0` for the initial code deployment. Ordinary
topic entry remains available while the flag is off, and the application does
not select or write `posts.research_keywords`, call Gemini, or claim quota.

The SQL release candidate is intentionally stored at:

```text
supabase/pending/ai_topic_suggestions_v1.sql
```

It is not part of the executable migration ledger and must not be applied
until the Debate deployment ledger is reconciled.

## Runtime configuration

- `GEMINI_API_KEY` is required and remains server-only.
- `GEMINI_TOPIC_MODEL` is optional and defaults to `gemini-3.6-flash`.
- Gemini receives only Short Post text, Article title/cleaned text, or
  Research title/abstract/keywords after the writer explicitly requests it.
- No prompt, response, draft text, PDF, reference, or fingerprint is persisted.

## Staging sequence

1. Deploy code with the feature flag off.
2. Apply the reviewed AI topic migration in staging.
3. Confirm existing published Research rows were not rewritten and their
   `research_keywords` value remains `NULL`.
4. Confirm quota tables are inaccessible to authenticated clients except
   through the narrow claim RPC.
5. Configure Gemini, enable the flag in staging, and test a Short Post,
   Article, new Research draft, and legacy editable Research draft.
6. Verify AI suggestions are never preselected, manual topics still work,
   provider failures do not block publishing, and the twentieth request is the
   final allowed request for the UTC day.
7. Verify new Research writes topics to `tags` and keywords only to
   `research_keywords`; disable the flag to confirm the compatibility path.
8. Review request success, failure, selection, quota, and no-topic metrics
   before enabling production.

AI-Assisted Topic Selection may be released before Topic Subscriptions. It
does not depend on Author Subscriptions or publication delivery.
