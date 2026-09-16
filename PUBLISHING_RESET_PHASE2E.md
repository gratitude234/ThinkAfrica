# Publishing Reset: Phase 2E

Branch `refactor/publishing-reset`, uncommitted, on top of Phases 1, 2A, 2B, 2C and 2D.
Nothing was committed or pushed. The zip changes are untouched.

## Deployment order

Two migrations are ready and neither is applied. Nothing in the project's
workflow authorizes a production mutation from this environment. Both were
dry-run against production and rolled back.

1. **Before the app deploy:** `20260914000001_remove_review_reminders_cron_job.sql`.
   Status: READY FOR DEPLOYMENT — APPLY BEFORE APP DEPLOY.
   ```
   node scripts/migration/apply-cron-removal.mjs --dry-run
   node scripts/migration/apply-cron-removal.mjs --apply
   ```
2. **Deploy the application.**
3. **After the app deploy:** `20260915000001_disable_messaging_writes.sql`.
   Status: READY FOR DEPLOYMENT — APPLY AFTER APP DEPLOY.
   ```
   node scripts/migration/apply-messaging-write-disablement.mjs --dry-run
   node scripts/migration/apply-messaging-write-disablement.mjs --apply
   ```

Why the messaging migration goes after the deploy: applied first, the
still-running application would show a member an error on a send or on the
Message button until the new build lands. No data is at risk in either order.

Until step 3 is applied, a signed-in client that talks to PostgREST directly can
still open a conversation or post a message. No application path can.

## Executive Summary

Direct messaging is gone from the product.

- **Removed:**
  - the `/messages` inbox and thread pages, with their layout, loading
    states and send, edit and read-receipt server actions;
  - both message APIs;
  - the profile Message button, signed in and signed out;
  - message eligibility;
  - the `messaging` repository domain, from both adapters;
  - message email and push delivery, and their preferences;
  - the "who can start a conversation" privacy setting;
  - the messaging analytics events and the admin Messaging KPI.
- **Redirects:** old `/messages` links go permanently to `/notifications`, and
  `messages` stays a reserved username.
- **Data:** nothing was dropped or deleted. The 20 conversations, 39 participant
  rows and 52 messages are exactly as they were.
- **Database controls:** the read-only audit found clients could still create
  conversations and write messages directly. A non-destructive migration now
  revokes those privileges and keeps every read.
- **Files:** 14 deleted (2,186 lines), 44 modified, 4 added.
- **Checks:** typecheck, lint and build pass. Tests have 1 failure, the allowed
  baseline, so there are **0 new failures**.

## Production usage measurement

Read-only transaction on 2026-09-15. Aggregates only.

| Measure | Value |
|---|---|
| Conversations | 20 |
| Conversation participant rows | 39 |
| Messages | 52 (1 soft-deleted) |
| Unique senders | 15 |
| Messages sent, last 30 days | 7 |
| Messages sent, last 90 days | 27 |
| Conversations with a message, last 30 days | 4 |
| Conversations with a message, last 90 days | 11 |
| Conversations created, last 30 / 90 days | 5 / 10 |
| Conversations with no message at all | 2 |
| Earliest message date (UTC) | 2026-04-24 |
| Most recent message date (UTC) | 2026-08-19 |
| Profiles with `privacy_settings.allow_messages` | 266, all `everyone` |
| Profiles carrying `notification_prefs.email_messages` | 266, all `true` |
| Profiles carrying `notification_prefs.push_messages` | 3, all `true` |
| Notification rows of any message type | 0 |
| `activation_events` `message_sent` | 51 (27 in the last 90 days) |
| `activation_events` `message_started` | 186 (104 in the last 90 days) |

## Routes

**Deleted pages and handlers:**

- `app/(main)/messages/page.tsx`, `layout.tsx`, `loading.tsx`,
  `ConversationListClient.tsx`;
- `app/(main)/messages/[id]/page.tsx`, `loading.tsx`, `MessageThread.tsx`,
  `actions.ts`;
- `app/api/messages/[id]/poll/route.ts`;
- `app/api/messages/unread/route.ts`, which already had no caller.

**Redirects added** in `next.config.mjs`, both permanent:

| Source | Destination |
|---|---|
| `/messages` | `/notifications` |
| `/messages/:path*` | `/notifications` |

No explanation page, placeholder or archive exists.

**Shell and crawlers:**

- `app/(main)/navRoutes.ts` no longer suppresses the desktop rail or the mobile
  navigation for `/messages`.
- `app/robots.ts` no longer disallows `/messages/`.
- `RESERVED_PROFILE_PATHS` and the `GuestBanner` route list keep `messages`.

### Route checks

Fresh `npm run build` (52 static pages, down from 53), `next start -p 3131`,
signed out. The server was stopped afterwards.

| Path | Status | Result |
|---|---|---|
| `/` | 307 | to `/landing`; no Message control, `/messages` link or conversation copy |
| `/landing`, `/explore`, `/search`, `/about`, `/reset-password` | 200 | same markers all absent |
| `/notifications`, `/settings`, `/settings/profile`, `/write` | 307 | to `/login` |
| a Post | 200 | comments heading present, no messaging markers |
| an Article | 200 | comments heading present, no messaging markers |
| the profile of a member who had conversations | 200 | Follow and More profile actions present; no Message control |
| `/messages` | 308 | to `/notifications` |
| `/messages/<old id>` | 308 | to `/notifications` |
| `/api/messages/unread` | 404 | |
| `/api/messages/<id>/poll` | 404 | |
| `/robots.txt` | 200 | no `/messages` rule |

Historic rows after the checks: 20 conversations, 39 participants, 52 messages.

## Profile

- **`ProfileHeader`** lost:
  - `MessageButton`, with its loading and error states and its call to
    `openConversationWith`;
  - the signed-out "Message" button that sent a reader to sign in;
  - the `messagingEligibility` prop;
  - the outlined secondary button style, which only Message used;
  - an unused browser Supabase client import.

  The owner still gets Edit profile and Share. A visitor still gets Follow and
  the overflow menu, with Share, Report and Block.
- **`loadProfileViewerContext`** no longer returns `viewer.messaging` or calls
  `getMessageEligibility`. A signed-in stranger's profile view runs one
  PostgREST call fewer. Follow, subscription, block and count state are
  unchanged.
- **`app/(main)/[username]/page.tsx`** no longer passes eligibility to the
  header.

No replacement contact system was added.

## Messaging modules

**Deleted:**

| File | Lines |
|---|---|
| `app/(main)/messages/[id]/MessageThread.tsx` | 546 |
| `app/(main)/messages/[id]/actions.ts` | 388 |
| `app/(main)/messages/[id]/messageMutations.test.ts` | 259 |
| `lib/db/messaging.ts` | 240 |
| `app/(main)/messages/ConversationListClient.tsx` | 142 |
| `app/(main)/messages/layout.tsx` | 140 |
| `app/(main)/messages/page.tsx` | 127 |
| `app/(main)/messages/[id]/page.tsx` | 96 |
| `app/api/messages/[id]/poll/route.ts` | 77 |
| `lib/conversationActions.ts` | 53 |
| `app/api/messages/unread/route.ts` | 42 |
| `lib/messagingEligibility.ts` | 37 |
| `app/(main)/messages/[id]/loading.tsx` | 22 |
| `app/(main)/messages/loading.tsx` | 17 |
| **Total** | **2,186** |

Their types (conversation rows, `ThreadMessage`, `MessagingRepository`,
`ConversationResult`, eligibility results) went with them.

No application code can call `find_or_create_conversation` any more.

**Kept, deliberately:**

- **`isBlockedPair`**, in `lib/blocking.ts` and the viewer-state repository.
  Messaging was its only production caller, but blocking is trust-and-safety
  infrastructure and the brief keeps it.
- **All other shared blocking and viewer code.**

## Repository/parity

- **`messagingRepository`**, with both of its adapter implementations, is gone
  from `lib/db/readAdapter.ts`.
- **`messaging`** is gone from `MIGRATABLE_READ_DOMAINS`.
- **The live parity harness and preview check** had no messaging entry to
  remove.
- **`READ_MIGRATED_DOMAINS` compatibility.** It throws on an unknown domain
  name. An environment still listing `messaging` would therefore have failed
  every read after this deploy. `RETIRED_READ_DOMAINS = ["messaging"]` makes
  the parser ignore that name, and a genuine typo still throws. The guard test
  asserts both.
- **`scripts/migration/read-registry.mjs`** lost its four messaging entries,
  including a stale `lib/messaging.ts`, and still reports 0 unclassified.
- **`tsconfig.check.json`** lost its four deleted entries.
- **Viewer-state comments and tests** no longer describe message eligibility.
- **`lib/writeFreeze.test.ts`** no longer lists `/messages/123` as a domain the
  freeze must cover. Enforcement is unchanged, because the freeze refuses every
  non-GET request by path.

## Realtime

**Removed:** `MessageThread`'s `postgres_changes` subscription on
`messages:${conversationId}`, and its 12-second polling fallback.

**What remains:**

- `lib/realtime.ts` (`shouldUseRealtime`) is still used by `NotificationBell`
  and the dashboard `PostsTable`, so it stays.
- Notification polling is unchanged.

**Database side:** none of `conversations`, `conversation_participants` or
`messages` is in any realtime publication. The messaging subscription could
never have received an event, so there is nothing to remove there.

## Notifications

- **`NotificationsForm`** lost the "New messages" email row and the "Direct
  messages" push row.
- **Keys removed** from the preference interface, the settings page defaults,
  and the key unions in `lib/email.ts`, `lib/push.ts` and
  `lib/publicationDelivery.ts`: `email_messages` and `push_messages`.
- **No notification category or type** existed for messages. Production has 0
  such rows.
- **Comments, likes, follows and publication notifications** are unchanged, and
  their tests pass.

The stored JSONB keys stay. The settings page spreads the stored preferences
into the form state, so a whole-form save carries any stored key through, and
the per-switch RPC writes one key at a time.

## Email

Removed: the message email from `messages/[id]/actions.ts`. It was sent through
the generic `sendUserEmail` with `preferenceKey: "email_messages"` and a 30-minute
per-recipient cooldown recorded in `conversation_participants.last_email_notified_at`.
There was no separate template or sender function to delete.

Generic, transactional and auth email are untouched. No historic delivery record
was touched.

## Push

Removed: the message push sent through `sendPushNotification` with
`preferenceKey: "push_messages"`. Push for published work, comments, likes,
follows, the daily brief and subscribed authors is unchanged.

The push prompt banner's copy no longer promises a notification "when someone
messages you".

## Privacy

`allow_messages` is gone from the UI:

- **`PrivacyForm`:** the "Who can start a conversation with you" select and its
  help text;
- **Command Center `VisibilitySection`:** the same select and the "Anyone can
  start a conversation" summary sentence;
- **Settings default** and both **save actions**;
- **Command Center model and loader.**

The section is now called **Visibility**, not "Visibility and contact".

**The stored key survives a save.** Both privacy saves rebuild the
`privacy_settings` object from validated values, so dropping the field alone
would have erased the stored `allow_messages` the next time a member saved.
Both saves now:

1. read the stored settings through `get_my_profile_private`;
2. carry `allow_messages` forward through
   `retainedPrivacySettings` (`lib/profilePrivate.ts`, marked
   `LEGACY COMPATIBILITY`), which only carries a string value;
3. refuse to save if that read fails.

## Analytics

- **Event names** `message_started` and `message_sent` are gone from
  `ActivationEventName` and the `/api/activation` allowlist. Their emitters
  were in `MessageThread`.
- **Admin analytics** lost its Messaging section ("Messages Sent") and the
  `messages` count query behind it.
- **Historic events are untouched:** 51 `message_sent` and 186
  `message_started` rows.

## Safety

- **Blocking is unchanged.**
  - Comment threads exclude blocked people through `getBlockedUserIds`
    (`lib/commentThread.ts`).
  - Home and `/api/feed` exclude them through `getFeedExcludedUserIds`.
  - Explore suggestions and publication delivery read `user_blocks`.
  - A blocked visitor still sees no relationship controls.
- **Reporting is unchanged.** It accepts `post`, `comment` and `user`, and
  there was no message report type to remove.
- **Suspension enforcement is unchanged.** Comments and publishing call
  `requireNotSuspended`. Only the wording changed, in three places, to match
  what is actually enforced:
  - `lib/suspension.ts`: "You can browse but cannot publish or comment."
  - The suspension notification: "You can still browse, but publishing and
    commenting are disabled."
  - The suspension email: "You can still browse Indegenius, but publishing and
    commenting are disabled."
- **Moderation and content removal** are untouched.

## Database write disablement

**Necessary: yes.** A read-only audit of grants and row level security on
2026-09-15 found the following.

### Privileges before

- **Tables:** `anon`, `authenticated` and `service_role` held SELECT, INSERT,
  UPDATE, DELETE and TRUNCATE on all three tables (Supabase's default grants).
- **`find_or_create_conversation(uuid)`:** SECURITY DEFINER; EXECUTE held by
  `authenticated` and `service_role`, not `anon`.

### Row level security before

RLS is on for all three tables and not forced.

| Table | Policy | Command | Roles | Rule |
|---|---|---|---|---|
| `conversations` | `participants_select_conversation` | SELECT | public | caller is a participant |
| `conversation_participants` | `participants_select_own` | SELECT | authenticated | `is_conversation_participant(conversation_id)` |
| `conversation_participants` | `participants_update_own` | UPDATE | public | own row |
| `messages` | `participants_select_messages` | SELECT | authenticated | `is_conversation_participant(conversation_id)` |
| `messages` | `sender_insert_message` | INSERT | authenticated | sender is caller and `can_send_message_in_conversation(conversation_id)` |
| `messages` | `sender_update_message` | UPDATE | public | own messages |

### What a client could do without the application

- **Open a conversation:** via `find_or_create_conversation`, allowed for a
  mutual follow, the same university, or a public open talent profile.
- **Post a message:** into a conversation it belongs to, via
  `sender_insert_message`.
- **Edit or soft-delete its own messages, and update its participant row.**
- **Not reachable:** inserting a conversation directly (no INSERT policy) and
  any DELETE (no DELETE policy).

### The migration

`20260915000001_disable_messaging_writes.sql`, two statements in one
transaction:

```sql
revoke execute on function public.find_or_create_conversation(uuid)
  from public, anon, authenticated;

revoke insert, update, delete, truncate
  on table public.conversations, public.conversation_participants, public.messages
  from public, anon, authenticated;
```

It drops nothing, deletes nothing and revokes no SELECT. It changes no policy,
trigger or other function, and it does not name `service_role`.
`supabase/migrations/messagingWriteDisablementMigration.test.ts` asserts all of
that.

### Privileges and behaviour after

From the dry run against production, rolled back.

| | Before | After |
|---|---|---|
| `anon` on each table | SELECT, INSERT, UPDATE, DELETE, TRUNCATE | SELECT |
| `authenticated` on each table | SELECT, INSERT, UPDATE, DELETE, TRUNCATE | SELECT |
| `service_role` on each table | all | all (unchanged) |
| `find_or_create_conversation` EXECUTE | authenticated, service_role | service_role only |
| Acting as `authenticated`: insert a message | refused by RLS (no session in the probe) | **permission denied** |
| Acting as `authenticated`: open a conversation | refused by the function ("Authentication required", no session in the probe) | **permission denied** |
| Row counts | 20 / 39 / 52 | 20 / 39 / 52 |

The probes run inside savepoints that are always rolled back, so they cannot
leave a row behind even if a write were allowed.

**Historical reads that remain possible:**

- Participants can still read their own conversations and messages through the
  existing SELECT policies.
- `service_role` and the database owner can read and write everything, which
  the database cleanup phase needs in order to snapshot and drop these tables.

**Status:** not applied. READY FOR DEPLOYMENT — APPLY AFTER APP DEPLOY.

## Historical data

Confirmed untouched:

- **Rows:** all 20 conversations, 39 participant rows and 52 messages. The
  route checks re-counted them after the build.
- **Preference and privacy data:**
  - the stored `allow_messages` values, now also protected against erasure on
    save;
  - the `email_messages` and `push_messages` preference keys.
- **History:** the 237 historic messaging activation events.

No export, archive, read-only inbox or migration wizard was built. Members no
longer have an inbox, and old links redirect to Notifications.

## Cron migration

`20260914000001_remove_review_reminders_cron_job.sql` is still not applied. A
read-only check at the start of this phase found `indegenius-review-reminders`
still scheduled. It remains READY FOR DEPLOYMENT — APPLY BEFORE APP DEPLOY, and
the Phase 2D dry run still stands.

`/api/cron/review-reminders` was not recreated. `20260908000001_database_telemetry.sql`
is still stale and must be rebased onto `20260914000001` before it is ever applied.

## Files

- **Deleted: 14 files, 2,186 lines** (table above).
- **Added: 4 files, 554 lines.**
  - `supabase/migrations/20260915000001_disable_messaging_writes.sql` (61)
  - `supabase/migrations/messagingWriteDisablementMigration.test.ts` (68)
  - `scripts/migration/apply-messaging-write-disablement.mjs` (241)
  - `lib/retiredMessaging.test.ts` (184)
- **Modified: 44 files.**
  - **Profile:** `ProfileHeader.tsx` (+test), `[username]/page.tsx` and its
    `publicReadPath.test.ts`, `profileViewData.ts` (+test).
  - **Settings:** `settings/page.tsx`, `NotificationsForm.tsx` (+test),
    `PrivacyForm.tsx`, `profileActions.ts`, `settings/profile/actions.ts`,
    `VisibilitySection.tsx`, `ProfileCommandCenter.test.tsx`,
    `lib/profileCommandCenter.ts` (+test), `lib/profileCommandCenterData.ts`,
    `lib/profilePrivate.ts`.
  - **Delivery:** `lib/email.ts`, `lib/push.ts`, `lib/publicationDelivery.ts`,
    `PushPromptBanner.tsx`.
  - **Analytics:** `lib/activationEvents.ts`, `app/api/activation/route.ts`,
    `admin/analytics/page.tsx`.
  - **Safety copy:** `lib/suspension.ts`, `admin/moderation/actions.ts`.
  - **Shell:** `navRoutes.ts` (+test), `AppShell.tsx` (+test),
    `app/robots.ts`, `NotificationBell.tsx`.
  - **Database boundary:** `lib/db/readAdapter.ts`, `lib/db/viewerState.ts`,
    `viewerState.neon.test.ts`, `viewerState.parity.live.test.ts`,
    `lib/writeFreeze.test.ts`.
  - **Copy and comments:** `reset-password/page.tsx`, `lib/commentContent.ts`.
  - **Config:** `next.config.mjs`, `scripts/migration/read-registry.mjs`,
    `tsconfig.check.json`, `CLAUDE.md`.

### Surviving references

| Occurrence | Class |
|---|---|
| `supabase/migrations/**`, including the new `20260915000001`; `supabase/pending/**`; `scripts/migration/out/**` schema dumps | MIGRATION HISTORY / DATABASE DEFERRED |
| `emailBroadcastsMigration.test.ts`, `debateRemovalMigration.test.ts`, `profileSecurityMigration.test.ts`, `messagingWriteDisablementMigration.test.ts` | MIGRATION HISTORY |
| `scripts/migration/apply-messaging-write-disablement.mjs` | ADMIN MIGRATION TOOLING |
| `RETIRED_PRIVACY_SETTING_KEYS` / `retainedPrivacySettings` in `lib/profilePrivate.ts` | DATABASE DEFERRED |
| `RETIRED_READ_DOMAINS` in `lib/db/readAdapter.ts` | DATABASE DEFERRED (environment compatibility) |
| `next.config.mjs` redirects, `RESERVED_PROFILE_PATHS`, `GuestBanner` route list | KEEP |
| `isBlockedPair` (no production caller) | KEEP (trust and safety) |
| "conversation" in comment and discussion copy ("Join the conversation", "Start the conversation", the post conversation view, the catalog's comment section) | KEEP (not messaging) |
| `docs/auth-and-rls-migration.md`, `database-access-inventory.md`, `neon-freshness-strategy.md`, `profile-rebuild-audit.md`, `publishing-core-v2-audit.md`, `realtime-blocker.md`, `rpc-identity-migration.md` | HISTORICAL DOC (a docs pass should update them) |
| reset-password proof copy, push banner copy, three suspension notices, comments in `AppShell`, `NotificationBell`, `push.ts` and `commentContent.ts`, registry and typecheck entries | STALE, fixed |

No ordinary application feature reads or writes `conversations`,
`conversation_participants` or `messages`, or calls `find_or_create_conversation`.

## Tests

Sequential, on the final tree:

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | 1 failed (baseline `parameterizeIdentityRpcsMigration.test.ts`, same assertion), 2,503 passed, 267 skipped; files 1 failed, 225 passed, 17 skipped |
| `npm run build` | pass, 52 static pages (was 53) |
| New failures | **0** |

Full-project `tsc`, outside the typecheck subset: 49 errors, the same set as
before this phase. The one line that differs is the existing
`NotificationsForm.test.tsx` fixture error, which now lists one key fewer.

The test count changed from Phase 2D's 2,496 passed. `messageMutations.test.ts`
and the messaging cases in the profile, header and settings tests were removed.
Two files were added:

- **`lib/retiredMessaging.test.ts`** reads no migration file and strips
  comments before matching. It asserts:
  - the deleted paths do not exist;
  - no `MessageThread`, `ConversationListClient`, `MessageButton`,
    `messagingRepository`, `conversationActions`, `messagingEligibility` or
    `find_or_create_conversation` appears in `app/`, `components/` or `lib/`;
  - nothing reads or writes the messaging tables;
  - nothing links to `/messages` or `/api/messages`;
  - no `message_started` or `message_sent` event exists;
  - no `email_messages`, `push_messages` or `allow_messages` appears in active
    code (the retention helper is the one allowed file);
  - no conversation or direct-message copy appears;
  - the shell and `robots.ts` name no messaging route;
  - both redirects exist and are permanent;
  - `messages` stays reserved;
  - `messaging` is not a read domain, and one left in an environment is ignored
    while typos still throw;
  - `retainedPrivacySettings` carries only a stored string `allow_messages`.
- **`messagingWriteDisablementMigration.test.ts`** is the migration contract.

## Deferred database cleanup

Nothing below was executed. The catalogue facts come from the read-only audit.

**Tables:**

- `conversations` (20 rows)
- `conversation_participants` (39 rows, including the `last_email_notified_at`
  cooldown column)
- `messages` (52 rows)

Foreign keys: `conversation_participants.conversation_id` and
`messages.conversation_id` point to `conversations`, and `.user_id` and
`.sender_id` point to `profiles`, all ON DELETE CASCADE. No other table
references them.

**Indexes:** `conversations_pkey`, `conversations_participant_pair_key`,
`conversations_last_message_idx`, `conversation_participants_pkey`,
`conv_participants_user_idx`, `messages_pkey`,
`messages_conversation_created_idx`. They go with the tables.

**Functions:**

- `public.find_or_create_conversation(uuid)`: SECURITY DEFINER, and the last
  holder of the retired talent-profile eligibility rule;
- `public.can_send_message_in_conversation(uuid)`: SECURITY DEFINER, reads the
  recipient's `allow_messages`;
- `public.is_conversation_participant(uuid)`: SECURITY DEFINER;
- `public.enforce_message_soft_delete()`;
- `public.touch_conversation_last_message()`.

**Triggers on `messages`:**

- `messages_enforce_soft_delete` (on update and delete);
- `messages_touch_conversation_last_message` (on insert).

**RLS policies:** the six listed under Database write disablement.

**Grants:** the SELECT that clients keep after `20260915000001` goes when the
tables are dropped.

**Realtime:** nothing to remove. The tables are in no publication.

**Profile and preference data:**

- `privacy_settings.allow_messages` on 266 profiles. Drop the key, then delete
  `retainedPrivacySettings` and `RETIRED_PRIVACY_SETTING_KEYS`.
- `notification_prefs.email_messages` on 266 profiles and `push_messages` on 3.
- The `email_messages` and `push_messages` entries in
  `private.set_notification_preference_impl`'s allowlist and in any database
  default-preference definitions.

**Application compatibility to remove afterwards:**

- `RETIRED_READ_DOMAINS`, once no environment lists `messaging`;
- `scripts/migration/apply-messaging-write-disablement.mjs`.

**Analytics:** 51 `message_sent` and 186 `message_started` rows in
`activation_events`. Recommendation: keep them as history, like the retired
opportunity events, unless the analytics retention policy says otherwise. No
active code names either event.

**Suggested order:**

1. Snapshot the three tables.
2. Revoke and drop the policies.
3. Drop the two triggers and their functions.
4. Drop `find_or_create_conversation`, `can_send_message_in_conversation` and
   `is_conversation_participant`.
5. Drop `messages`, then `conversation_participants`, then `conversations`.
6. Remove the JSONB keys and the preference allowlist entries.
7. Remove the two compatibility shims from the application.
8. Update the schema dump and the Neon manifest.

## Next phase recommendation

**Phase 2F: Home, Feed & Retention Simplification.** Stop deleting whole product
families and make Home read as publications first:

- `HomeSidebar` and the Intellectual Brief;
- the featured lead;
- the People and Topic interludes;
- the welcome banner and the push prompt banner;
- retention cards and activation nags;
- the daily brief;
- excess feed tabs and unnecessary feed-ranking complexity;
- dashboard clutter.

Before or alongside it, the owed deploy steps: apply the Cron removal, deploy,
then apply the messaging write disablement.
