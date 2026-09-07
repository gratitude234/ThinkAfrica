import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Compatibility: the new rules must not refuse anything the product legitimately
 * does today.
 *
 * A policy layer is easy to make safe by making it strict. The risk that
 * matters is the other one: a real row shape nobody thought of, refused by a
 * rule written from a trigger and a reading of the call sites. So this samples
 * actual production rows, across every status and type that exists, and asserts
 * the policy permits what the application currently permits for each.
 *
 * READ ONLY. It issues SELECTs and evaluates a pure function. No production row
 * is written, and no transaction is opened.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(supabaseUrl && serviceKey);

const { canWriteToPost, checkContentEdit, checkDelete, checkTransition } =
  await import("@/lib/postPolicy");
import type { PostActor, PostStateSnapshot } from "@/lib/postPolicy";
import type { PostStatus } from "@/lib/types";

const EDITORIAL = new Set(["research", "policy_brief"]);

describe.skipIf(!enabled)("the policy against real production rows", () => {
  it("permits what the product does today, for every status and type in use", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("posts")
      .select(
        "id, author_id, status, type, content_kind, article_format, citation_id, published_version_id"
      )
      .limit(500);

    if (error) throw new Error(`sample query failed: ${error.message}`);
    const rows = (data ?? []) as PostStateSnapshot[];
    expect(rows.length, "no posts sampled").toBeGreaterThan(0);

    const seen = new Map<string, number>();
    const surprises: string[] = [];

    for (const post of rows) {
      const owner: PostActor = { kind: "author", userId: post.author_id };
      const key = `${post.status}/${post.type}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);

      const editorial = EDITORIAL.has(post.type);
      const writable = canWriteToPost(owner, post).allowed;

      // What the owner should be able to do with this row, stated from the
      // product rather than from the implementation.
      const expectedWritable =
        post.status !== "removed" &&
        post.status !== "withdrawn" &&
        !(post.status === "published" && editorial);

      if (writable !== expectedWritable) {
        surprises.push(
          `${key}: canWriteToPost=${writable}, expected ${expectedWritable}`
        );
      }

      // A draft is deletable by its owner and nothing else is.
      const deletable = checkDelete(owner, post).allowed;
      if (deletable !== (post.status === "draft")) {
        surprises.push(`${key}: checkDelete=${deletable}`);
      }

      // An ordinary content edit, which is the most common write in the
      // product, must survive for every row the owner may write to.
      const edits = checkContentEdit(owner, post, { title: "x" }).allowed;
      if (edits !== expectedWritable) {
        surprises.push(`${key}: checkContentEdit=${edits}`);
      }
    }

    console.info(
      `\n[compat] sampled ${rows.length} posts across ${seen.size} status/type combinations:\n` +
        [...seen.entries()]
          .sort()
          .map(([key, count]) => `    ${key.padEnd(28)} ${count}`)
          .join("\n") +
        "\n"
    );

    expect(surprises, surprises.join("\n")).toEqual([]);
  }, 120_000);

  it("permits the exact transitions the live call sites perform", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Each entry is a transition some server action performs today, with the
    // file that performs it. If the policy refuses one of these, a real
    // workflow breaks the moment it is wired in.
    const flows: Array<{
      from: PostStatus;
      to: PostStatus;
      actor: PostActor["kind"];
      site: string;
      editorialOnly?: boolean;
    }> = [
      { from: "draft", to: "published", actor: "author", site: "write/actions.ts" },
      { from: "draft", to: "pending", actor: "author", site: "submit/research/actions.ts" },
      {
        from: "pending_revision",
        to: "pending",
        actor: "author",
        site: "edit/[slug]/actions.ts",
      },
      {
        from: "pending",
        to: "pending_revision",
        actor: "editor",
        site: "admin/review/actions.ts",
      },
      { from: "pending", to: "rejected", actor: "editor", site: "admin/review/actions.ts" },
      { from: "pending", to: "published", actor: "system", site: "publishReviewedPost()" },
      {
        from: "pending",
        to: "withdrawn",
        actor: "author",
        site: "withdraw_post_submission()",
        editorialOnly: true,
      },
      { from: "published", to: "removed", actor: "admin", site: "admin/moderation/actions.ts" },
    ];

    // Real rows, so the classification fields are whatever production actually
    // stores rather than what a fixture assumes.
    const { data } = await supabase
      .from("posts")
      .select(
        "id, author_id, status, type, content_kind, article_format, citation_id, published_version_id"
      )
      .limit(200);
    const rows = (data ?? []) as PostStateSnapshot[];

    const editorialRow =
      rows.find((row) => EDITORIAL.has(row.type)) ??
      ({ ...rows[0], type: "research" } as PostStateSnapshot);
    const ordinaryRow =
      rows.find((row) => !EDITORIAL.has(row.type)) ?? rows[0];

    const failures: string[] = [];
    for (const flow of flows) {
      const base = flow.editorialOnly ? editorialRow : ordinaryRow;
      // A draft-to-published flow on editorial content is the one case the
      // product genuinely forbids, so ordinary content is the right sample.
      const post: PostStateSnapshot = { ...base, status: flow.from };
      const actor: PostActor =
        flow.actor === "system"
          ? { kind: "system" }
          : { kind: flow.actor, userId: post.author_id };

      const decision = checkTransition({ actor, post, nextStatus: flow.to });
      if (!decision.allowed) {
        failures.push(
          `${flow.from} -> ${flow.to} as ${flow.actor} (${flow.site}): ${
            decision.allowed === false ? decision.reason : ""
          }`
        );
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  }, 120_000);
});

describe.skipIf(enabled)("the policy against real production rows", () => {
  it("is skipped without Supabase credentials", () => {
    const missing = [
      !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
      !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean);
    console.info(`[compat] not run. Missing: ${missing.join(", ")}`);
    expect(missing.length).toBeGreaterThan(0);
  });
});
