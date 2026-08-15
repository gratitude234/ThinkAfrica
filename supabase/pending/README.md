# Pending database changes

Files in this directory are reviewed SQL release candidates, not executable
Supabase migrations. Supabase CLI does not include this directory in `db push`.

`author_subscriptions_publication_delivery_v1.sql` must not be copied into
`supabase/migrations/` until every staging and production probe in
`docs/debate-deployment-state.md` is recorded. In particular, the deployed
migration ledger and the complete live `notifications_type_check` definition
must be known before assigning the migration timestamp.

`topic_subscriptions_v1.sql` is a separate extension and must receive a later
timestamp. Do not promote it until the author-subscription candidate has been
applied and verified in staging. It intentionally backfills canonical topic
keys, but never profile interests, subscriptions, publication events, or
deliveries.

`ai_topic_suggestions_v1.sql` is independent of subscription delivery and may
be promoted before Topic Subscriptions once the Debate migration ledger is
resolved. It adds only separated Research keywords and a private daily Gemini
quota; it never rewrites published Research tags or stores draft content.

`profile_private_projection_contract.sql` is the CONTRACT half of the Phase 0
profile-security rollout. Do not promote it until migrations
`20260815000001`/`20260815000002` are verified in staging and the application
version that reads owner-only fields through `get_my_profile_private()` is
already deployed and exercised. Applying it before that cutover will break
older settings, onboarding, notification, subscription, and home clients.
