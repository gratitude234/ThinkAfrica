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
