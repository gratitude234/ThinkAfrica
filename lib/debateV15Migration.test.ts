import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n?/g, "\n");
}

const foundation = readSource(
  "supabase/migrations/20260728000001_debate_v1_5_foundation.sql"
);
const rpcs = readSource(
  "supabase/migrations/20260728000002_debate_v1_5_rpcs.sql"
);
const actions = readSource("app/(main)/debates/[id]/v15/actions.ts");

const clientRpcNames = [
  "create_debate_v1_5",
  "invite_debater_v1_5",
  "respond_to_debate_invitation_v1_5",
  "revoke_debate_invitation_v1_5",
  "start_debate_v1_5",
  "advance_debate_phase_v1_5",
  "submit_debate_argument_v1_5",
  "cast_final_vote_v1_5",
  "extend_deadline_v1_5",
  "complete_debate_v1_5",
  "cancel_debate_v1_5",
  "remind_debate_voters_v1_5",
  "toggle_debate_vote",
] as const;

describe("Debate V1.5 migration static contract", () => {
  it("uses the constrained variant and structurally enforces strict 1v1", () => {
    expect(foundation).toContain(
      "CHECK (debate_variant IN ('legacy', 'v1_5'))"
    );
    expect(foundation).toMatch(
      /PRIMARY KEY \(debate_id, stance\)[\s\S]*UNIQUE \(debate_id, user_id\)/
    );
    expect(foundation).toContain("debates_v1_5_deadline_order_check");
    expect(foundation).toContain("debates_v1_5_state_check");
  });

  it("keeps V1.5 child-table writes RPC-only and format-gates legacy policies", () => {
    expect(foundation).not.toMatch(
      /CREATE POLICY[\s\S]{0,120}ON public\.debate_slots_v1_5 FOR (INSERT|UPDATE|DELETE)/
    );
    expect(foundation).not.toMatch(
      /CREATE POLICY[\s\S]{0,120}ON public\.debate_argument_sources_v1 FOR (INSERT|UPDATE|DELETE)/
    );
    expect(foundation).toContain("d.debate_variant = 'legacy'");
    expect(foundation).toContain("column_name = 'format_version'");
  });

  it("protects legacy and V1.5 lifecycle fields from direct authenticated updates", () => {
    expect(foundation).toContain(
      "IF current_user IN ('anon', 'authenticated')"
    );
    expect(foundation).toContain(
      "to_jsonb(NEW) - ARRAY['title', 'description', 'tags']::text[]"
    );
    expect(foundation).toContain(
      "to_jsonb(OLD) - ARRAY['title', 'description', 'tags']::text[]"
    );
    expect(foundation).toContain(
      "REVOKE ALL ON FUNCTION public.guard_debate_v1_5_protected_fields() FROM PUBLIC"
    );
  });

  it("defines every UI RPC with SECURITY DEFINER, a safe search path, and a narrow grant", () => {
    for (const name of clientRpcNames) {
      expect(rpcs).toContain(`FUNCTION public.${name}`);
      expect(rpcs).toMatch(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = public`
        )
      );
      expect(rpcs).toContain(`GRANT EXECUTE ON FUNCTION public.${name}`);
    }
  });

  it("keeps the server actions and SQL RPC names in sync", () => {
    for (const name of clientRpcNames.filter(
      (name) => name !== "create_debate_v1_5"
    )) {
      expect(actions).toContain(`"${name}"`);
    }
  });

  it("checks phase and deadline in both participant write RPCs", () => {
    expect(rpcs).toMatch(
      /current_phase NOT IN \('opening', 'rebuttal'\)[\s\S]*now\(\) > v_debate\.opening_deadline[\s\S]*now\(\) > v_debate\.rebuttal_deadline/
    );
    expect(rpcs).toMatch(
      /current_phase <> 'voting'[\s\S]*now\(\) > v_debate\.voting_deadline/
    );
  });

  it("keeps every V1.5 authenticated mutation suspension-gated", () => {
    for (const name of [
      "create_debate_v1_5",
      "invite_debater_v1_5",
      "respond_to_debate_invitation_v1_5",
      "revoke_debate_invitation_v1_5",
      "start_debate_v1_5",
      "advance_debate_phase_v1_5",
      "submit_debate_argument_v1_5",
      "cast_final_vote_v1_5",
      "extend_deadline_v1_5",
      "complete_debate_v1_5",
      "cancel_debate_v1_5",
      "remind_debate_voters_v1_5",
    ]) {
      const start = rpcs.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
      const end = rpcs.indexOf("\n$$;", start);
      expect(start).toBeGreaterThan(-1);
      expect(rpcs.slice(start, end)).toContain("public.is_suspended()");
    }
  });

  it("serializes shared upvotes debate-first and reconciles the counter from votes", () => {
    const toggleStart = rpcs.indexOf(
      "CREATE OR REPLACE FUNCTION public.toggle_debate_vote"
    );
    const toggle = rpcs.slice(toggleStart);
    const debateLock = toggle.indexOf("FROM public.debates d");
    const argumentLock = toggle.indexOf(
      "FROM public.debate_arguments da",
      debateLock
    );
    expect(debateLock).toBeGreaterThan(-1);
    expect(argumentLock).toBeGreaterThan(debateLock);
    expect(toggle).toContain(
      "SELECT count(*) INTO v_count\n    FROM public.debate_votes"
    );
  });

  it("contains no discarded request/approval or automatic lifecycle RPC", () => {
    expect(rpcs).not.toContain("request_debate_side_v1_5");
    expect(rpcs).not.toContain("sync_debate_phase_v1_5");
    expect(rpcs).not.toContain("advance_due_debates_v1_5");
  });

  it("preserves the legacy RPC phase and return contracts", () => {
    const legacyStart = rpcs.indexOf(
      "-- Harden the five legacy lifecycle RPCs against V1.5"
    );
    const legacy = rpcs.slice(legacyStart);
    expect(legacy).toContain("WHEN 'closing' THEN 'closing'");
    expect(legacy).toContain("ELSE 'opening'");
    expect(legacy).toContain("'user_vote', p_vote");
    expect(legacy).toContain(
      "GREATEST(COALESCE(v_round_duration, 5), 1) * 3"
    );
    expect(legacy).toContain("IF NOT FOUND THEN\n    RAISE EXCEPTION 'Debate not found.';");
  });

  it("uses the complete known notification constraint superset", () => {
    for (const type of [
      "review_started",
      "review_reminder",
      "moderation_post_removed",
      "debate_v2_round_change",
      "debate_v2_evidence_requested",
      "debate_invitation",
      "debate_invitation_response",
      "debate_phase_advanced",
      "debate_cancelled",
    ]) {
      expect(foundation).toContain(`'${type}'`);
    }
  });

  it("validates source URLs as complete non-whitespace HTTP(S) values", () => {
    expect(foundation).toContain("^https?://[^[:space:]]+$");
    expect(rpcs).toContain("^https?://[^[:space:]]+$");
  });
});
