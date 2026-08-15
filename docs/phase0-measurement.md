# Phase 0 measurement baseline

The executable foundation is
`supabase/migrations/20260815000002_phase0_measurement_foundation.sql`.
This document records its metric contract; applying the migration remains a
separate staging/production operation.

## Ordered journey

The service-role-only `get_phase0_measurement_baseline()` RPC reports one
ordered, all-time cohort by default. Optional `p_cohort_start` and
`p_cohort_end` timestamps select an account-created cohort; the end is
exclusive.

1. **Signup:** `profiles.created_at`, meaning account creation rather than email
   verification.
2. **Onboarding:** the first trusted `profiles.onboarding_completed_at` at or
   after signup. Historical completed profiles without an attributable event
   remain untimestamped and are reported separately.
3. **First publication:** the first primary-authored `posts` row with a non-null
   `published_at` after onboarding.
4. **Second publication in 30 days:** the next distinct qualifying post, no
   later than 30 elapsed days after the first.
5. **Meaningful response:** the first published response post received after
   the second publication, excluding self-responses. Comments and response CTA
   clicks are deliberately not mixed into this metric.
6. **D30 retained:** an authenticated `user_activity_days` fact on the UTC
   calendar date 30 days after the signup date. A cohort member becomes eligible
   only after that UTC day has fully elapsed and only when the date falls
   strictly after the earliest collected activity day. The potentially partial first day
   and all pre-instrumentation D30 dates are
   excluded rather than counted as failures.

The strict full-funnel D30 denominator includes only members who reached the
meaningful-response milestone before their D30 date begins, preserving the
stage order. The RPC also
reports overall D30 eligibility and retention for the complete signup cohort.

## Collection and trust boundaries

- `complete_onboarding()` owns both the durable timestamp and its matching
  activation event in one transaction. Direct authenticated changes to either
  onboarding measurement field are rejected, and the RPC verifies the required
  persona, identity, and interest fields before recording completion.
- `record_user_activity_day()` derives both identity and UTC date from the
  authenticated request. Its composite primary key makes repeated app-shell
  calls idempotent.
- `activation_events` no longer accepts anonymous inserts or user IDs other than
  the authenticated caller. The ordered baseline does not depend on raw event
  downloads or their former 10,000-row dashboard cap.
- The baseline RPC is granted only to `service_role`; the web admin page first
  performs the existing `analytics.view` authorization check before using the
  admin client.

## Known baseline limitations

- Deleted posts cannot be reconstructed. Co-authors are not counted; publication
  attribution uses `posts.author_id` only.
- Historical onboarding completion is timestamped only when a matching joined
  activation event exists. Those legacy events predate the hardened insert
  policy and are therefore lower-confidence; missing timestamps remain visible
  as a data-quality count rather than being guessed.
- Activity-day collection begins when this migration and app wiring are both
  deployed, so exact D30 retention needs 31 completed UTC days to mature.
