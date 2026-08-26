import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const schema = read("supabase/migrations/20260827000002_opportunity_outcomes.sql");
const rpcs = read("supabase/migrations/20260827000003_opportunity_outcome_rpcs.sql");
const actions = read("app/(main)/settings/profile/outcomeActions.ts");
const section = read("app/(main)/settings/profile/sections/OutcomesSection.tsx");

describe("outcome states", () => {
  it("supports the full workflow, not only the publishable states", () => {
    for (const state of [
      "contacted",
      "shortlisted",
      "selected",
      "completed",
      "declined",
      "disputed",
      "revoked",
    ]) {
      expect(schema).toContain(`'${state}'`);
    }
  });

  it("publishes only a selection or a completion", () => {
    // The table constraint gates the flag itself.
    expect(schema).toContain("status = ANY (ARRAY['selected', 'completed'])");
    // The public view restates it, so a constraint change alone cannot leak.
    expect(schema).toMatch(
      /public_opportunity_outcomes[\s\S]*?status = ANY \(ARRAY\['selected', 'completed'\]\)/
    );
  });
});

describe("verification gates", () => {
  it("forbids a verifier who is the submitter or the profile owner", () => {
    expect(schema).toContain("CHECK (verified_by IS NULL OR verified_by <> submitted_by)");
    expect(schema).toContain("CHECK (verified_by IS NULL OR verified_by <> profile_id)");
  });

  it("requires verification to be complete or absent, never half-set", () => {
    expect(schema).toContain("opportunity_outcomes_verification_complete");
    expect(schema).toContain(
      "(verified_by IS NULL AND verified_at IS NULL AND verification_source IS NULL)"
    );
  });

  it("requires verification, owner consent and no revocation before public", () => {
    const constraint = schema.slice(
      schema.indexOf("opportunity_outcomes_public_requires_verification"),
      schema.indexOf("CONSTRAINT opportunity_outcomes_revocation_complete")
    );
    expect(constraint).toContain("verified_at IS NOT NULL");
    expect(constraint).toContain("owner_confirmed_at IS NOT NULL");
    expect(constraint).toContain("revoked_at IS NULL");
  });

  it("limits who may verify to an administrator or the inquiry sender", () => {
    expect(rpcs).toContain("CREATE OR REPLACE FUNCTION public.can_verify_opportunity_outcome");
    expect(rpcs).toContain("actor.role = 'admin'");
    expect(rpcs).toContain("inquiry.sender_id = p_actor_id");
    expect(rpcs).toContain("outcome.submitted_by <> p_actor_id");
    expect(rpcs).toContain("outcome.profile_id <> p_actor_id");
  });

  it("refuses a provider recording an outcome against a stranger's profile", () => {
    expect(rpcs).toContain("You cannot record an outcome for this profile.");
  });

  it("refuses to verify a revoked or disputed outcome", () => {
    expect(rpcs).toContain("A revoked or disputed outcome cannot be verified.");
  });

  it("refuses to publish an unverified outcome, in the RPC as well as the constraint", () => {
    expect(rpcs).toContain(
      "An outcome must be verified before it can be shown publicly."
    );
    expect(rpcs).toContain("Only a selection or a completion can be shown publicly.");
    expect(rpcs).toContain("A revoked outcome cannot be shown publicly.");
  });
});

describe("public projection", () => {
  it("selects safe columns explicitly rather than excluding unsafe ones", () => {
    const view = schema.slice(
      schema.indexOf("CREATE OR REPLACE VIEW public.public_opportunity_outcomes"),
      schema.indexOf("REVOKE ALL ON TABLE public.public_opportunity_outcomes")
    );
    for (const privateColumn of [
      "private_evidence_note",
      "dispute_reason",
      "submitted_by",
      "verified_by",
      "submitted_role",
      "revoked_by",
    ]) {
      expect(view).not.toContain(privateColumn);
    }
    expect(view).toContain("outcome.opportunity_title");
    expect(view).toContain("outcome.verification_source");
  });

  it("hides outcomes belonging to a suspended profile", () => {
    expect(schema).toContain("owner.suspended_at IS NULL");
  });
});

describe("anti-gaming and audit", () => {
  it("gives the client no way to write the table directly", () => {
    expect(schema).toContain(
      "REVOKE ALL ON TABLE public.opportunity_outcomes FROM PUBLIC, anon, authenticated"
    );
    expect(schema).toContain("GRANT SELECT ON TABLE public.opportunity_outcomes TO authenticated");
    expect(schema).not.toMatch(
      /GRANT (INSERT|UPDATE)[^;]*ON TABLE public\.opportunity_outcomes TO authenticated/
    );
  });

  it("prevents duplicate outcomes for the same person, source and stage", () => {
    expect(schema).toContain("opportunity_outcomes_unique_stage_idx");
    expect(schema).toContain("opportunity_outcomes_unique_external_idx");
    expect(rpcs).toContain("ON CONFLICT DO NOTHING");
  });

  it("records every transition in an append-only history", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS public.opportunity_outcome_events");
    for (const action of [
      "submitted",
      "verified",
      "owner_confirmed",
      "published",
      "unpublished",
      "disputed",
      "revoked",
    ]) {
      expect(schema).toContain(`'${action}'`);
    }
    expect(rpcs.match(/INSERT INTO public\.opportunity_outcome_events/g)?.length)
      .toBeGreaterThanOrEqual(5);
  });

  it("keeps every definer function on a fixed empty search path", () => {
    const definers = rpcs.match(/SECURITY DEFINER\s*\nSET search_path = ''/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(5);
    expect(rpcs).not.toMatch(/SECURITY DEFINER\s*\nAS \$\$/);
  });

  it("grants execute to authenticated only, never to anon", () => {
    for (const fn of [
      "submit_opportunity_outcome",
      "verify_opportunity_outcome",
      "set_opportunity_outcome_visibility",
      "dispute_opportunity_outcome",
      "revoke_opportunity_outcome",
    ]) {
      expect(rpcs).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}[\\s\\S]{0,120}FROM PUBLIC, anon`));
    }
  });

  it("takes an outcome private the moment it is disputed or revoked", () => {
    expect(rpcs).toMatch(/SET status = 'disputed',\s*\n\s*is_public = false/);
    expect(rpcs).toMatch(/SET status = 'revoked',\s*\n\s*is_public = false/);
  });
});

describe("owner surface", () => {
  it("reads its own outcomes without private evidence or verifier identity", () => {
    const select = actions.slice(
      actions.indexOf('.select('),
      actions.indexOf('.eq("profile_id"')
    );
    for (const privateColumn of [
      "private_evidence_note",
      "dispute_reason",
      "verified_by",
      "submitted_by",
    ]) {
      expect(select).not.toContain(privateColumn);
    }
  });

  it("goes through the RPCs rather than writing the table", () => {
    expect(actions).toContain('rpc("submit_opportunity_outcome"');
    expect(actions).toContain('rpc("set_opportunity_outcome_visibility"');
    expect(actions).toContain('rpc("dispute_opportunity_outcome"');
    expect(actions).not.toMatch(/from\("opportunity_outcomes"\)[\s\S]{0,80}\.(insert|update)/);
  });

  it("reports visibility changes after persistence, not on the click", () => {
    expect(section).toMatch(
      /if \(!result\.ok\)[\s\S]{0,200}return;[\s\S]{0,200}trackActivationEvent\(\{\s*\n\s*event: "opportunity_outcome_visibility_changed"/
    );
  });

  it("sends no outcome text or private note to analytics", () => {
    const analyticsCalls = section.match(/trackActivationEvent\(\{[\s\S]*?\}\);/g) ?? [];
    expect(analyticsCalls.length).toBeGreaterThan(0);
    for (const call of analyticsCalls) {
      for (const forbidden of [
        "opportunityTitle",
        "organizationName",
        "privateEvidenceNote",
        "evidenceUrl",
        "reason",
      ]) {
        expect(call).not.toContain(forbidden);
      }
    }
  });

  it("explains every state to the owner in words", () => {
    for (const state of ["contacted", "shortlisted", "selected", "completed", "declined", "disputed", "revoked"]) {
      expect(section).toContain(`${state}:`);
    }
    expect(section).toContain("Private, always.");
  });
});
