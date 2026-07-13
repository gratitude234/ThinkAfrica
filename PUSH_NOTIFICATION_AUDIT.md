# Push Notification Audit — Indegenius

**Last verified: 2026-07-13.** This file describes what's actually live in the codebase as of that date. It previously described a pre-build state ("no push infrastructure exists") that is no longer true — push was built and wired into five touchpoints since the original audit. If you're reading this later and it looks stale, re-verify against the code before trusting it (start with `lib/push.ts` and a grep for `sendPushNotification`).

## Summary

Push notifications are live. Infrastructure (subscription table, service worker, VAPID, permission prompt, settings toggles) is fully built. Six event types are wired in: editorial decisions (three sub-types), direct messages, comments, likes, and follows. Two things are deliberately *not* wired in yet — see "Known gaps" below; both are decisions on hold, not oversights.

## Infrastructure (all live)

| Piece | Location | Notes |
|---|---|---|
| `push_subscriptions` table | [supabase/migrations/20260712000001_push_subscriptions.sql](supabase/migrations/20260712000001_push_subscriptions.sql) | One row per browser/device endpoint. RLS: users can only read/write their own rows. `endpoint` is `UNIQUE`, so re-subscribing the same browser upserts. |
| Send helper | [lib/push.ts](lib/push.ts) | `sendPushNotification()` — checks recipient's `notification_prefs`, applies an optional cooldown (see below), fetches subscriptions, sends via `web-push`, auto-deletes subscriptions on 404/410. `logPushResult()` logs skip/error outcomes. |
| VAPID config | env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_MAILTO` | `sendPushNotification()` no-ops (`skipped: "missing_vapid_configuration"`) if unset, rather than throwing. |
| Service worker | [public/sw.js](public/sw.js) | Handles `push` (shows notification) and `notificationclick` (focuses existing tab or opens a new one). |
| SW registration | [components/push/ServiceWorkerRegister.tsx](components/push/ServiceWorkerRegister.tsx) | Mounted globally in [app/layout.tsx](app/layout.tsx) — registers on every page load, not just for logged-in users. |
| Permission prompt | [components/push/NotificationPermissionPrompt.tsx](components/push/NotificationPermissionPrompt.tsx) | Fires once, at the final "Finish setup" step of [onboarding](app/(onboarding)/onboarding/page.tsx) — after a completed multi-step commitment, not mid-signup. 8s timeout guard so a hung `subscribe()` can't block onboarding. |
| Manifest | [app/manifest.ts](app/manifest.ts) | Served at `/manifest.webmanifest`. |
| Settings toggles | [app/(main)/settings/NotificationsForm.tsx](app/(main)/settings/NotificationsForm.tsx) | One toggle per preference key, listed below. |

## Touchpoints wired in

| Event | File | Preference key | Notification type used |
|---|---|---|---|
| Post published | [admin/review/actions.ts:349](app/(main)/admin/review/actions.ts#L349) | `push_published` | `post_published` |
| Revision requested | [admin/review/actions.ts:434](app/(main)/admin/review/actions.ts#L434) | `push_published` | `revision_requested` |
| Post rejected | [admin/review/actions.ts:498](app/(main)/admin/review/actions.ts#L498) | `push_published` | `post_rejected` |
| Direct message | [messages/[id]/actions.ts:183](app/(main)/messages/[id]/actions.ts#L183) | `push_messages` | n/a — DMs have no in-app `notifications` row at all (email + push only, by design; see [messages/[id]/actions.ts](app/(main)/messages/[id]/actions.ts)) |
| Comment / reply | [post/commentActions.ts:162](app/(main)/post/commentActions.ts#L162) | `push_comments` | `comment` |
| Like | [post/[slug]/likeActions.ts:127](app/(main)/post/[slug]/likeActions.ts#L127) | `push_likes` | `like` |
| Follow | [components/ui/followActions.ts:108](components/ui/followActions.ts#L108) | `push_follows` | `follow` |

All seven call sites follow the same shape: in-app `notifications` insert → (if it succeeded) email → (if that succeeded, or for DMs after the same cooldown-gated email check) push. Push is always the last, most-optional step; a failure or skip here never blocks the in-app row or the email.

Reviewer-assignment and review-started notifications (`review_assigned`, `review_started`, both in `admin/review/actions.ts`) still get in-app + email only — they were deliberately excluded from push, since push here was scoped to terminal editorial decisions (published/rejected/revision-requested), not every step of the review pipeline.

## Shared cooldown for bursty touchpoints

Comments, likes, and follows are all "many senders → one recipient" events — a popular post can generate a burst from many different people in a short window. All three share one cooldown mechanism, centralized in `sendPushNotification()` ([lib/push.ts](lib/push.ts)) rather than duplicated per call site:

- **Column:** `profiles.last_engagement_push_notified_at` (added in [supabase/migrations/20260713000001_profile_engagement_push_cooldown.sql](supabase/migrations/20260713000001_profile_engagement_push_cooldown.sql))
- **Window:** 30 minutes (`ENGAGEMENT_PUSH_COOLDOWN_MS` in `lib/push.ts`)
- **Scope:** per-recipient, not per-post and not per-event-type — a like followed by a comment on a different post within the window still gets suppressed, because the stamp is shared across all three touchpoints.
- **What it does NOT affect:** in-app `notifications` rows and emails fire on every single event, uncapped, exactly as before. Only the push send is throttled.
- **What it does not (yet) cover:** direct messages and editorial decisions don't pass `cooldownMs` — DMs are 1:1 (no multi-sender burst risk), editorial decisions are low-frequency by nature.

## Known gaps (intentional, not forgotten)

1. **`debate_reply` notifications — reserved, unimplemented.** The `notifications.type` CHECK constraint includes `debate_reply` and `debate_argument`, and `FEATURE_FLAGS.debates` is `true`, but [app/(main)/debates/[id]/actions.ts](app/(main)/debates/[id]/actions.ts) has no `notifications`, `sendUserEmail`, or `sendPushNotification` calls at all. No in-app, no email, no push for debate activity. This was flagged in the original audit as low-medium priority pending a product call on how active debates actually are — still on hold, not an oversight.

2. **Review-submission notifications — flagged, on hold.** When a reviewer submits a recommendation (`submitReview()` in [app/(main)/review/actions.ts](app/(main)/review/actions.ts)), no notification of any kind (in-app, email, or push) tells the editor a review has come in. Editors currently learn about it by visiting `/admin/review`. This was flagged in the original audit as a possible gap to close, and remains an open decision for the team rather than something to silently add — don't build it without confirming scope first.

## Current `notifications.type` CHECK constraint

Latest version, from [20260706000001_review_reminder_tracking.sql](supabase/migrations/20260706000001_review_reminder_tracking.sql):

```
like, comment, follow, debate_reply, debate_argument, fellowship, badge,
post_approved, post_rejected, post_published, review_assigned, review_started,
review_reminder, revision_requested, co_author_invite, co_author_accepted,
co_author_declined, response_post, opportunity_inquiry,
moderation_post_removed, moderation_comment_hidden, account_suspended
```

Every `type` value inserted anywhere in `app/` is covered by this list (verified by grep as of the date above) — no missing types as of this writing.
