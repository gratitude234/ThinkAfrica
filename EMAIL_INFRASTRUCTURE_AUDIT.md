# Email Infrastructure Audit — Indegenius

Audited against the blueprint spec (Section 4.5 Mail Infrastructure, Phase 1 Priority 1) as summarized in the audit request. The blueprint document itself was not found in this repository (no file matching "Section 4.5," "Mail Infrastructure," etc.), so this audits actual code against the specific instructions/sections requested, not the full blueprint text.

Date: 2026-07-17

## 1. Named sender addresses actually wired into the codebase

**There is exactly one sending path in the entire app**, and it does not use named addresses at all:

- `lib/email.ts:191-192` — `sendEmail()` is the single function that calls `resend.emails.send(...)`. The `from` field is `process.env.EMAIL_FROM` — one env var, unconditionally used for **every** email type (auth OTPs, review assignments, publish/reject/revision decisions, likes, comments, messages, co-author invites, verification, moderation, weekly digest, welcome).
- Confirmed via grep that `lib/email.ts` is the *only* file that imports `Resend` or calls `.emails.send(...)` — no other file has a parallel/duplicate sending path.
- `EMAIL_FROM` is **not set anywhere in the repo** (no `.env.example`, not even listed in `CLAUDE.md`'s env var table — only `RESEND_API_KEY` is documented there). Its actual value lives only in Vercel's dashboard env config, invisible from code.
- `lib/site.ts:9-13` defines `CONTACT_EMAILS = { privacy, legal, editorial }` (`editorial@indegenius.africa`, etc.), but grepping every usage shows these are **display-only mailto links** on `/editorial-standards`, `/terms`, and `/privacy` pages. None of them are ever passed as `from` or `replyTo` to `sendEmail`/`sendUserEmail`/`sendDirectEmail`. There is also no `replyTo` parameter anywhere in `lib/email.ts` — it's not supported by the current API.

**Bottom line:** the app sends every automated email from a single undocumented address, and the three named Indegenius mailboxes that exist as constants are cosmetic — shown to users as contact info but never actually used as a sender or reply-to.

## 2. Generic no-reply vs. named address (Instruction 2)

Can't confirm the literal value of `EMAIL_FROM` from code (it's an unset/external env var), but the architecture itself violates the instruction regardless of what that value is set to: **there is no per-context sender routing at all.** Auth emails, editorial decisions, social notifications, and the weekly digest all share one `from` address. Even if someone sets `EMAIL_FROM=editorial@indegenius.africa` today, tomorrow a "someone liked your post" email would also come from editorial@ — there's no mechanism to send different email categories from different named addresses. The blueprint's "all automated emails must originate from named Indegenius addresses" (plural, implying category-specific senders) is not implemented — there's a single generic sender slot, named or not.

## 3. editorial@ integration into the research pipeline (Section 4.3)

Checked `app/(main)/submit/research/actions.ts` and `app/(main)/admin/review/actions.ts`:

- `editorial@indegenius.africa` (`CONTACT_EMAILS.editorial`) is **not referenced anywhere** in the submission or review action files — not as sender, not as reply-to, not as CC.
- The research submission flow (`submit/research/actions.ts`) sends **no emails at all** — it only writes to `posts`/`post_references`/`post_authors` and calls `revalidatePath`.
- The review pipeline (`admin/review/actions.ts`) sends generic, post-type-agnostic emails for: review assignment, "under review," published, revision requested, and rejected (`post_rejected`, subject "Editorial decision on your Indegenius submission"). These are shared templates used for blog/essay/policy_brief/research alike — there is no research-specific or editorial-branded template.
- **Templates found:**
  - Rejection → exists, generic (`admin/review/actions.ts:485`, subject "Editorial decision on your Indegenius submission") — no dedicated "editorial rejection" template.
  - Approval/publish → exists, generic (`admin/review/actions.ts:334`, subject "Your Indegenius submission has been published").
  - **Publication permission request → does not exist.** Grepped for "publication permission," "reprint," "copyright permission," "permission to publish," "permission request" — zero matches anywhere in the codebase.

## 4. Domain check: indegeniusafrica.com vs. indegenius.africa

- `grep -rli "indegeniusafrica"` across the **entire repo** (all file types, excluding `node_modules`/`.git`) returns **zero matches**. The string `indegeniusafrica.com` does not appear anywhere in code, env references, configs, or docs.
- `indegenius.africa` appears in exactly two code locations:
  - `lib/site.ts:4` — `APP_DOMAIN` fallback default: `process.env.NEXT_PUBLIC_APP_DOMAIN || "indegenius.africa"`
  - `app/(main)/post/[slug]/CiteThis.tsx:56,77` — hardcoded citation URLs (`https://indegenius.africa${citationPath}`), with a comment noting `thinkafrica.africa` must 301-redirect to `indegenius.africa`.

**Bottom line:** the codebase is internally consistent and correctly uses the live domain (`indegenius.africa`) everywhere. If the blueprint document specifies `indegeniusafrica.com`, **the blueprint is the outlier, not the code** — flag the blueprint for correction rather than the app. There's no domain drift bug to fix here.

## 5. Retention mechanisms (Section 4.1)

| Mechanism | Status | Evidence |
|---|---|---|
| Birthday message | **Not started** | Zero matches for "birthday" anywhere in `.ts`/`.tsx`/`.sql` |
| Milestone notifications | **Not started** | Zero matches for "milestone" anywhere in code/schema |
| Personalised daily newsletter | **Not started (as spec'd)** | `app/api/cron/daily-brief/route.ts` exists and runs on a real Vercel cron (`0 8 * * *`), but it's a **broadcast push notification**, not an email, and not personalized — every recipient gets the same featured post/debate. There is a separate **weekly** email digest (`sendWeeklyDigestEmails` in `admin/digest/actions.ts`), but it's manually triggered by an admin from `/admin/digest`, not on a cron, and content is the same for all recipients — not per-user personalization. |
| Opportunity alerts | **Not started** | `lib/opportunityMatch.ts` only computes an on-page match score/label for opportunity cards a user is actively viewing. No email/push send, no cron job, no `opportunity_alert` notification type anywhere in migrations or code. |

## 6. Gap checklist (Phase 1, Priority 1–5 framing)

### Live / working
- ✅ Transactional email pipeline exists (`lib/email.ts`, Resend-backed) with idempotency keys, preference gating, cooldowns, HTML+text rendering, dark-mode CSS.
- ✅ Review-cycle emails (assigned, under review, revision requested, published, rejected) fire correctly, routed through user notification preferences.
- ✅ Domain usage is clean and consistent (`indegenius.africa`) — no code fix needed, only a possible blueprint correction.
- ✅ Weekly editorial digest email exists (manual trigger only).
- ✅ Daily brief exists as a **push** notification (not email).

### Partially built
- ⚠️ Named sender addresses — `CONTACT_EMAILS` constants exist (`editorial@`, `privacy@`, `legal@`) but are display-only; not wired into any actual `from`/`replyTo` on sent mail. This is the core Priority-1 gap: the plumbing (Resend client, templating) is done, but the "named address per category" routing layer that Instruction 2 requires doesn't exist.
- ⚠️ "Daily newsletter" — a daily automated push exists, but not as email, and not personalized; the personalized/email version described in 4.1 isn't built.
- ⚠️ Weekly digest — email exists but isn't automated (no cron) and isn't personalized per recipient.

### Not started
- ❌ Per-category named sender routing (editorial@ for editorial decisions, etc.) — single `EMAIL_FROM` for everything.
- ❌ `EMAIL_FROM` value itself is undocumented in the repo (missing from `CLAUDE.md`, no `.env.example`) — can't even confirm from code whether it's currently a no-reply address or named.
- ❌ Editorial rejection / approval / publication-permission-request as **distinct, dedicated** templates (today: one generic decision template shared across all post types, and no permission-request template at all).
- ❌ Birthday messages.
- ❌ Milestone notifications.
- ❌ Personalized daily newsletter (email).
- ❌ Opportunity alerts (proactive email/push).
- ❌ Supabase Auth SMTP settings — no `supabase/config.toml` or dashboard config checked into the repo, so I can't confirm from code whether Supabase's own built-in auth emails (which would carry Supabase's default sender, not an Indegenius address) are disabled in favor of the custom `sendDirectEmail`/`sendUserEmail` OTP flow in `accountEmailActions.ts`, or whether both are firing in parallel. This needs a dashboard check, not a code check.
