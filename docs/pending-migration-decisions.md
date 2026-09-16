# Pending migrations: what is actually applied

Five reviewed SQL release candidates live in [supabase/pending/](../supabase/pending/).

**Phase 2 recorded all five as unapplied. Four of them are live in production.**
That was wrong, and how it was wrong is worth keeping: Phase 2 inferred from
the files (each header says "do not apply", and no promoted migration exists in
`supabase/migrations/`) rather than asking the database. Phase 3 asked the
database.

Measured with `node scripts/migration/check-pending-state.mjs`, which checks
each candidate against the objects it would create rather than against its own
documentation.

---

## 1. The actual state

| File | State | Evidence |
|---|---|---|
| `author_subscriptions_publication_delivery_v1.sql` | **APPLIED** | `author_subscriptions`, `publication_events`, `publication_deliveries`, `claim_publication_events()`, `capture_first_publication_event()` all present |
| `author_subscriptions_ux_v2.sql` | **APPLIED** | `author_subscription_events`, `set_author_relationship_v2()`, `list_my_author_subscriptions()` all present |
| `topic_subscriptions_v1.sql` | **APPLIED** | `topic_subscriptions`, `set_topic_subscription()`, `normalize_topic_key()` all present |
| `ai_topic_suggestions_v1.sql` | **APPLIED** | `ai_topic_suggestion_quotas`, `claim_ai_topic_suggestion_quota()`, `posts.research_keywords` all present |
| `profile_private_projection_contract.sql` | **NOT APPLIED** | `profiles` still carries table-level `SELECT` for `anon` and `authenticated` (2 grants), alongside 74 column-level grants. The whole effect of this file is to revoke the former |

The four applied ones were promoted to production at some point without a
timestamped migration file being added to `supabase/migrations/`. The ledger
and the database disagree, and the database is right.

## 2. What this changes for Neon

**Nothing needs deciding.** A `pg_dump` copies what is live, so the four
applied candidates came across automatically, and Neon holds the same objects
Supabase does. Verified: 80 tables on both sides, 151 policies on both sides,
row-for-row digests matching.

`profile_private_projection_contract.sql` is not applied on either side, so
both databases agree there too. Parity is preserved by doing nothing.

The Phase 2 instruction "exclude all five from Neon" turned out to describe a
situation that did not exist. Following it literally would have *created* the
divergence it was written to prevent.

## 3. What it changes for the application

The feature flags are still the gate, and they are still off:

| Flag | Value | Objects that exist anyway |
|---|---|---|
| `NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED` | off | `author_subscriptions`, `publication_events`, `publication_deliveries` |
| `NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED` | off | `author_subscription_events`, `set_author_relationship_v2` |
| `NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED` | off | `topic_subscriptions`, `set_topic_subscription` |
| `NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED` | off | `posts.research_keywords`, `ai_topic_suggestion_quotas` |

Those flags exist because PostgREST rejects a select naming a column that does
not exist, and the profile page reads that rejection as a missing profile. That
risk is gone for these four: the columns are there. Turning a flag on is now a
product decision rather than a deployment hazard, and it can be made
independently of this migration.

`NEXT_PUBLIC_PROFILE_POSITIONING_ENABLED` is unaffected and its migration
`20260826000001` is separately applied; the *contract* half remains pending.

## 4. Objects with no CREATE TABLE in the repository at all

The same catalogue read turned up three more:

| Object | Note |
|---|---|
| `public.content_reports` | Exists in production. No `CREATE TABLE` in `supabase/migrations/`. `public.reports` also exists and is the one application code uses (6 call sites; `content_reports` has none) |
| `public.post_views` | Exists, 0 rows, no `CREATE TABLE` in the repository, no application reference |
| `private.provision_personal_workspace_impl()` | A `SECURITY DEFINER` function using `auth.uid()`, with no definition anywhere in the repository |

All three copied to Neon with everything else. None is referenced by
application code. They are **not** removed here: an object nobody can account
for is a reason to investigate, not a reason to drop, and Phase 3 is not the
place to decide. They are named so that Phase 4 has to look at them.

## 5. The rule this replaces

Phase 2's rule was "a schema difference between Supabase and Neon is acceptable
only while it is written down". That still holds. What Phase 3 adds is the
reason it nearly failed: **the difference to write down has to be measured, not
inferred from the files that were supposed to cause it.** A release candidate's
header describes what its author intended, not what is in the database.
