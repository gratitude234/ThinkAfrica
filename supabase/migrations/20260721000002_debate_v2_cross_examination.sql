-- Debate V2 Phase 4A: structured cross-examination.
--
-- Builds on Phase 1 (20260718000002_debate_v2_foundation.sql), Phase 2
-- (20260718000003_debate_v2_lifecycle_permissions.sql), and the Phase 3
-- room-signal hardening (20260721000001_debate_v2_room_signal.sql) -- none
-- of the three is edited by this migration. cross_examination has been a
-- real round phase since Phase 1 and a real lifecycle state since Phase 2,
-- but submit_debate_argument_v2 has always explicitly rejected general
-- argument submission during it ("dedicated question/answer mechanics are
-- deferred to the structured-deliberation phase" -- see that function's
-- body in 20260718000003). This migration is that phase: it gives
-- cross-examination its own dedicated, additive data model and its own two
-- SECURITY DEFINER RPCs, and does not touch submit_debate_argument_v2's
-- existing rejection (still correct and unchanged -- general argument
-- submission remains closed during cross-examination; only these two new,
-- narrow RPCs may write here).
--
-- No local PostgreSQL/Supabase harness is configured in this repo (see
-- CLAUDE.md), so -- consistent with every prior Debate V2 migration -- this
-- has been verified by static review and by the pure-JS contract ports in
-- lib/debateV2.test.ts / lib/debateV2Lifecycle.test.ts, not by execution.
-- Apply to a staging environment and verify there (see this phase's staging
-- checklist in the implementation report) before considering it deployable.
--
-- Revision note (pre-apply review, this file had not yet been applied
-- anywhere): fixed a conflicting-delete-behaviour bug on round_id (see its
-- column comment below), reordered submit_cross_examination_answer_v2 so a
-- retried call reliably reaches its idempotent branch regardless of what
-- has happened to the debate/round since the original successful call, and
-- closed a function-security-audit gap on the same-debate trigger function.
-- Also added one optional defense-in-depth trigger (answer immutability)
-- the same review suggested. All fixed in place, not as a second migration.

-- =============================================================================
-- A. public.debate_cross_exchanges
-- =============================================================================
-- A dedicated model, not a repurposed debate_arguments row: a question/
-- answer pair has a fundamentally different shape (exactly one asker, one
-- target, at most one immutable answer, no rounds-graph of
-- parent/relation_type) that debate_arguments' entry_type='claim'/'answer'
-- values were never wired up to enforce, and forcing it into that table
-- would mean either loosening debate_arguments' existing constraints or
-- leaving this feature's real invariants unenforced by the schema. No
-- existing table anticipates this shape (checked: debate_arguments,
-- debate_moderation_events, and the product contract's own schema
-- reference were all read before choosing this) -- debate_moderation_events
-- is an audit log, polymorphic and privileged-read-only, not a fit for a
-- publicly-displayed, high-volume participation record.
--
-- Deletion-behaviour decisions, made deliberately rather than defaulted:
--   - debate_id: NOT NULL, ON DELETE CASCADE, immutable after creation
--     (prevent_debate_id_change(), reused from Phase 1 -- see below).
--     Matches every other V2 child table exactly.
--   - round_id: NOT NULL, ON DELETE NO ACTION DEFERRABLE INITIALLY
--     DEFERRED. No code path in this entire application ever deletes a
--     debate_rounds row (checked both existing migrations).
--     debate_arguments.round_id uses ON DELETE SET NULL instead, but that
--     column is nullable purely for V1-legacy-compat reasons (V1 arguments
--     predate round_id) that do not apply to this brand-new, V2-only
--     table, where round_id is always known at creation time. Between
--     CASCADE (silently destroy a durable, publicly-displayed Q&A record
--     if a round were ever deleted) and a blocking action (refuse the
--     round deletion instead), a blocking action was chosen: this table
--     exists specifically to be a durable record ("Preserve debates as
--     durable, citable records of reasoning" -- product contract goal A),
--     and a currently-impossible scenario is exactly where a loud failure
--     is preferable to silent data loss.
--
--     Correction (pre-apply review): the first revision used plain
--     ON DELETE RESTRICT, which conflicts with debate_id's own
--     ON DELETE CASCADE. Deleting a debates row cascades along TWO
--     independent FK paths at once -- debate_rounds.debate_id CASCADE and
--     debate_cross_exchanges.debate_id CASCADE -- and PostgreSQL does not
--     guarantee which cascade path it processes first. If it deletes the
--     debate_rounds row before this table's own debate_id CASCADE has
--     removed the exchange rows that still reference it, an immediate
--     RESTRICT check sees those rows and aborts the round's deletion --
--     which aborts the whole debate deletion. RESTRICT is also, by
--     PostgreSQL's own definition, never deferrable (only NO ACTION is),
--     so this could not be fixed by adding DEFERRABLE to RESTRICT itself.
--     Switched to NO ACTION DEFERRABLE INITIALLY DEFERRED instead: the
--     check is postponed to end of transaction, by which point a whole-
--     debate delete has removed both the round and every exchange that
--     referenced it (via their own, independent debate_id CASCADE), so the
--     deferred check finds nothing left to object to and the deletion
--     succeeds; a standalone attempt to delete just a round while
--     exchanges still reference it still fails, just at commit instead of
--     immediately. See the implementation report's staging checklist for
--     the two cases this must be tested against.
--   - asker_id: NOT NULL, ON DELETE CASCADE. Mirrors debate_arguments
--     .author_id exactly -- this row is fundamentally the asker's authored
--     content; if their account is gone, so is their question.
--   - target_id: NOT NULL, ON DELETE CASCADE. A deliberate divergence from
--     the "optional cross-reference -> SET NULL" pattern used for
--     parent_argument_id/influential_argument_id/target_argument_id below:
--     target_id is not a passive reference, it drives live authorization
--     ("only the targeted debater may answer" is enforced by comparing
--     target_id to auth.uid() in submit_cross_examination_answer_v2). SET
--     NULL would require the column to be nullable, introducing a
--     target-less exchange row that every reader of this table (the RPCs,
--     the loader, the UI) would need to defend against, for a case that
--     cannot currently arise -- this application has no hard-delete-account
--     path today (suspension, not deletion, is the moderation primitive --
--     see is_suspended()/profiles.suspended_at). CASCADE keeps "every
--     exchange has a real, resolvable target" unconditionally true instead.
--   - target_argument_id: nullable, ON DELETE SET NULL. Matches
--     parent_argument_id (debate_arguments) and influential_argument_id
--     (debate_ballots) exactly -- an optional cross-reference; the row it
--     is attached to survives its target's deletion, only the reference is
--     cleared.
--
-- No stored status or stance column, per the same "avoid a stored value
-- that can be safely derived" principle the product contract already
-- applies elsewhere: an exchange's display status (pending / answered /
-- expired-unanswered) is derived at read time from answer/answered_at
-- presence plus the round's current status (see
-- lib/debateV2Lifecycle.ts's deriveCrossExchangeStatus); asker/target
-- stance is derived via a join to debate_memberships, never duplicated
-- onto this row where it could drift from the membership table's own
-- locked-stance value.
--
-- "At most one, immutable answer" is enforced at two layers: the answer
-- RPC's locked idempotent check (section C), and -- added in this revision
-- as defense-in-depth per review -- a table-level trigger
-- (debate_cross_exchanges_answer_immutable_once_set, below) that rejects
-- any UPDATE changing an already-non-null answer, so the invariant holds
-- even against a hypothetical future direct write path or a bug in the RPC.
CREATE TABLE IF NOT EXISTS public.debate_cross_exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  round_id uuid NOT NULL
    REFERENCES public.debate_rounds(id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED,
  asker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_argument_id uuid REFERENCES public.debate_arguments(id) ON DELETE SET NULL,
  question text NOT NULL CHECK (btrim(question) <> ''),
  answer text,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT debate_cross_exchanges_asker_not_target CHECK (asker_id <> target_id),
  CONSTRAINT debate_cross_exchanges_answer_pairing CHECK (
    (answer IS NULL AND answered_at IS NULL) OR (answer IS NOT NULL AND answered_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.debate_cross_exchanges IS
  'Debate V2 Phase 4A: structured cross-examination questions and their at-most-one, immutable-once-set answer. Additive, dedicated model -- not represented as debate_arguments rows (see this migration''s section A comment for why). Public SELECT (the debate room publicly displays exchanges, matching debate_arguments/debate_reactions). No direct client write policy -- all writes go through submit_cross_examination_question_v2/submit_cross_examination_answer_v2. round_id is NOT NULL, ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED (not RESTRICT -- RESTRICT is never deferrable in PostgreSQL and would race debate_id''s own CASCADE when a whole debate is deleted; see this migration''s section A comment). Answer immutability is additionally enforced by a table trigger, not just the RPC. No stored status/stance column -- both are derived at read time.';

CREATE INDEX IF NOT EXISTS debate_cross_exchanges_debate_created_idx
  ON public.debate_cross_exchanges(debate_id, created_at);
CREATE INDEX IF NOT EXISTS debate_cross_exchanges_round_idx
  ON public.debate_cross_exchanges(round_id);
CREATE INDEX IF NOT EXISTS debate_cross_exchanges_asker_idx
  ON public.debate_cross_exchanges(asker_id);
CREATE INDEX IF NOT EXISTS debate_cross_exchanges_target_idx
  ON public.debate_cross_exchanges(target_id);
CREATE INDEX IF NOT EXISTS debate_cross_exchanges_target_argument_idx
  ON public.debate_cross_exchanges(target_argument_id) WHERE target_argument_id IS NOT NULL;

-- Same-debate referential integrity, mirroring
-- debate_arguments_check_same_debate()/debate_ballots_check_same_debate()
-- (Phase 1) exactly -- a plain foreign key only proves round_id/
-- target_argument_id reference an existing row, not that it belongs to the
-- same debate as this exchange. Scoped to fire only when those two columns
-- actually change (round_id never changes in practice; target_argument_id
-- never changes at all -- neither RPC updates it -- but the same
-- column-scoped-trigger pattern used throughout this schema is kept for
-- consistency and to avoid re-validating on every answer UPDATE, which
-- only ever touches answer/answered_at/updated_at).
CREATE OR REPLACE FUNCTION public.debate_cross_exchanges_check_same_debate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_round_debate_id uuid;
  v_target_argument_debate_id uuid;
BEGIN
  SELECT debate_id INTO v_round_debate_id
    FROM public.debate_rounds
   WHERE id = NEW.round_id;

  IF v_round_debate_id IS NULL THEN
    RAISE EXCEPTION 'round_id % does not reference an existing debate_rounds row.', NEW.round_id;
  END IF;
  IF v_round_debate_id <> NEW.debate_id THEN
    RAISE EXCEPTION 'debate_cross_exchanges.round_id must belong to the same debate as debate_cross_exchanges.debate_id.';
  END IF;

  IF NEW.target_argument_id IS NOT NULL THEN
    SELECT debate_id INTO v_target_argument_debate_id
      FROM public.debate_arguments
     WHERE id = NEW.target_argument_id;

    IF v_target_argument_debate_id IS NULL THEN
      RAISE EXCEPTION 'target_argument_id % does not reference an existing debate_arguments row.', NEW.target_argument_id;
    END IF;
    IF v_target_argument_debate_id <> NEW.debate_id THEN
      RAISE EXCEPTION 'debate_cross_exchanges.target_argument_id must belong to the same debate as debate_cross_exchanges.debate_id.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Correction (pre-apply review): every function in this schema, trigger or
-- not, SECURITY DEFINER or not, gets SET search_path = public and an
-- explicit REVOKE ALL FROM PUBLIC -- established as the going-forward
-- standard in Phase 2's own "final cleanup" of count_words_v2() (see that
-- function's comment in 20260718000003: "originally left PUBLIC... both
-- were added for consistency with every other function in this
-- migration"). This function was first written without either, missing
-- that standard; fixed here rather than left inconsistent. Not calling it
-- out as a Phase 1 gap to fix -- debate_arguments_check_same_debate() is in
-- an already-applied migration this project does not edit -- only holding
-- this new function to the standard Phase 2 already established.
REVOKE ALL ON FUNCTION public.debate_cross_exchanges_check_same_debate() FROM PUBLIC;

DROP TRIGGER IF EXISTS debate_cross_exchanges_same_debate_check ON public.debate_cross_exchanges;
CREATE TRIGGER debate_cross_exchanges_same_debate_check
BEFORE INSERT OR UPDATE OF round_id, target_argument_id ON public.debate_cross_exchanges
FOR EACH ROW
EXECUTE FUNCTION public.debate_cross_exchanges_check_same_debate();

COMMENT ON FUNCTION public.debate_cross_exchanges_check_same_debate() IS
  'Phase 4A: rejects a round_id or target_argument_id that belongs to a different debate than the row''s own debate_id. Runs as SECURITY INVOKER -- it only ever raises or passes NEW through, so it does not need elevated privileges, matching debate_arguments_check_same_debate()''s identical reasoning. SET search_path = public and REVOKE ALL FROM PUBLIC applied for consistency with the standard Phase 2 established (see this function''s REVOKE statement).';

-- debate_id is immutable after creation -- reuses prevent_debate_id_change()
-- (Phase 1), already attached to debate_rounds/debate_arguments/
-- debate_ballots for the identical reason: no legitimate reason was found
-- for a cross-examination exchange to move between debates either.
DROP TRIGGER IF EXISTS debate_cross_exchanges_debate_id_immutable ON public.debate_cross_exchanges;
CREATE TRIGGER debate_cross_exchanges_debate_id_immutable
BEFORE UPDATE OF debate_id ON public.debate_cross_exchanges
FOR EACH ROW
EXECUTE FUNCTION public.prevent_debate_id_change();

-- Defense-in-depth addition (pre-apply review, optional suggestion taken):
-- the answer RPC already enforces "at most one, immutable answer" via its
-- locked idempotent check, but nothing at the schema level stopped a
-- hypothetical future direct write path (or a bug in that RPC) from
-- overwriting an existing answer. This trigger makes that structurally
-- impossible: once answer is non-null, no UPDATE may change it to a
-- different value. It does not interfere with the RPC's own legitimate
-- first-answer UPDATE, which only ever runs while OLD.answer IS NULL
-- (checked under the same row lock immediately before).
CREATE OR REPLACE FUNCTION public.debate_cross_exchanges_answer_immutable_once_set()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.answer IS NOT NULL AND NEW.answer IS DISTINCT FROM OLD.answer THEN
    RAISE EXCEPTION 'debate_cross_exchanges.answer cannot be changed once set.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.debate_cross_exchanges_answer_immutable_once_set() FROM PUBLIC;

DROP TRIGGER IF EXISTS debate_cross_exchanges_answer_immutable ON public.debate_cross_exchanges;
CREATE TRIGGER debate_cross_exchanges_answer_immutable
BEFORE UPDATE OF answer ON public.debate_cross_exchanges
FOR EACH ROW
EXECUTE FUNCTION public.debate_cross_exchanges_answer_immutable_once_set();

COMMENT ON FUNCTION public.debate_cross_exchanges_answer_immutable_once_set() IS
  'Phase 4A defense-in-depth (pre-apply review): schema-level backstop for "at most one, immutable answer" -- submit_cross_examination_answer_v2 already enforces this via its locked idempotent already_answered check, but this trigger makes it impossible to violate even via a hypothetical future direct write path or a bug in that RPC. Runs as SECURITY INVOKER -- it only ever raises or passes NEW through.';

ALTER TABLE public.debate_cross_exchanges ENABLE ROW LEVEL SECURITY;

-- Public SELECT is acceptable and deliberate: the debate room publicly
-- displays cross-examination exchanges the same way it publicly displays
-- arguments and reactions -- there is no individual-privacy concern here
-- the way there is for debate_ballots (a question and its answer are
-- authored content meant to be read by the room, not a private vote).
CREATE POLICY "Cross-examination exchanges are publicly readable"
  ON public.debate_cross_exchanges FOR SELECT USING (true);

-- Intentionally no INSERT/UPDATE/DELETE policy -- every write goes through
-- submit_cross_examination_question_v2 / submit_cross_examination_answer_v2
-- (SECURITY DEFINER), matching every other V2 participation table's Phase 1/2
-- precedent (debate_memberships, debate_rounds, debate_reactions,
-- debate_ballots all have zero direct-write policies).

-- =============================================================================
-- B. submit_cross_examination_question_v2
-- =============================================================================
CREATE OR REPLACE FUNCTION public.submit_cross_examination_question_v2(
  p_debate_id uuid,
  p_target_user_id uuid,
  p_question text,
  p_target_argument_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_format_version smallint;
  v_status text;
  v_stance text;
  v_target_stance text;
  v_active_round_id uuid;
  v_active_phase text;
  v_active_sequence integer;
  v_question text;
  v_word_count integer;
  v_existing_count integer;
  v_arg_debate_id uuid;
  v_arg_author_id uuid;
  v_arg_round_id uuid;
  v_arg_round_seq integer;
  v_exchange_id uuid;
  v_max_question_words CONSTANT integer := 60;
  v_max_question_chars CONSTANT integer := 2000;
  v_max_questions_per_asker CONSTANT integer := 2;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Correction: see join_debate_v2's identical comment (Phase 2 hardening
  -- pass) -- every V2 participation RPC bypasses RLS as SECURITY DEFINER,
  -- so each must independently re-check is_suspended() rather than
  -- inheriting the client-RLS suspension gate "for free".
  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'A target debater is required.';
  END IF;

  v_question := btrim(COALESCE(p_question, ''));
  IF v_question = '' THEN
    RAISE EXCEPTION 'A question is required.';
  END IF;
  IF length(v_question) > v_max_question_chars THEN
    RAISE EXCEPTION 'Question exceeds the maximum length of % characters.', v_max_question_chars;
  END IF;

  -- Lock 1/3: the debate. Without this, a question could be inserted
  -- against a debate that has just closed (TOCTOU on v_status below) --
  -- mirrors submit_debate_argument_v2's identical debate-first ordering.
  -- (There is no idempotency concern on the ASK side the way there is for
  -- answering -- every question submission is a genuinely new write, so
  -- there is no "retry of an already-succeeded call" branch to protect
  -- here, unlike submit_cross_examination_answer_v2 below.)
  SELECT format_version, status INTO v_format_version, v_status
    FROM public.debates WHERE id = p_debate_id
   FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate.';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Cross-examination questions can only be submitted while the debate is active.';
  END IF;

  -- Lock 2/3: the caller's own debater membership row. This is what
  -- serializes every concurrent question attempt by the SAME asker (two
  -- tabs, a double-click, a retried request): a second concurrent call
  -- blocks here until the first's transaction commits or rolls back, so by
  -- the time it proceeds, the first call's insert (if any) is already
  -- visible to the allowance count below -- mirrors
  -- submit_debate_argument_v2's identical rebuttal-limit mechanism (a
  -- bare pre-insert COUNT cannot satisfy an "at most 2" limit on its own).
  SELECT stance INTO v_stance
    FROM public.debate_memberships
   WHERE debate_id = p_debate_id AND user_id = v_user_id AND role = 'debater'
   FOR UPDATE;

  IF v_stance IS NULL THEN
    RAISE EXCEPTION 'You must be a debater in this debate to ask a cross-examination question.';
  END IF;

  -- Lock 3/3: the active round. A concurrent round transition (manual
  -- advance or the automatic due-round job) must not change which round
  -- this question is attributed to mid-transaction.
  SELECT id, phase, sequence_number
    INTO v_active_round_id, v_active_phase, v_active_sequence
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id AND status = 'active'
   FOR UPDATE;

  IF v_active_round_id IS NULL THEN
    RAISE EXCEPTION 'No active round to submit a question into.';
  END IF;
  IF v_active_phase <> 'cross_examination' THEN
    RAISE EXCEPTION 'Cross-examination questions can only be submitted while the cross-examination round is active.';
  END IF;

  IF p_target_user_id = v_user_id THEN
    RAISE EXCEPTION 'You cannot question yourself.';
  END IF;

  -- Stance is locked once set (join_debate_v2 never allows changing sides
  -- by calling it again) -- an unlocked read is safe here, no TOCTOU risk.
  SELECT stance INTO v_target_stance
    FROM public.debate_memberships
   WHERE debate_id = p_debate_id AND user_id = p_target_user_id AND role = 'debater';

  IF v_target_stance IS NULL THEN
    RAISE EXCEPTION 'The target must be a debater in this debate.';
  END IF;
  IF v_target_stance = v_stance THEN
    RAISE EXCEPTION 'The target must have the opposing stance.';
  END IF;

  IF p_target_argument_id IS NOT NULL THEN
    SELECT debate_id, author_id, round_id
      INTO v_arg_debate_id, v_arg_author_id, v_arg_round_id
      FROM public.debate_arguments
     WHERE id = p_target_argument_id;

    IF v_arg_debate_id IS NULL THEN
      RAISE EXCEPTION 'target_argument_id does not reference an existing argument.';
    END IF;
    IF v_arg_debate_id <> p_debate_id THEN
      RAISE EXCEPTION 'target_argument_id must belong to the same debate.';
    END IF;
    IF v_arg_author_id <> p_target_user_id THEN
      RAISE EXCEPTION 'target_argument_id must be authored by the selected target.';
    END IF;

    SELECT sequence_number INTO v_arg_round_seq
      FROM public.debate_rounds WHERE id = v_arg_round_id;

    IF v_arg_round_seq IS NULL OR v_arg_round_seq >= v_active_sequence THEN
      RAISE EXCEPTION 'target_argument_id must be from an earlier round.';
    END IF;
  END IF;

  v_word_count := public.count_words_v2(v_question);
  IF v_word_count > v_max_question_words THEN
    RAISE EXCEPTION 'Question exceeds the %-word limit (currently % words).', v_max_question_words, v_word_count;
  END IF;

  SELECT count(*) INTO v_existing_count
    FROM public.debate_cross_exchanges
   WHERE debate_id = p_debate_id AND asker_id = v_user_id;
  IF v_existing_count >= v_max_questions_per_asker THEN
    RAISE EXCEPTION 'You have already asked the maximum of % cross-examination questions.', v_max_questions_per_asker;
  END IF;

  INSERT INTO public.debate_cross_exchanges (
    debate_id, round_id, asker_id, target_id, target_argument_id, question
  )
  VALUES (
    p_debate_id, v_active_round_id, v_user_id, p_target_user_id, p_target_argument_id, v_question
  )
  RETURNING id INTO v_exchange_id;

  RETURN jsonb_build_object(
    'exchange_id', v_exchange_id,
    'debate_id', p_debate_id,
    'round_id', v_active_round_id,
    'target_id', p_target_user_id,
    'target_argument_id', p_target_argument_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_cross_examination_question_v2(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_cross_examination_question_v2(uuid, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_cross_examination_question_v2(uuid, uuid, text, uuid) IS
  'Phase 4A: authenticated cross-examination question submission. Only a debater may ask; the target must be a different debater in the same debate with the opposing stance; at most 2 questions per asker, enforced by locking the asker''s own debate_memberships row (mirrors submit_debate_argument_v2''s rebuttal-limit serialization -- "at most 2" cannot be expressed as a unique index). Optional target_argument_id must belong to the same debate, be authored by the target, and come from a strictly earlier round. Lock order: debate, then asker''s membership, then the active round -- identical ordering to every other V2 participation RPC. Stance/round/timing are always derived server-side, never caller-supplied. Every question is a genuinely new write -- no retry/idempotency branch is needed here (contrast submit_cross_examination_answer_v2, which has one).';

-- =============================================================================
-- C. submit_cross_examination_answer_v2
-- =============================================================================
CREATE OR REPLACE FUNCTION public.submit_cross_examination_answer_v2(
  p_debate_id uuid,
  p_exchange_id uuid,
  p_answer text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_format_version smallint;
  v_status text;
  v_stance text;
  v_active_round_id uuid;
  v_active_phase text;
  v_exchange_debate_id uuid;
  v_exchange_round_id uuid;
  v_exchange_target_id uuid;
  v_existing_answer text;
  v_answer text;
  v_word_count integer;
  v_max_answer_words CONSTANT integer := 120;
  v_max_answer_chars CONSTANT integer := 4000;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF public.is_suspended() THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  v_answer := btrim(COALESCE(p_answer, ''));
  IF v_answer = '' THEN
    RAISE EXCEPTION 'An answer is required.';
  END IF;
  IF length(v_answer) > v_max_answer_chars THEN
    RAISE EXCEPTION 'Answer exceeds the maximum length of % characters.', v_max_answer_chars;
  END IF;

  -- Lock 1: the debate. Only identity (format_version/existence) is
  -- enforced immediately below -- format_version never reverts once a
  -- debate is V2, so checking it unconditionally can never incorrectly
  -- reject a retry. The *timing* check (status = 'active') is deliberately
  -- deferred past the idempotency short-circuit below -- see the
  -- correction note there for why. v_status is still read here, under this
  -- same lock, so it stays valid/fresh for the rest of this call without a
  -- second query.
  SELECT format_version, status INTO v_format_version, v_status
    FROM public.debates WHERE id = p_debate_id
   FOR UPDATE;

  IF v_format_version IS NULL THEN
    RAISE EXCEPTION 'Debate not found.';
  END IF;
  IF v_format_version <> 2 THEN
    RAISE EXCEPTION 'This debate is not a Debate V2 debate.';
  END IF;

  -- Lock 2: the caller's own debater membership row. Safe to check
  -- unconditionally early -- stance/membership is permanent once set,
  -- never revoked in this app, so this can never produce a different
  -- outcome on a retry than it did on the original call. Kept in the same
  -- relative position (debate, then caller membership) every other V2
  -- participation RPC uses, so no divergent lock order is introduced.
  SELECT stance INTO v_stance
    FROM public.debate_memberships
   WHERE debate_id = p_debate_id AND user_id = v_user_id AND role = 'debater'
   FOR UPDATE;

  IF v_stance IS NULL THEN
    RAISE EXCEPTION 'You must be a debater in this debate to answer a cross-examination question.';
  END IF;

  -- Lock 3: the specific exchange row, locked and inspected BEFORE any
  -- timing/lifecycle business check (debate status, round phase, round
  -- match). Correction (pre-apply review): an earlier revision checked
  -- debate status and round phase before this lookup, which meant a
  -- network retry arriving after the cross-examination round had since
  -- advanced -- an entirely normal thing to happen between a client's
  -- first attempt and its retry, e.g. the response was lost but the write
  -- committed, or a moderator advanced the round moments later -- received
  -- a hard "round no longer active" error instead of the idempotent
  -- already_answered outcome, even though the original attempt had
  -- already succeeded. Only a genuinely unanswered exchange needs the
  -- round to still be live; confirming an already-recorded answer must
  -- not depend on what has happened to the debate/round since.
  SELECT debate_id, round_id, target_id, answer
    INTO v_exchange_debate_id, v_exchange_round_id, v_exchange_target_id, v_existing_answer
    FROM public.debate_cross_exchanges
   WHERE id = p_exchange_id
   FOR UPDATE;

  IF v_exchange_debate_id IS NULL THEN
    RAISE EXCEPTION 'Cross-examination question not found.';
  END IF;
  IF v_exchange_debate_id <> p_debate_id THEN
    RAISE EXCEPTION 'This question does not belong to the specified debate.';
  END IF;
  IF v_exchange_target_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the targeted debater may answer this question.';
  END IF;

  -- Idempotent: a duplicate/retried call for an already-answered question
  -- returns the same shape with already_answered = true instead of
  -- mutating (or erroring on) an answer that has already been recorded --
  -- checked here, immediately after confirming the caller is authorized to
  -- act on this exchange at all, and deliberately BEFORE any debate/round
  -- timing check, so a retry succeeds regardless of what has happened to
  -- the debate/round since the original successful call.
  IF v_existing_answer IS NOT NULL THEN
    RETURN jsonb_build_object(
      'exchange_id', p_exchange_id,
      'debate_id', p_debate_id,
      'already_answered', true
    );
  END IF;

  -- Only reached for a genuinely new answer -- now, and only now, is the
  -- live window enforced. v_status was already read under this
  -- transaction's hold on the debate row's lock above; no re-query needed.
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Cross-examination answers can only be submitted while the debate is active.';
  END IF;

  -- Lock 4 (only reached for a genuinely new answer): the active round.
  SELECT id, phase INTO v_active_round_id, v_active_phase
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id AND status = 'active'
   FOR UPDATE;

  IF v_active_round_id IS NULL THEN
    RAISE EXCEPTION 'No active round to answer into.';
  END IF;
  IF v_active_phase <> 'cross_examination' THEN
    RAISE EXCEPTION 'Cross-examination answers can only be submitted while the cross-examination round is active.';
  END IF;
  -- Covers both a normal round advance past cross-examination and a
  -- closed/force-closed debate: once this exchange's round_id is no longer
  -- the currently-active round, it stays permanently unanswered -- never
  -- answerable later, per the product contract. (A retry of an answer that
  -- already succeeded never reaches this check at all -- see the
  -- already_answered short-circuit above.)
  IF v_exchange_round_id <> v_active_round_id THEN
    RAISE EXCEPTION 'This question belongs to a round that is no longer active.';
  END IF;

  v_word_count := public.count_words_v2(v_answer);
  IF v_word_count > v_max_answer_words THEN
    RAISE EXCEPTION 'Answer exceeds the %-word limit (currently % words).', v_max_answer_words, v_word_count;
  END IF;

  UPDATE public.debate_cross_exchanges
     SET answer = v_answer, answered_at = now(), updated_at = now()
   WHERE id = p_exchange_id;

  RETURN jsonb_build_object(
    'exchange_id', p_exchange_id,
    'debate_id', p_debate_id,
    'already_answered', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_cross_examination_answer_v2(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_cross_examination_answer_v2(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.submit_cross_examination_answer_v2(uuid, uuid, text) IS
  'Phase 4A: authenticated cross-examination answer submission. Only the exchange''s target_id may answer. The exchange row is locked and inspected -- existence, ownership by this debate, and target identity -- before any debate/round timing check; an already-answered exchange short-circuits to { already_answered: true } at that point, so a retry succeeds regardless of what has happened to the debate/round since the original successful call (correction, pre-apply review: an earlier revision checked round activity first and could incorrectly error on such a retry). Only a genuinely new answer requires the debate to be active and the cross-examination round to still be the exchange''s own active round -- an unanswered question past that point stays permanently unanswered. Answer immutability is additionally enforced by a table trigger (see section A), not just this RPC''s own check.';

-- =============================================================================
-- D. get_debate_room_signal_v2: cross-examination fields
-- =============================================================================
-- Extends the Phase 3 room-signal contract (20260721000001) via
-- CREATE OR REPLACE FUNCTION with the SAME signature, exactly as Phase 2
-- extended V1 RPCs without editing Phase 1's file -- every existing field,
-- and every existing per-stage ballot-visibility rule and can_manage
-- computation, is preserved byte-for-byte; only the two new fields below
-- are added. cross_exchange_count/cross_exchange_latest_updated_at need no
-- visibility gating the way the ballot fields do -- debate_cross_exchanges
-- is public SELECT (section A above), so a bare count and a bare "most
-- recently touched" timestamp are exactly as public as the rows themselves.
-- cross_exchange_latest_updated_at alone actually already detects both a
-- new question (INSERT: updated_at defaults to now()) and a newly submitted
-- answer (UPDATE: updated_at is bumped) without the row count changing --
-- cross_exchange_count is included alongside it anyway, for the same
-- reason reaction_count sits next to reaction_latest_created_at: symmetry
-- with the existing fields, and a plain "how many exchanges exist" number
-- costs nothing extra to expose.
CREATE OR REPLACE FUNCTION public.get_debate_room_signal_v2(p_debate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_format_version smallint;
  v_status text;
  v_closure_kind text;
  v_rounds jsonb;
  v_argument_count integer;
  v_reaction_count integer;
  v_reaction_latest timestamptz;
  v_cross_exchange_count integer;
  v_cross_exchange_latest timestamptz;
  v_membership_count integer;
  v_can_manage boolean;
  v_initial_stage_ended boolean;
  v_initial_user_has_ballot boolean := false;
  v_initial_visible boolean;
  v_initial_ballot_count integer;
  v_initial_ballot_latest timestamptz;
  v_final_stage_ended boolean;
  v_final_user_has_ballot boolean := false;
  v_final_visible boolean;
  v_final_ballot_count integer;
  v_final_ballot_latest timestamptz;
BEGIN
  SELECT format_version, status, closure_kind
    INTO v_format_version, v_status, v_closure_kind
    FROM public.debates
   WHERE id = p_debate_id;

  -- Unlike get_debate_ballot_results_v2, this deliberately returns NULL
  -- rather than RAISE EXCEPTION for "not found"/"not a V2 debate" -- this
  -- function exists purely to be polled cheaply and frequently, and a plain
  -- NULL is a simpler, less brittle signal for the caller than matching a
  -- RAISE EXCEPTION message on every tick.
  IF v_format_version IS NULL OR v_format_version <> 2 THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object('id', id, 'status', status, 'ends_at', ends_at)
             ORDER BY sequence_number
           ),
           '[]'::jsonb
         )
    INTO v_rounds
    FROM public.debate_rounds
   WHERE debate_id = p_debate_id;

  SELECT count(*)
    INTO v_argument_count
    FROM public.debate_arguments
   WHERE debate_id = p_debate_id;

  -- debate_reactions has no debate_id column of its own (only
  -- argument_id) -- join through debate_arguments to scope it, in one
  -- query, rather than a separate "fetch argument ids, then filter
  -- reactions" round trip. max(r.created_at) is included alongside the
  -- count specifically so a same-tick "one reaction removed, a different
  -- one added" (net-zero count change) still moves the signal -- the
  -- added row always carries a fresh created_at even when the total count
  -- doesn't change.
  SELECT count(*), max(r.created_at)
    INTO v_reaction_count, v_reaction_latest
    FROM public.debate_reactions r
    JOIN public.debate_arguments a ON a.id = r.argument_id
   WHERE a.debate_id = p_debate_id;

  -- Phase 4A: cross-examination exchanges are public SELECT, so unlike the
  -- ballot fields below this needs no visibility gating -- see this
  -- section's module-level comment (D) for why max(updated_at) alone
  -- already catches both a new question (INSERT) and a newly submitted
  -- answer (UPDATE) without the count changing.
  SELECT count(*), max(updated_at)
    INTO v_cross_exchange_count, v_cross_exchange_latest
    FROM public.debate_cross_exchanges
   WHERE debate_id = p_debate_id;

  SELECT count(*)
    INTO v_membership_count
    FROM public.debate_memberships
   WHERE debate_id = p_debate_id;

  -- can_manage_debate_v2 is already SECURITY INVOKER-safe to compose from
  -- inside a SECURITY DEFINER function (see its own comment in
  -- 20260718000003 -- "reachable only by composition from within the other
  -- SECURITY DEFINER functions"), so this calls it directly rather than
  -- re-deriving moderator/membership/editor/admin logic a third time.
  -- auth.uid() is unaffected by SECURITY DEFINER (it reflects the actual
  -- calling session, not the function owner), so v_user_id here is still
  -- the real caller. This is what lets the signal notice a moderator
  -- reassignment or an editor/admin role change even though neither moves
  -- v_membership_count (one row deleted, one inserted -- net zero).
  v_can_manage := public.can_manage_debate_v2(p_debate_id, v_user_id);

  -- Per-stage ballot visibility, mirroring get_debate_ballot_results_v2's
  -- own v_stage_ended / v_user_has_ballot / visibility computation exactly
  -- (see that function, section K of 20260718000003). Duplicated rather
  -- than composed into: composing would mean calling a SECURITY DEFINER
  -- function purely to observe whether it raises, via a BEGIN/EXCEPTION
  -- block, for each of two stages, on every poll tick -- more expensive and
  -- less transparent than mirroring roughly a dozen lines of boolean logic.
  -- If that function's visibility rule ever changes, this must change with
  -- it -- both are in migrations named for the phase that introduced them,
  -- so a future reviewer diffing get_debate_ballot_results_v2 should grep
  -- for this comment.
  --
  -- Each stage's ballot_count/ballot_latest_updated_at is populated ONLY
  -- when v_*_visible is true for that stage; otherwise it stays NULL. A
  -- caller who cannot yet see a stage's results has no UI to update for
  -- that stage regardless, so withholding the count/timestamp costs them
  -- nothing -- and prevents them from inferring turnout/voting-activity
  -- (a side channel get_debate_ballot_results_v2 itself was designed to
  -- prevent) purely by polling this signal.
  v_initial_stage_ended := v_status <> 'open';
  v_final_stage_ended := v_status = 'closed'
    OR EXISTS (
      SELECT 1 FROM public.debate_rounds
       WHERE debate_id = p_debate_id
         AND phase = 'final_vote'
         AND status IN ('completed', 'cancelled')
    );

  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.debate_ballots
       WHERE debate_id = p_debate_id AND user_id = v_user_id AND stage = 'initial'
    ) INTO v_initial_user_has_ballot;
    SELECT EXISTS(
      SELECT 1 FROM public.debate_ballots
       WHERE debate_id = p_debate_id AND user_id = v_user_id AND stage = 'final'
    ) INTO v_final_user_has_ballot;
  END IF;

  IF v_user_id IS NULL THEN
    v_initial_visible := false;
    v_final_visible := (v_status = 'closed');
  ELSE
    v_initial_visible := v_initial_user_has_ballot OR v_initial_stage_ended;
    v_final_visible := v_final_user_has_ballot OR v_final_stage_ended;
  END IF;

  IF v_initial_visible THEN
    SELECT count(*), max(updated_at)
      INTO v_initial_ballot_count, v_initial_ballot_latest
      FROM public.debate_ballots
     WHERE debate_id = p_debate_id AND stage = 'initial';
  END IF;

  IF v_final_visible THEN
    SELECT count(*), max(updated_at)
      INTO v_final_ballot_count, v_final_ballot_latest
      FROM public.debate_ballots
     WHERE debate_id = p_debate_id AND stage = 'final';
  END IF;

  RETURN jsonb_build_object(
    'debate_status', v_status,
    'closure_kind', v_closure_kind,
    'rounds', v_rounds,
    'argument_count', coalesce(v_argument_count, 0),
    'reaction_count', coalesce(v_reaction_count, 0),
    'reaction_latest_created_at', v_reaction_latest,
    'cross_exchange_count', coalesce(v_cross_exchange_count, 0),
    'cross_exchange_latest_updated_at', v_cross_exchange_latest,
    'membership_count', coalesce(v_membership_count, 0),
    'can_manage', v_can_manage,
    'initial_ballot_count', v_initial_ballot_count,
    'initial_ballot_latest_updated_at', v_initial_ballot_latest,
    'final_ballot_count', v_final_ballot_count,
    'final_ballot_latest_updated_at', v_final_ballot_latest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_debate_room_signal_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_debate_room_signal_v2(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_debate_room_signal_v2(uuid) IS
  'Phase 3 (20260721000001), extended in Phase 4A (20260721000002) with cross_exchange_count/cross_exchange_latest_updated_at: consolidated, privacy-safe polling signal for the V2 room UI. Returns only aggregate counts/timestamps, per-round id/status/ends_at, and a caller-specific can_manage boolean -- never individual ballot/reaction/exchange/membership rows, never a reactor/voter/asker/target identity, never vote/confidence/reason/question/answer content. Each ballot stage''s count/timestamp is NULL unless the caller satisfies get_debate_ballot_results_v2''s own visibility rule for that stage (mirrored inline, not bypassed); cross_exchange_count/cross_exchange_latest_updated_at need no such gating since debate_cross_exchanges is public SELECT. Consumed by DebateV2Room purely to decide whether a full data reload is worth its cost -- this function is not a substitute for get_debate_ballot_results_v2 or loadDebateV2Room and never reveals a result or row content.';

-- ---------------------------------------------------------------------------
-- Function security audit (mirrors the checklist at the end of
-- 20260718000003_debate_v2_lifecycle_permissions.sql, applied to the five
-- functions this migration creates/replaces: submit_cross_examination_
-- question_v2, submit_cross_examination_answer_v2, get_debate_room_signal_v2
-- (replaced), debate_cross_exchanges_check_same_debate, and
-- debate_cross_exchanges_answer_immutable_once_set. An earlier revision of
-- this migration undercounted this as three and left the same-debate
-- trigger function without SET search_path/REVOKE -- both corrected above,
-- pre-apply.)
-- ---------------------------------------------------------------------------
-- SET search_path = public: yes, all five. auth.uid(): used in three
-- (submit_cross_examination_question_v2/submit_cross_examination_answer_v2
-- reject a null caller outright; get_debate_room_signal_v2 uses it for
-- can_manage and ballot visibility, unaffected by SECURITY DEFINER -- see
-- that function's own comment); the two trigger functions do not use it,
-- consistent with their Phase 1 counterparts. is_suspended(): called
-- immediately after the auth.uid() check in both new participation RPCs,
-- matching the Phase 2 hardening-pass precedent (join_debate_v2,
-- cast_debate_ballot_v2, toggle_debate_reaction_v2,
-- submit_debate_argument_v2). Row locking: both new RPCs lock debate ->
-- caller's own debate_memberships row, in that order, identical to every
-- existing V2 participation RPC (no new deadlock risk from a divergent
-- lock sequence). submit_cross_examination_question_v2 then locks the
-- active round third, as before. submit_cross_examination_answer_v2 was
-- corrected (pre-apply review) to lock the specific exchange row third --
-- before, not after, the round -- and to check/return its idempotent
-- already_answered outcome immediately upon that lock, before any
-- debate-status or round-phase check; the round is now locked fourth, only
-- when a genuinely new answer is about to be written. This ordering
-- introduces no new deadlock risk: no other function ever locks the
-- exchange table, and the round remains the last lock any function
-- acquires among debate/membership/round. REVOKE ALL FROM PUBLIC: yes, all
-- five, immediately after each CREATE OR REPLACE FUNCTION, before any
-- GRANT. EXECUTE grants: both new participation RPCs to authenticated only
-- (matches join_debate_v2/cast_debate_ballot_v2/toggle_debate_reaction_v2/
-- submit_debate_argument_v2 -- anonymous callers cannot act, so are not
-- granted); the two trigger functions have no grant at all (reachable only
-- via their triggers, matching every Phase 1 trigger function's
-- precedent); get_debate_room_signal_v2's grant (anon, authenticated) is
-- unchanged from Phase 3, re-stated because CREATE OR REPLACE FUNCTION
-- preserves a function's existing ACL when its signature is unchanged (as
-- here) -- the REVOKE/GRANT pair is included anyway for this migration's
-- own self-contained clarity, not because the prior grant would otherwise
-- have been lost. No dynamic SQL anywhere in this migration. Minimal
-- return payloads: verified above -- submit_cross_examination_question_v2
-- returns only exchange_id/debate_id/round_id/target_id/target_argument_id
-- (no question text, no profile data); submit_cross_examination_answer_v2
-- returns only exchange_id/debate_id/already_answered (no answer text, no
-- profile data); neither returns another user's data. Never trusts a
-- caller-supplied ownership/stance/round/timing value: stance is always
-- read from the locked debate_memberships row; round_id/round attribution
-- is always the locked active round, never a client-supplied value; the
-- caller cannot claim to be the target of a question by passing a
-- different p_exchange_id's target_id -- the exchange row's own target_id
-- (read under its own lock) is what's compared to auth.uid(). Deletion
-- behaviour: round_id's ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
-- (corrected from RESTRICT, pre-apply -- see section A) and the new
-- answer-immutability trigger (section A) are both additive/defensive and
-- do not weaken any existing constraint or policy.
