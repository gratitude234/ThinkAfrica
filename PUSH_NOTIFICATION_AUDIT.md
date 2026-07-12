# Push Notification Audit — Indegenius

Discovery only. No code changed as part of this audit.

## Summary

Every notification-worthy event in the codebase already follows one consistent pattern:

```
detect event → insert into `notifications` table (in-app) → if insert succeeded, call sendUserEmail() (Resend)
```

This is a clean separation: **the code that decides "this event happened" is already a separate step from "send the email."** Adding push as a third branch after the `notifications` insert would be a small, low-risk change at each of these call sites — no event-detection logic needs to be touched.

However, "in-app" notifications are not live: realtime was explicitly disabled for the `notifications` table (`supabase/migrations/20260521000001_disable_realtime_for_launch_stability.sql`), so users only see new notifications on next page load. There is no polling either. Practically, **push would be the first real-time delivery channel this product has**, not an addition to an existing one.

There is currently **no push infrastructure at all**: no service worker, no manifest.json, no VAPID keys, no subscription table, no permission-prompt UI. This is a from-scratch build, not a wire-up.

---

## Touchpoints found

### 1. Comment on post / reply to comment
- **Trigger**: `submitComment()` in [commentActions.ts](app/(main)/post/commentActions.ts#L53)
- **Fires on**: new top-level comment (notifies post author) or reply (notifies parent comment author)
- **Current method**: in-app row (`type: "comment"`) + email, gated by `email_comments` preference
- **Decoupled?**: Yes — notification insert happens first; email only sent if insert succeeds
- **Priority**: **Medium** — frequent but not urgent; users don't expect instant delivery for comments
- **Gaps**: none specific to this trigger beyond the general infra gaps below

### 2. Like on post
- **Trigger**: `togglePostLike()` in [likeActions.ts](app/(main)/post/[slug]/likeActions.ts#L26)
- **Current method**: in-app (`type: "like"`) + email, gated by `email_likes`
- **Decoupled?**: Yes
- **Priority**: **Low** — high frequency, low time-sensitivity; a bad candidate for push (notification fatigue risk)

### 3. New follower
- **Trigger**: `toggleFollow()` in [followActions.ts](components/ui/followActions.ts#L22)
- **Current method**: in-app (`type: "follow"`) + email, gated by `email_follows`
- **Decoupled?**: Yes
- **Priority**: **Low**

### 4. Direct message
- **Trigger**: `sendConversationMessage()` in [actions.ts](app/(main)/messages/[id]/actions.ts#L86)
- **Current method**: **email only** — there is no `notifications` table insert here at all (confirmed: this file does not appear in the set of files that insert into `notifications`, unlike every other touchpoint). Email itself is rate-limited to one per recipient per 30 minutes via `last_email_notified_at` cooldown.
- **Decoupled?**: Partially — there's no in-app notification to hang a "silent" trigger off of, so a push send would need its own insert/branch here, not just an extra call after an existing one.
- **Priority**: **High** — messaging is the most time-sensitive, conversational touchpoint in the product and is the one place currently *most* starved of real-time delivery.
- **Gap flagged for follow-up**: worth confirming with the team whether the missing in-app notification for DMs is intentional (conversation view itself shows unread state) or an oversight, since it changes how push should be wired here.

### 5. Reviewer assigned
- **Trigger**: `assignReviewer()` in [app/(main)/admin/review/actions.ts](app/(main)/admin/review/actions.ts#L49)
- **Current method**: in-app (`type: "review_assigned"`) + email (no preference gate)
- **Decoupled?**: Yes
- **Priority**: **High** — time-sensitive, low frequency, directly affects editorial turnaround

### 6. Review reminder (Vercel Cron)
- **Trigger**: `GET /api/cron/review-reminders` in [route.ts](app/api/cron/review-reminders/route.ts#L7), runs on a schedule, finds `post_reviews` rows unsubmitted after 5 days
- **Current method**: in-app (`type: "review_reminder"`) + email, no preference gate
- **Decoupled?**: Yes — this route already separates "find due reviews" from "notify," making it the easiest touchpoint to extend
- **Priority**: **High** — this is explicitly a nudge mechanism; push is a strong fit since email alone hasn't gotten a response in 5 days

### 7. Reviewer submits a review → editor/admin notified
- **Trigger checked**: `submitReview()` in [app/(main)/review/actions.ts](app/(main)/review/actions.ts#L31)
- **Finding**: **No notification of any kind is sent when a review is submitted.** The function only updates `post_reviews` and revalidates paths. Editors currently learn about completed reviews only by visiting `/admin/review`.
- **Priority**: **Medium-High** if the team wants editors alerted the moment all reviews for a round are in (this is the one clear missing trigger, not just a missing channel)
- Flagging this rather than assuming — confirm with the team whether this was intentionally deferred.

### 8. Editorial decision: published / rejected / revision requested
- **Trigger**: `submitEditorialDecision()` in [app/(main)/admin/review/actions.ts](app/(main)/admin/review/actions.ts#L237), branches on `accept` / `request_revision` / reject
- **Current method**: in-app (`post_published` / `post_rejected` / `revision_requested`) + email, gated by `email_published`
- **Decoupled?**: Yes
- **Priority**: **High** — published/rejected are the highest-stakes, lowest-frequency events for an author; this is the single best candidate for push

### 9. Citation issued
- **Finding**: There is no separate "citation issued" event. Citation IDs (`lib/citationId.ts`) are generated as part of `publishReviewedPost()` inside the same accept-decision flow as #8, and the existing `post_published` notification already includes the citation ID and links to `/publication/{citationId}` when present. Treat this as the same touchpoint as #8, not a distinct one.

### 10. Comment/reply in a Communities or Dialogue feature
- **Finding**: No such feature exists in code. `lib/featureFlags.ts` shows only `debates`, `fellowshipsSection`, `ambassadors`, `talentMarketplace` as flags — no "communities" or "dialogue" concept anywhere in `app/`. What likely was meant is either (a) post comments (#1, implemented) or (b) debates (below, partially implemented). Do not build for a "Communities/Dialogue" touchpoint — it isn't in the roadmap markers in this repo.

### 11. Debate argument reply
- **Finding**: `debates` is enabled (`FEATURE_FLAGS.debates: true`) and the `notifications` table's `type` check constraint already reserves a `debate_reply` value (`supabase/schema_phase5.sql:53`), but `app/(main)/debates/[id]/actions.ts` contains **no notification or email logic at all** — no matches for `notifications`, `sendUserEmail`, or `debate_reply`. This is schema-anticipated but unbuilt.
- **Priority**: **Low-Medium** — depends on how active debates actually are; flag to product rather than assume it should be built

### 12. Co-author invite / accepted / declined
- **Trigger**: `write/actions.ts` (invite, around line 253) and `app/(main)/notifications/actions.ts` → `respondToCoAuthorInvite()` (accept/decline)
- **Current method**: in-app + email, no preference gate
- **Decoupled?**: Yes
- **Priority**: **Medium** — infrequent, but time-sensitive for collaboration

### 13. Response post (someone wrote a response to your post)
- **Trigger**: `write/actions.ts` around line 542, `inResponseTo` handling
- **Current method**: in-app (`response_post`) + email, gated by `email_responses`
- **Decoupled?**: Yes
- **Priority**: **Low-Medium**

### 14. Account verification / signup
- **Finding**: Signup uses a **code-only** verification flow (confirmed by recent commits `fa8984c`, `cb9333e`) — the user enters a 6-digit code from `sendSignupConfirmationEmail()` / `resendSignupConfirmationEmail()` in `app/(auth)/accountEmailActions.ts`, not a confirmation link. This is a single-session, synchronous flow (user is actively waiting in the browser), so push is not applicable here — there's no "close the app and come back later" gap to fill. Not a push candidate.
- **Priority**: **N/A**

### 15. Onboarding completion
- **Finding**: `app/(onboarding)/onboarding/page.tsx` is a 4-step client flow (persona → identity → interests → follow) ending in `completeOnboarding()`, which just flips `onboarding_completed` and redirects to `/?welcome=1`. No notification-related hooks exist here today.
- **Relevance to push**: This is the natural place to ask for notification permission — after "Finish setup" on the `follow` step, before redirecting home, since the user has just finished a deliberate multi-step commitment and isn't mid-task. The signup form itself (`app/(auth)/signup/page.tsx`) is the wrong place — inserting a permission prompt into the verification-code flow would add friction to an already-timed-out-prone flow (see `withSignupTimeout`, 20s timeout, and the recent "signup timeout race" fix in commit `b2c68be`).

---

## Database schema

- `notifications` table (`supabase/schema_phase5.sql:50`, superseding the simpler version in `schema_phase2.sql:38`): `id, user_id, type, actor_id, post_id, comment_id, read, created_at`. `type` is a `CHECK` constraint currently listing `'like', 'comment', 'follow', 'debate_reply', 'post_published', 'post_rejected'` in the phase5 schema — but application code already inserts additional types not in that list (`review_assigned`, `review_started`, `review_reminder`, `revision_requested`, `co_author_invite`, `co_author_accepted`, `co_author_declined`, `response_post`). **This suggests the CHECK constraint has since been relaxed or replaced by a later migration** — worth confirming the live constraint in Supabase before assuming any type is safe to insert.
- **No table exists** for push subscriptions, device tokens, or endpoints. Nothing named `subscription`, `device_token`, `push_token`, or similar appears anywhere in `supabase/`.
- `profiles.notification_prefs` (jsonb) already holds per-channel email preference keys (`email_comments`, `email_follows`, `email_likes`, `email_responses`, `email_messages`, `email_published`, `email_digest`, `email_account_security`, `email_profile_reminders` — see `lib/types.ts` / `lib/email.ts:7`). A push-equivalent set of keys (or a generic channel dimension on the same jsonb) would slot in next to these without a schema redesign.
- `conversation_participants.last_email_notified_at` is the only per-channel throttling column that exists; it's email-specific and scoped to messages only.

## Service worker / PWA status

- **No `manifest.json`** anywhere in `public/` or `app/`.
- **No service worker** file, and no `next-pwa` or equivalent dependency in `package.json`.
- `next.config.mjs` has no PWA, headers, or worker configuration — just image remote patterns and one redirect.
- Oddly, `public/` already contains a full **app-icon set** at PWA/iOS/Android sizes (48–1024px, both transparent and white-background variants) — someone previously prepared icon assets for an installable-app pass, but never wired up the manifest or service worker to use them. This means the icon asset work for push notification badges/PWA install is already done; only the manifest, service worker registration, and VAPID plumbing are missing.

## Technical gaps (rollup)

| Gap | Status |
|---|---|
| VAPID keys | Missing — no env vars, no config references |
| Push subscription table | Missing — no schema, no migration |
| Service worker | Missing — no file, no registration code, no `next-pwa` |
| `manifest.json` | Missing |
| Permission-prompt UI | Missing — no component or hook found |
| Icon assets for push/PWA | **Present** — full size set already in `public/` |
| Per-channel preference storage | Partially present — `notification_prefs` jsonb pattern exists for email today and can likely be extended for push |
| Event/send decoupling | **Already done** for every touchpoint except direct messages (#4), which sends email directly with no in-app row |

## Flagged for the team (not guessed)

1. Whether the missing in-app notification for direct messages (#4) is deliberate.
2. Whether reviewers-submitted-a-review (#7) alerting editors was intentionally left unbuilt, or is a gap to close alongside push.
3. Whether debate replies (#11) are active/important enough to warrant building the notification trigger that the schema already reserves space for.
4. The live `notifications.type` CHECK constraint — application code inserts several `type` values not listed in the `schema_phase5.sql` constraint, implying a later migration relaxed it. Confirm the actual constraint in the Supabase dashboard before treating any type as safe.
