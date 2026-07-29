# Topic Subscriptions V1 — release gate

Last updated: 2026-07-29.

## Current state

Topic Subscriptions extend the Author Subscriptions publication-delivery
infrastructure and are gated by:

```text
NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED=1
NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED=1
```

Both values must be exactly `1`. Keep the topic flag unset or set to `0` for
the initial code deployment. With the topic flag off, no topic table or
`posts.topic_keys` query is made, and the existing interest-based topic
controls remain available.

The topic SQL is intentionally stored at:

```text
supabase/pending/topic_subscriptions_v1.sql
```

It is not part of the executable Supabase migration ledger.

## Prerequisites

1. Complete every live staging and production probe in
   `docs/debate-deployment-state.md`.
2. Reconcile any migration-ledger/catalog disagreement.
3. Promote, apply, verify, and release the Author Subscriptions migration.
4. Confirm the deployed `notifications_type_check` still matches the reviewed
   constraint before assigning Topic V1 a later timestamp.

Do not combine Topic V1 with the first Author Subscriptions release. The topic
candidate assumes `publication_events` and `publication_deliveries` already
exist.

## Staging verification

1. Deploy code with the topic flag off.
2. Apply only the reviewed Topic V1 migration to staging.
3. Confirm canonical `topic_keys` were backfilled without new publication
   events or deliveries.
4. Confirm no `profiles.interests` rows or topic subscriptions were created.
5. Use a primary author, accepted co-author, direct author subscriber, topic
   subscriber, multi-topic subscriber, and blocked reader.
6. Publish a tagged Article, Research item, and—where supported—a tagged Post.
7. Verify one in-app row per recipient, author email/push behavior remains
   unchanged, topic-only recipients receive no email/push, and blocked or
   credited users receive nothing.
8. Verify tracked opens and qualified reads update the correct delivery once.
9. Verify Stats shows deduplicated overall, direct-author, and topic segments
   without exposing subscriber identities.
10. Enable the topic flag in staging and walk through the Topics directory,
    topic page, Explore controls, Home Topics feed, notifications, and settings
    manager before production rollout.

## Recovery behavior

Topic fan-out uses the existing immediate `after()` scheduling and daily-brief
recovery worker. It adds no cron. A topic subscription created after a
publication event does not receive that publication, and topic-only matches
create in-app delivery only.
