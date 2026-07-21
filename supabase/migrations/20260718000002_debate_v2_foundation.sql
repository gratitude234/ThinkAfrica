-- Phase 1 of the Debate V2 redesign (see docs/debate-v2-product-contract.md).
-- This is the "expand" step only: it adds a version discriminator and seven
-- new, dormant tables so Debate V2 has an additive data foundation. It does
-- not change Debate V1 behaviour, does not ship any new UI, lifecycle
-- automation, notification delivery, AI functionality, or write RPCs, and
-- does not enable direct client writes to any new table beyond the
-- one-time, conflict-safe backfill below.
--
-- This revision includes a hardening pass requested before this migration
-- is applied, on top of the original additive schema: same-debate
-- referential integrity for round_id/parent_argument_id/
-- influential_argument_id (sections D and G), a parent_argument_id/
-- relation_type pairing constraint (section D), membership-drift sync
-- triggers with a documented mandatory Phase 2 catch-up requirement
-- (section B), a format_version activation guard (section A), and a
-- profiles privilege-column-protection trigger (section J). Every addition
-- is still additive/dormant by the same standard as the rest of this
-- migration -- none of it changes what a compliant V1 client could already
-- do; it closes gaps a client should never have been able to reach in the
-- first place.
--
-- A second, edge-case correction pass followed on top of that hardening
-- pass, closing gaps the hardening pass itself introduced or left
-- incomplete: parent_argument_id's ON DELETE SET NULL cascade is now kept
-- consistent with the parent/relation pairing CHECK (section D), debate_id
-- is immutable after creation on debate_rounds/debate_arguments/
-- debate_ballots (sections C, D, G), debates_guard_format_version() now
-- blocks a change in either direction rather than only a write of 2
-- (section A), and a new BEFORE INSERT trigger closes the same
-- role/verified/verified_type escalation gap the UPDATE trigger closed,
-- this time on profile creation (section J).
--
-- Existing tables this migration deliberately leaves untouched (except the
-- narrow, documented hardening/correction triggers added to debates,
-- debate_rounds/debate_arguments/debate_ballots, and profiles):
--   - public.debates (format_version column + a guard trigger that blocks
--     an authenticated client from changing format_version in either
--     direction, on insert or update)
--   - public.debate_participants (still the live V1 join-a-side table; the
--     new AFTER INSERT sync trigger observes inserts, it does not change
--     what can be inserted or how)
--   - public.debate_motion_votes (still the live V1 community-vote table)
--   - public.debate_votes (V1 argument upvotes)
--   - public.profiles (BEFORE INSERT and BEFORE UPDATE triggers block
--     setting/changing role/verified/verified_type from an authenticated
--     session; every other column, handle_new_user()'s automatic
--     university-email verification, and every existing self-service edit
--     path are unaffected)
--   - every existing RPC: join_debate, cast_motion_vote, toggle_debate_vote,
--     start_debate, advance_debate_phase, close_debate -- none of them is
--     modified by this migration
--
-- No local PostgreSQL/Supabase harness is configured in this repo (see
-- CLAUDE.md), so this migration has been verified by static review and by
-- the pure-JS ports of its key invariants in lib/debateV2.test.ts, not by
-- execution. It still needs to be applied and verified in a real Supabase
-- environment before Phase 2 builds on it.

-- ---------------------------------------------------------------------------
-- A. Version existing debates
-- ---------------------------------------------------------------------------

ALTER TABLE public.debates
  ADD COLUMN IF NOT EXISTS format_version smallint NOT NULL DEFAULT 1;

ALTER TABLE public.debates
  DROP CONSTRAINT IF EXISTS debates_format_version_check;
ALTER TABLE public.debates
  ADD CONSTRAINT debates_format_version_check
  CHECK (format_version IN (1, 2));

COMMENT ON COLUMN public.debates.format_version IS
  'Additive V1/V2 discriminator (Debate V2 Phase 1, see docs/debate-v2-product-contract.md). Existing and newly created debates stay format_version = 1 unless a future V2 creation path explicitly writes 2. This migration does not modify the existing debate creation UI, so no path currently writes 2. NOT YET a secure activation boundary on its own -- see debates_guard_format_version() below, which is what actually enforces that.';

-- Hardening pass: format_version is not yet a secure activation boundary by
-- itself. The existing "Verified users and editors can create debates"
-- INSERT policy and the "Moderators can update their debates" UPDATE policy
-- (20260402000000_phase2_schema.sql) do not mention format_version at all,
-- and debate creation is a direct, `authenticated`-role client insert (see
-- app/(main)/debates/create/page.tsx) -- there is no RPC gatekeeping it.
-- Without this guard, any verified/editor/admin user could set
-- format_version = 2 on create, or a moderator could flip it post-creation
-- via a direct .update(), years before any V2 creation flow or lifecycle
-- code exists to back that debate with real V2 data. Block it explicitly
-- now rather than relying on "nothing reads it yet" as the only protection.
--
-- This intentionally blocks every `authenticated`-role write, including a
-- future SECURITY DEFINER RPC invoked by an ordinary end-user session:
-- auth.role() reflects the original request's JWT, not the executing
-- function's privilege level, so a Phase 2 "activate Debate V2" RPC called
-- by a moderator would still read auth.role() = 'authenticated' here and be
-- blocked. That is intentional -- Phase 2's controlled activation path must
-- add its own explicit, reviewed bypass (e.g. an admin/service-role-only
-- path) when it is built, not inherit a silent one from this migration.
--
-- Correction pass: the original version of this trigger only rejected
-- writing format_version = 2, which left format_version = 2 -> 1 wide open
-- for an authenticated client -- not a meaningful "downgrade" in Phase 1
-- since nothing can create a 2 anyway, but inconsistent with "authenticated
-- clients cannot change format_version" as a rule, and a real gap the
-- moment anything ever does carry format_version = 2. It now blocks any
-- change in either direction on UPDATE, while still special-casing INSERT
-- so the column's own DEFAULT 1 keeps working: a plain UPDATE...OLD
-- comparison doesn't apply to INSERT (there is no OLD row), so an
-- authenticated INSERT is checked against the literal value 1 instead --
-- every existing insert path (debate creation, which never sets
-- format_version) resolves to the DEFAULT and passes; only an insert that
-- explicitly supplies a non-1 value is rejected.
CREATE OR REPLACE FUNCTION public.debates_guard_format_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF TG_OP = 'INSERT' AND NEW.format_version <> 1 THEN
      RAISE EXCEPTION 'format_version must be 1 for new debates. Debate V2 creation ships in a later phase.';
    ELSIF TG_OP = 'UPDATE' AND NEW.format_version IS DISTINCT FROM OLD.format_version THEN
      RAISE EXCEPTION 'format_version cannot be changed after a debate is created.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debates_guard_format_version ON public.debates;
CREATE TRIGGER debates_guard_format_version
BEFORE INSERT OR UPDATE OF format_version ON public.debates
FOR EACH ROW
EXECUTE FUNCTION public.debates_guard_format_version();

-- ---------------------------------------------------------------------------
-- B. public.debate_memberships
-- ---------------------------------------------------------------------------
-- Replaces the implicit "debate_participants row = debater" model with an
-- explicit (debate_id, user_id, role) membership that also covers jurors and
-- moderators. A person can hold multiple roles in the same debate (e.g. a
-- moderator who is also a debater), which is why role is part of the primary
-- key instead of one row per person per debate.

CREATE TABLE IF NOT EXISTS public.debate_memberships (
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('moderator', 'debater', 'juror')),
  stance text CHECK (stance IS NULL OR stance IN ('for', 'against')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (debate_id, user_id, role),
  CONSTRAINT debate_memberships_stance_matches_role CHECK (
    (role = 'debater' AND stance IN ('for', 'against'))
    OR (role <> 'debater' AND stance IS NULL)
  )
);

COMMENT ON TABLE public.debate_memberships IS
  'Debate V2 Phase 1 (additive, dormant): explicit role + stance per person per debate. Backfilled once from debate_participants (as role=debater) and debates.moderator_id (as role=moderator); debate_participants itself is untouched. Public SELECT only in Phase 1 -- Phase 2 RPCs will own writes, mirroring join_debate.';

CREATE INDEX IF NOT EXISTS debate_memberships_debate_idx
  ON public.debate_memberships(debate_id);
CREATE INDEX IF NOT EXISTS debate_memberships_user_idx
  ON public.debate_memberships(user_id);
CREATE INDEX IF NOT EXISTS debate_memberships_debate_role_idx
  ON public.debate_memberships(debate_id, role);
CREATE INDEX IF NOT EXISTS debate_memberships_debate_role_stance_idx
  ON public.debate_memberships(debate_id, role, stance)
  WHERE stance IS NOT NULL;

ALTER TABLE public.debate_memberships ENABLE ROW LEVEL SECURITY;

-- Public read access is acceptable: existing participant membership and
-- stance are already publicly visible via debate_participants today.
CREATE POLICY "Debate memberships are viewable by everyone"
  ON public.debate_memberships FOR SELECT USING (true);

-- Intentionally no INSERT/UPDATE/DELETE policy yet. Phase 2 will introduce
-- membership-management RPCs (SECURITY DEFINER, like join_debate) rather
-- than allowing direct client writes to role/stance.

-- Backfill: existing participants become debater memberships. ON CONFLICT
-- makes this safe to run against a partially-migrated database; it never
-- modifies or deletes debate_participants.
INSERT INTO public.debate_memberships (debate_id, user_id, role, stance, joined_at)
SELECT debate_id, user_id, 'debater', stance, joined_at
FROM public.debate_participants
ON CONFLICT (debate_id, user_id, role) DO NOTHING;

-- Backfill: existing moderators become moderator memberships with no
-- stance. joined_at falls back to the debate's created_at since V1 never
-- recorded a separate moderator-joined timestamp.
INSERT INTO public.debate_memberships (debate_id, user_id, role, stance, joined_at)
SELECT id, moderator_id, 'moderator', NULL, created_at
FROM public.debates
WHERE moderator_id IS NOT NULL
ON CONFLICT (debate_id, user_id, role) DO NOTHING;

-- Hardening pass: membership drift.
--
-- The backfill above is a one-time snapshot. V1's write paths
-- (join_debate() and the direct `debates` insert in
-- app/(main)/debates/create/page.tsx) keep writing to debate_participants
-- and debates.moderator_id after this migration runs, and Phase 1
-- deliberately does not touch either of them. Without something keeping
-- debate_memberships current, every debate/participant created *after* this
-- migration applies would be missing from debate_memberships, and it would
-- silently drift further out of sync until Phase 2 ships its own
-- membership-owning RPCs.
--
-- These triggers close that gap for the two actual V1 write paths (verified
-- by reading join_debate() and the debate-creation insert directly -- see
-- docs/debate-v2-product-contract.md). They are intentionally lightweight,
-- not a general-purpose sync layer:
--   - debate_participants rows are never updated after insert (join_debate()
--     only inserts once; if a participant row already exists it returns the
--     existing stance and does not write), so AFTER INSERT is sufficient --
--     no UPDATE trigger is needed.
--   - debates.moderator_id is set once at creation by every current code
--     path; nothing in the app reassigns it afterward. AFTER INSERT is
--     scoped accordingly. If moderator_id is later reassigned (no code path
--     does this today) or nulled by the profile's `ON DELETE SET NULL`, the
--     old moderator's membership row is intentionally left as-is rather than
--     guessed at here -- that is exactly the kind of gap the mandatory
--     Phase 2 catch-up backfill below exists to catch.
--
-- SECURITY DEFINER is required, not incidental: both debate_participants
-- (direct "Authenticated users can join a debate once" INSERT policy) and
-- debates (direct "Verified users and editors can create debates" INSERT
-- policy) are writable directly by an `authenticated` client, not only
-- through a SECURITY DEFINER RPC. debate_memberships has no INSERT policy
-- in Phase 1, so a SECURITY INVOKER trigger firing from that direct,
-- `authenticated`-role insert would hit RLS and roll back the *entire*
-- debate_participants/debates insert -- breaking join_debate and debate
-- creation outright. SECURITY DEFINER (matching join_debate/cast_motion_vote
-- elsewhere in this repo) makes the membership write run with the function
-- owner's privileges regardless of which path triggered it.
--
-- MANDATORY PHASE 2 REQUIREMENT: before any Phase 2 code treats
-- debate_memberships as authoritative (rather than as a convenience mirror
-- of debate_participants/debates.moderator_id), it MUST re-run a full,
-- conflict-safe catch-up backfill identical in shape to the one above
-- (`INSERT ... SELECT ... ON CONFLICT (debate_id, user_id, role) DO
-- NOTHING`) to reconcile any gap these triggers do not cover -- moderator
-- reassignment, moderator-profile-deletion nulling moderator_id, or any
-- write that reaches these tables outside of join_debate()/the debate
-- creation insert (e.g. direct SQL, admin tooling, a restored backup).
-- lib/debateV2.test.ts exercises the backfill's shape (including
-- re-running it against already-synced rows) so this requirement has test
-- coverage even without a local Postgres harness.
CREATE OR REPLACE FUNCTION public.sync_debate_participant_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.debate_memberships (debate_id, user_id, role, stance, joined_at)
  VALUES (NEW.debate_id, NEW.user_id, 'debater', NEW.stance, NEW.joined_at)
  ON CONFLICT (debate_id, user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debate_participants_sync_membership ON public.debate_participants;
CREATE TRIGGER debate_participants_sync_membership
AFTER INSERT ON public.debate_participants
FOR EACH ROW
EXECUTE FUNCTION public.sync_debate_participant_membership();

CREATE OR REPLACE FUNCTION public.sync_debate_moderator_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.moderator_id IS NOT NULL THEN
    INSERT INTO public.debate_memberships (debate_id, user_id, role, stance, joined_at)
    VALUES (NEW.id, NEW.moderator_id, 'moderator', NULL, COALESCE(NEW.created_at, now()))
    ON CONFLICT (debate_id, user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debates_sync_moderator_membership ON public.debates;
CREATE TRIGGER debates_sync_moderator_membership
AFTER INSERT ON public.debates
FOR EACH ROW
EXECUTE FUNCTION public.sync_debate_moderator_membership();

COMMENT ON FUNCTION public.sync_debate_participant_membership() IS
  'Hardening pass: keeps debate_memberships from drifting out of sync with debate_participants after Phase 1''s one-time backfill. Temporary -- Phase 2 mandatory catch-up backfill still required, see the comment above this function''s CREATE statement.';
COMMENT ON FUNCTION public.sync_debate_moderator_membership() IS
  'Hardening pass: keeps debate_memberships from drifting out of sync with debates.moderator_id after Phase 1''s one-time backfill. Temporary -- Phase 2 mandatory catch-up backfill still required, see the comment above sync_debate_participant_membership().';

-- ---------------------------------------------------------------------------
-- C. public.debate_rounds
-- ---------------------------------------------------------------------------
-- The future V2 lifecycle source of truth. Dormant in Phase 1: nothing
-- inserts rows here yet. debates.current_phase / debates.status remain
-- authoritative for V1 and are not read from or written to by this table.

CREATE TABLE IF NOT EXISTS public.debate_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  phase text NOT NULL CHECK (phase IN (
    'opening', 'rebuttal', 'cross_examination', 'closing', 'final_vote'
  )),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'active', 'completed', 'cancelled'
  )),
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (debate_id, sequence_number),
  CONSTRAINT debate_rounds_ends_after_starts CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at
  )
);

COMMENT ON TABLE public.debate_rounds IS
  'Debate V2 Phase 1 (additive, dormant): future lifecycle source of truth (opening/rebuttal/cross_examination/closing/final_vote). debates.status and debates.current_phase remain authoritative for V1 in this phase. No automatic transition function exists yet -- that is Phase 2.';

-- At most one active round per debate at a time.
CREATE UNIQUE INDEX IF NOT EXISTS debate_rounds_one_active_per_debate
  ON public.debate_rounds(debate_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS debate_rounds_debate_idx
  ON public.debate_rounds(debate_id);
CREATE INDEX IF NOT EXISTS debate_rounds_debate_status_idx
  ON public.debate_rounds(debate_id, status);

ALTER TABLE public.debate_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Debate rounds are viewable by everyone"
  ON public.debate_rounds FOR SELECT USING (true);

-- Intentionally no INSERT/UPDATE/DELETE policy yet -- no automatic
-- transition function or moderator RPC exists in Phase 1.

-- Correction pass: debate_id is immutable after creation on debate_rounds,
-- debate_arguments, and debate_ballots. The same-debate checks added
-- earlier only validate round_id/parent_argument_id/influential_argument_id
-- against the *current* debate_id -- nothing stopped debate_id itself from
-- being repointed at a different debate after the fact, which would silence
-- those checks rather than satisfy them (every existing cross-reference on
-- the row would then compare against the new debate, not get re-validated
-- against it). No legitimate reason was found for moving a round, argument,
-- or ballot to a different debate after creation: a round's own sequencing
-- (UNIQUE (debate_id, sequence_number)) and every V1 write path assume a
-- fixed debate for the row's lifetime. If a future phase finds a real need
-- to move one of these, it must add an explicit, reviewed exception here --
-- this is a blanket rule, not a per-row toggle. One shared function is used
-- for all three tables: NEW/OLD in a plpgsql trigger function are resolved
-- against whichever table actually fired it, so a single `debate_id`-named
-- column check works generically without one copy per table.
CREATE OR REPLACE FUNCTION public.prevent_debate_id_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.debate_id IS DISTINCT FROM OLD.debate_id THEN
    RAISE EXCEPTION '% rows cannot be moved to a different debate (debate_id is immutable after creation).', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debate_rounds_debate_id_immutable ON public.debate_rounds;
CREATE TRIGGER debate_rounds_debate_id_immutable
BEFORE UPDATE OF debate_id ON public.debate_rounds
FOR EACH ROW
EXECUTE FUNCTION public.prevent_debate_id_change();

-- ---------------------------------------------------------------------------
-- D. public.debate_arguments (additive columns)
-- ---------------------------------------------------------------------------
-- All new columns are nullable (or defaulted), so the existing ArgumentForm
-- insert (debate_id, author_id, content, round_number, stance) is
-- unaffected and existing rows can keep every new column NULL.

ALTER TABLE public.debate_arguments
  ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES public.debate_rounds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_argument_id uuid REFERENCES public.debate_arguments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relation_type text,
  ADD COLUMN IF NOT EXISTS entry_type text,
  ADD COLUMN IF NOT EXISTS claim text,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.debate_arguments
  DROP CONSTRAINT IF EXISTS debate_arguments_relation_type_check;
ALTER TABLE public.debate_arguments
  ADD CONSTRAINT debate_arguments_relation_type_check
  CHECK (relation_type IS NULL OR relation_type IN (
    'supports', 'challenges', 'answers', 'clarifies'
  ));

ALTER TABLE public.debate_arguments
  DROP CONSTRAINT IF EXISTS debate_arguments_entry_type_check;
ALTER TABLE public.debate_arguments
  ADD CONSTRAINT debate_arguments_entry_type_check
  CHECK (entry_type IS NULL OR entry_type IN (
    'opening', 'claim', 'rebuttal', 'answer', 'closing'
  ));

-- Hardening pass: a relation_type without a parent_argument_id (or vice
-- versa) is meaningless -- relation_type describes *how* this argument
-- relates to parent_argument_id, so the two must be set together or not at
-- all.
ALTER TABLE public.debate_arguments
  DROP CONSTRAINT IF EXISTS debate_arguments_parent_relation_pairing_check;
ALTER TABLE public.debate_arguments
  ADD CONSTRAINT debate_arguments_parent_relation_pairing_check
  CHECK (
    (parent_argument_id IS NULL AND relation_type IS NULL)
    OR (parent_argument_id IS NOT NULL AND relation_type IS NOT NULL)
  );

-- Correction pass: parent_argument_id uses ON DELETE SET NULL (added
-- earlier in this section), so deleting a parent argument makes Postgres
-- run `UPDATE debate_arguments SET parent_argument_id = NULL WHERE
-- parent_argument_id = <deleted id>` internally. Without this trigger, that
-- update would leave relation_type at its old non-null value, violating
-- debate_arguments_parent_relation_pairing_check above and aborting the
-- parent's deletion entirely -- i.e. deleting any argument that has
-- children would have started failing the moment that constraint existed.
-- This trigger clears relation_type in the same update whenever
-- parent_argument_id transitions from non-null to null, whether that
-- transition comes from the ON DELETE SET NULL cascade or a future
-- explicit "detach from parent" write -- both cases mean the same thing:
-- the relation no longer has a parent to be relative to. CHECK constraints
-- are validated only after all BEFORE ROW triggers finish, so this runs in
-- time regardless of firing order relative to the other BEFORE UPDATE
-- triggers on this table.
CREATE OR REPLACE FUNCTION public.debate_arguments_clear_relation_on_parent_null()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_argument_id IS NULL AND OLD.parent_argument_id IS NOT NULL THEN
    NEW.relation_type := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debate_arguments_clear_relation_on_parent_null ON public.debate_arguments;
CREATE TRIGGER debate_arguments_clear_relation_on_parent_null
BEFORE UPDATE OF parent_argument_id ON public.debate_arguments
FOR EACH ROW
EXECUTE FUNCTION public.debate_arguments_clear_relation_on_parent_null();

COMMENT ON FUNCTION public.debate_arguments_clear_relation_on_parent_null() IS
  'Correction pass: keeps debate_arguments_parent_relation_pairing_check satisfied when parent_argument_id is cleared by its ON DELETE SET NULL FK action (or any future explicit update to NULL).';

COMMENT ON COLUMN public.debate_arguments.round_id IS
  'Debate V2 Phase 1 (additive): optional link to a debate_rounds row. NULL for every V1 argument and for any V2 argument not yet assigned to a round. Never required in Phase 1.';
COMMENT ON COLUMN public.debate_arguments.parent_argument_id IS
  'Debate V2 Phase 1 (additive): the argument this one directly relates to, paired with relation_type. NULL means top-level (V1 behaviour).';
COMMENT ON COLUMN public.debate_arguments.relation_type IS
  'Debate V2 Phase 1 (additive): how this argument relates to parent_argument_id (supports/challenges/answers/clarifies). NULL for every V1 argument.';
COMMENT ON COLUMN public.debate_arguments.entry_type IS
  'Debate V2 Phase 1 (additive): structural role within a round (opening/claim/rebuttal/answer/closing), independent of relation_type. NULL for every V1 argument.';
COMMENT ON COLUMN public.debate_arguments.claim IS
  'Debate V2 Phase 1 (additive): optional one-line claim/thesis for this argument, distinct from the free-form content column.';

CREATE INDEX IF NOT EXISTS debate_arguments_round_idx
  ON public.debate_arguments(round_id) WHERE round_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS debate_arguments_parent_idx
  ON public.debate_arguments(parent_argument_id) WHERE parent_argument_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS debate_arguments_relation_type_idx
  ON public.debate_arguments(relation_type) WHERE relation_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS debate_arguments_debate_round_idx
  ON public.debate_arguments(debate_id, round_id);
CREATE INDEX IF NOT EXISTS debate_arguments_debate_parent_idx
  ON public.debate_arguments(debate_id, parent_argument_id);

-- No new write policy: the existing "Authenticated users can submit
-- arguments" INSERT policy (supabase/migrations/20260501000001_debate_v1_polish.sql)
-- already covers every column above being left NULL, and Phase 1 does not
-- introduce any new restriction on argument submission.

-- Hardening pass: same-debate referential integrity for round_id and
-- parent_argument_id. A plain single-column FK only guarantees the
-- referenced row exists somewhere -- it says nothing about which debate that
-- row belongs to, so without this check a client could attach an argument
-- to a round or parent from a *different* debate entirely.
--
-- This is enforced with a trigger rather than a composite FK
-- (`(round_id, debate_id) REFERENCES debate_rounds(id, debate_id)`) for two
-- reasons: (1) correctly preserving the existing "ON DELETE SET NULL"
-- behaviour on a composite FK requires Postgres 15's column-list SET NULL
-- syntax (`ON DELETE SET NULL (round_id)`) -- without it, deleting a
-- referenced round/argument would null out debate_id too, which is NOT NULL
-- and would abort the delete. With no local Postgres harness to confirm the
-- target version, a trigger sidesteps that risk entirely. (2) it leaves the
-- original single-column FKs (and their ON DELETE SET NULL behaviour, added
-- earlier in this section) completely untouched rather than replacing them.
CREATE OR REPLACE FUNCTION public.debate_arguments_check_same_debate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_round_debate_id uuid;
  v_parent_debate_id uuid;
BEGIN
  IF NEW.round_id IS NOT NULL THEN
    SELECT debate_id INTO v_round_debate_id
      FROM public.debate_rounds
     WHERE id = NEW.round_id;

    IF v_round_debate_id IS NULL THEN
      RAISE EXCEPTION 'round_id % does not reference an existing debate_rounds row.', NEW.round_id;
    END IF;

    IF v_round_debate_id <> NEW.debate_id THEN
      RAISE EXCEPTION 'debate_arguments.round_id must belong to the same debate as debate_arguments.debate_id.';
    END IF;
  END IF;

  IF NEW.parent_argument_id IS NOT NULL THEN
    SELECT debate_id INTO v_parent_debate_id
      FROM public.debate_arguments
     WHERE id = NEW.parent_argument_id;

    IF v_parent_debate_id IS NULL THEN
      RAISE EXCEPTION 'parent_argument_id % does not reference an existing debate_arguments row.', NEW.parent_argument_id;
    END IF;

    IF v_parent_debate_id <> NEW.debate_id THEN
      RAISE EXCEPTION 'debate_arguments.parent_argument_id must belong to the same debate as debate_arguments.debate_id.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debate_arguments_same_debate_check ON public.debate_arguments;
CREATE TRIGGER debate_arguments_same_debate_check
BEFORE INSERT OR UPDATE OF round_id, parent_argument_id, debate_id ON public.debate_arguments
FOR EACH ROW
EXECUTE FUNCTION public.debate_arguments_check_same_debate();

COMMENT ON FUNCTION public.debate_arguments_check_same_debate() IS
  'Hardening pass: rejects a round_id or parent_argument_id that belongs to a different debate than the row''s own debate_id. Runs as SECURITY INVOKER -- it only ever raises or passes NEW through, so it does not need elevated privileges.';

-- Correction pass: debate_id is immutable after creation (see
-- prevent_debate_id_change(), defined in section C above).
DROP TRIGGER IF EXISTS debate_arguments_debate_id_immutable ON public.debate_arguments;
CREATE TRIGGER debate_arguments_debate_id_immutable
BEFORE UPDATE OF debate_id ON public.debate_arguments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_debate_id_change();

-- ---------------------------------------------------------------------------
-- E. public.debate_argument_sources
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.debate_argument_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  argument_id uuid NOT NULL REFERENCES public.debate_arguments(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (btrim(url) <> ''),
  title text,
  publisher text,
  published_at timestamptz,
  quoted_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (argument_id, url)
);

COMMENT ON TABLE public.debate_argument_sources IS
  'Debate V2 Phase 1 (additive, dormant): cited evidence per argument. Public SELECT only -- Phase 2 will enforce argument ownership and debate state before allowing writes.';
COMMENT ON COLUMN public.debate_argument_sources.url IS
  'Non-empty check only; full URL validation is deliberately left to the application layer rather than SQL.';

CREATE INDEX IF NOT EXISTS debate_argument_sources_argument_idx
  ON public.debate_argument_sources(argument_id);
CREATE INDEX IF NOT EXISTS debate_argument_sources_added_by_idx
  ON public.debate_argument_sources(added_by);

ALTER TABLE public.debate_argument_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Debate argument sources are viewable by everyone"
  ON public.debate_argument_sources FOR SELECT USING (true);

-- Intentionally no INSERT/UPDATE/DELETE policy yet.

-- ---------------------------------------------------------------------------
-- F. public.debate_reactions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.debate_reactions (
  argument_id uuid NOT NULL REFERENCES public.debate_arguments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN (
    'well_supported', 'strong_reasoning', 'clear', 'strong_rebuttal',
    'fair_to_opposition', 'changed_my_mind', 'needs_evidence'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (argument_id, user_id, reaction_type)
);

COMMENT ON TABLE public.debate_reactions IS
  'Debate V2 Phase 1 (additive, dormant): argument-quality feedback, distinct from debate_votes (V1 raw upvotes) and debate_ballots (motion-level verdicts). Public SELECT only -- Phase 2 will add atomic reaction RPCs with closed-debate enforcement and self-reaction prevention.';

CREATE INDEX IF NOT EXISTS debate_reactions_argument_idx
  ON public.debate_reactions(argument_id);
CREATE INDEX IF NOT EXISTS debate_reactions_user_idx
  ON public.debate_reactions(user_id);
CREATE INDEX IF NOT EXISTS debate_reactions_type_idx
  ON public.debate_reactions(reaction_type);

ALTER TABLE public.debate_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Debate reactions are viewable by everyone"
  ON public.debate_reactions FOR SELECT USING (true);

-- Intentionally no INSERT/UPDATE/DELETE policy yet. No denormalized
-- counters are added either -- Phase 2 can introduce them alongside the
-- atomic reaction RPC if aggregation performance requires it.

-- ---------------------------------------------------------------------------
-- G. public.debate_ballots
-- ---------------------------------------------------------------------------
-- Supports initial/final motion ballots with confidence, without touching
-- debate_motion_votes. Deliberately NOT backfilled from debate_motion_votes:
-- the old table has one undated "current vote" per user with no stage
-- (initial vs final) or confidence, so there is no sound way to infer which
-- ballots pre-existing votes represent. Phase 2 (or a dedicated backfill
-- decision) will decide whether/how legacy votes seed initial ballots.

CREATE TABLE IF NOT EXISTS public.debate_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('initial', 'final')),
  vote text NOT NULL CHECK (vote IN ('for', 'against', 'undecided')),
  confidence smallint CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 5),
  reason text,
  influential_argument_id uuid REFERENCES public.debate_arguments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (debate_id, user_id, stage)
);

COMMENT ON TABLE public.debate_ballots IS
  'Debate V2 Phase 1 (additive, dormant): initial/final motion ballots with confidence, kept separate from debate_motion_votes (V1). NOT backfilled from debate_motion_votes -- that table has no stage or confidence data to infer from. Individual ballots are private (self-only SELECT); a public aggregate-results function is deferred to a later phase.';

CREATE INDEX IF NOT EXISTS debate_ballots_debate_stage_idx
  ON public.debate_ballots(debate_id, stage);
CREATE INDEX IF NOT EXISTS debate_ballots_user_idx
  ON public.debate_ballots(user_id);
CREATE INDEX IF NOT EXISTS debate_ballots_influential_argument_idx
  ON public.debate_ballots(influential_argument_id) WHERE influential_argument_id IS NOT NULL;

-- Hardening pass: same-debate referential integrity for
-- influential_argument_id, mirroring debate_arguments_check_same_debate()
-- above and for the same reasons (no local Postgres harness to confirm
-- Postgres-15 composite-FK column-list support; keep the existing
-- single-column FK's ON DELETE SET NULL behaviour untouched).
CREATE OR REPLACE FUNCTION public.debate_ballots_check_same_debate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_argument_debate_id uuid;
BEGIN
  IF NEW.influential_argument_id IS NOT NULL THEN
    SELECT debate_id INTO v_argument_debate_id
      FROM public.debate_arguments
     WHERE id = NEW.influential_argument_id;

    IF v_argument_debate_id IS NULL THEN
      RAISE EXCEPTION 'influential_argument_id % does not reference an existing debate_arguments row.', NEW.influential_argument_id;
    END IF;

    IF v_argument_debate_id <> NEW.debate_id THEN
      RAISE EXCEPTION 'debate_ballots.influential_argument_id must belong to the same debate as debate_ballots.debate_id.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debate_ballots_same_debate_check ON public.debate_ballots;
CREATE TRIGGER debate_ballots_same_debate_check
BEFORE INSERT OR UPDATE OF influential_argument_id, debate_id ON public.debate_ballots
FOR EACH ROW
EXECUTE FUNCTION public.debate_ballots_check_same_debate();

-- Correction pass: debate_id is immutable after creation (see
-- prevent_debate_id_change(), defined in section C above).
DROP TRIGGER IF EXISTS debate_ballots_debate_id_immutable ON public.debate_ballots;
CREATE TRIGGER debate_ballots_debate_id_immutable
BEFORE UPDATE OF debate_id ON public.debate_ballots
FOR EACH ROW
EXECUTE FUNCTION public.prevent_debate_id_change();

ALTER TABLE public.debate_ballots ENABLE ROW LEVEL SECURITY;

-- Individual ballots must not be publicly readable, even though aggregate
-- results will be public in a later phase.
CREATE POLICY "Users can read only their own ballots"
  ON public.debate_ballots FOR SELECT USING (auth.uid() = user_id);

-- Intentionally no INSERT/UPDATE/DELETE policy yet -- Phase 2 will add a
-- cast_ballot-style RPC mirroring cast_motion_vote.

-- ---------------------------------------------------------------------------
-- H. public.debate_subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.debate_subscriptions (
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notify_phase_changes boolean NOT NULL DEFAULT true,
  notify_direct_responses boolean NOT NULL DEFAULT true,
  notify_evidence_requests boolean NOT NULL DEFAULT true,
  notify_final_vote boolean NOT NULL DEFAULT true,
  notify_recap boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (debate_id, user_id)
);

COMMENT ON TABLE public.debate_subscriptions IS
  'Debate V2 Phase 1 (additive, dormant): per-user notification preferences for a debate. Self-only SELECT. Phase 5 (per the product contract) implements subscription UX and delivery; no notification is sent from this table in Phase 1.';

CREATE INDEX IF NOT EXISTS debate_subscriptions_user_idx
  ON public.debate_subscriptions(user_id);

ALTER TABLE public.debate_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read only their own debate subscriptions"
  ON public.debate_subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Intentionally no INSERT/UPDATE/DELETE policy yet.

-- ---------------------------------------------------------------------------
-- I. public.debate_moderation_events
-- ---------------------------------------------------------------------------
-- Append-only audit foundation. target_id intentionally has no foreign key:
-- it is polymorphic across target_type (debate/membership/round/argument/
-- source/reaction/ballot), each pointing at a different table, which SQL
-- cannot express as a single FK constraint.

CREATE TABLE IF NOT EXISTS public.debate_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN (
    'debate', 'membership', 'round', 'argument', 'source', 'reaction', 'ballot'
  )),
  target_id uuid,
  action text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.debate_moderation_events IS
  'Debate V2 Phase 1 (additive, dormant): append-only moderation audit log. Not public -- readable only by the debate moderator, editors, and admins. No client INSERT/UPDATE/DELETE policy; later privileged (SECURITY DEFINER) functions will write here.';
COMMENT ON COLUMN public.debate_moderation_events.target_id IS
  'Polymorphic reference resolved via target_type; intentionally not a foreign key since it can point at rows in several different tables.';

CREATE INDEX IF NOT EXISTS debate_moderation_events_debate_created_idx
  ON public.debate_moderation_events(debate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS debate_moderation_events_actor_idx
  ON public.debate_moderation_events(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS debate_moderation_events_target_idx
  ON public.debate_moderation_events(target_type, target_id);

ALTER TABLE public.debate_moderation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Moderators and staff can read moderation events"
  ON public.debate_moderation_events FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.debates
      WHERE id = debate_moderation_events.debate_id
        AND moderator_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('editor', 'admin')
    )
  );

-- No INSERT/UPDATE/DELETE policy: this table is written only by future
-- privileged (SECURITY DEFINER) functions, never directly by clients.

-- ---------------------------------------------------------------------------
-- J. Harden public.profiles against privilege-bearing self-updates
-- ---------------------------------------------------------------------------
-- Surfaced by this Phase 1 hardening pass: debate_moderation_events (section
-- I) and other privileged surfaces across this app gate on
-- profiles.role IN ('editor', 'admin'), but "Users can update their own
-- profile" (20260401000000_base_schema.sql) is
-- `FOR UPDATE USING (auth.uid() = id)` with no WITH CHECK and no column
-- restriction. RLS is row-level only, so as written this policy lets any
-- authenticated user set their own role/verified/verified_type to whatever
-- they like via a direct .update() -- a platform-wide privilege escalation,
-- not something specific to debates.
--
-- A column-level REVOKE does not fix this in this project: this repo
-- already hit that exact dead end for posts.like_count
-- (20260715000003_lock_like_count_column.sql /
-- 20260715000004_protect_like_count_with_dedicated_table.sql) -- Supabase's
-- default project setup grants table-level UPDATE on every public table to
-- `authenticated`, and Postgres's privilege check is "table-level grant OR
-- column-level grant", so a column-level REVOKE on top of that standing
-- table-level GRANT has no effect. Moving role/verified/verified_type into a
-- separate table (the like_count fix) is not proportionate here either --
-- unlike a denormalized counter, these are core identity columns read as
-- part of the profile row throughout the app, and splitting them out is a
-- larger refactor than a hardening pass warrants.
--
-- So this uses the same tool as the debates_guard_format_version() trigger
-- above: a BEFORE UPDATE trigger that blocks a change to any of the three
-- privilege-bearing columns specifically when the request's JWT role is
-- `authenticated` (an ordinary end-user session). Every other caller is
-- unaffected: the admin verification action
-- (app/(main)/admin/verification/actions.ts) writes through
-- createAdminClient() (lib/adminAccess.ts), which uses
-- SUPABASE_SERVICE_ROLE_KEY -- auth.role() = 'service_role' there, not
-- 'authenticated'. Direct migrations, dashboard SQL, and any other
-- non-PostgREST connection have no JWT role claim at all and are also
-- unaffected. Ordinary self-service profile edits (ProfileForm.tsx,
-- ProfileGate.tsx, the onboarding flow, interests/notification/privacy
-- settings) never include these three columns in their update payloads
-- today, so none of them are affected either -- verified by reading every
-- `.from("profiles").update(...)` call site in the app.
--
-- Forward-looking note for Phase 2, same caveat as
-- debates_guard_format_version(): auth.role() reflects the original
-- request's JWT, not the executing function's privilege level, so a future
-- SECURITY DEFINER RPC that changes role/verified/verified_type while still
-- invoked by an authenticated end-user's own session would also be blocked
-- here. That is intentional -- any such RPC needs its own explicit, reviewed
-- bypass when it is built.
--
-- The "Users can insert their own profile" INSERT policy
-- (`WITH CHECK (auth.uid() = id)`) has the same column-blindness in
-- principle, even though profile rows are actually created by a
-- SECURITY DEFINER trigger on auth.users, not by any client-side insert in
-- this codebase (no `.from("profiles").insert(` call site exists). The
-- original hardening pass flagged this for future review rather than fixing
-- it, to stay scoped to the update path that was audited first; the
-- correction pass below closes it too (protect_profile_privileged_columns_on_insert()).
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'role cannot be changed directly. Use the admin verification workflow.';
    END IF;
    IF NEW.verified IS DISTINCT FROM OLD.verified THEN
      RAISE EXCEPTION 'verified cannot be changed directly. Use the admin verification workflow.';
    END IF;
    IF NEW.verified_type IS DISTINCT FROM OLD.verified_type THEN
      RAISE EXCEPTION 'verified_type cannot be changed directly. Use the admin verification workflow.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_protect_privileged_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_privileged_columns();

COMMENT ON FUNCTION public.protect_profile_privileged_columns() IS
  'Hardening pass: blocks authenticated (non-service-role) clients from changing profiles.role/verified/verified_type via direct table updates. See the comment above this function''s CREATE statement for why a column-level REVOKE does not work in this project.';

-- Correction pass: the UPDATE trigger above closes the escalation path once
-- a profile row exists, but "Users can insert their own profile"
-- (`WITH CHECK (auth.uid() = id)`, 20260401000000_base_schema.sql) has the
-- exact same column-blindness on INSERT -- an authenticated client could
-- supply role/verified/verified_type on a direct .insert() the same way.
-- In practice public.profiles rows are created by handle_new_user()
-- (20260423000010_campus_email_verification.sql), a SECURITY DEFINER
-- trigger on auth.users fired by Supabase Auth's own internal connection --
-- not through PostgREST, so it carries no `request.jwt.claims` at all and
-- auth.role() reads NULL there, never 'authenticated'. That trigger is what
-- performs automatic university-email verification: it looks up
-- is_university_email(new.email) itself and inserts verified/verified_type
-- accordingly. Gating this guard on auth.role() = 'authenticated' (the same
-- condition used everywhere else in this migration) means it never
-- observes that insert and cannot interfere with it.
--
-- Unlike the UPDATE trigger, this does not RAISE. An UPDATE has an existing
-- row to fall back to, so rejecting it outright costs nothing beyond the
-- attempted change. An INSERT has no fallback: no legitimate
-- `.from("profiles").insert(...)` call site exists anywhere in this app
-- today (verified by reading the codebase), but rejecting outright would
-- still mean a user ends up with *no* profile row at all if any client-side
-- insert path is ever added later and happens to race
-- handle_new_user() or include these columns incidentally. Silently
-- resetting the three columns to their safe defaults (matching the
-- profiles table's own column defaults exactly, so a normal insert that
-- never mentions them is untouched) closes the escalation path while still
-- letting the row -- and the rest of the user's own account -- get created.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.role := 'student';
    NEW.verified := false;
    NEW.verified_type := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged_columns_on_insert ON public.profiles;
CREATE TRIGGER profiles_protect_privileged_columns_on_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_privileged_columns_on_insert();

COMMENT ON FUNCTION public.protect_profile_privileged_columns_on_insert() IS
  'Correction pass: resets profiles.role/verified/verified_type to their safe defaults on a direct authenticated INSERT, instead of rejecting it outright. Does not affect handle_new_user() -- see the comment above this function''s CREATE statement for why.';
