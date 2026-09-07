import { describe, expect, it } from "vitest";

import {
  AUTHOR_EDITABLE_POST_COLUMNS,
  canWriteToPost,
  checkContentEdit,
  checkDelete,
  checkTransition,
  findTransition,
  LIVE_POLICY,
  NEVER_AUTHOR_WRITABLE_POST_COLUMNS,
  partitionPostPatch,
  POST_TRANSITIONS,
  REPO_POLICY,
  requiresEditorialPublication,
  type PostActor,
  type PostStateSnapshot,
} from "@/lib/postPolicy";
import type { PostStatus } from "@/lib/types";

/**
 * The rule matrix, as tests.
 *
 * These are the checks `guard_locked_post_write()` performs and which are
 * absent on Neon, where the trigger's bypass condition (`current_user IS
 * DISTINCT FROM 'authenticated'`) is always true and it returns before
 * evaluating anything. Unlike RLS, which compares against a NULL auth.uid()
 * and denies, this one fails OPEN. So every case below has to be refused here,
 * with no database involved.
 */

const AUTHOR = "author-1";
const STRANGER = "author-2";

const author: PostActor = { kind: "author", userId: AUTHOR };
const otherAuthor: PostActor = { kind: "author", userId: STRANGER };
const editor: PostActor = { kind: "editor", userId: "editor-1" };
const admin: PostActor = { kind: "admin", userId: "admin-1" };
const system: PostActor = { kind: "system" };

function post(overrides: Partial<PostStateSnapshot> = {}): PostStateSnapshot {
  return {
    id: "post-1",
    author_id: AUTHOR,
    status: "draft",
    type: "essay",
    content_kind: "article",
    article_format: "standard",
    citation_id: null,
    published_version_id: null,
    ...overrides,
  };
}

const research = (overrides: Partial<PostStateSnapshot> = {}) =>
  post({ type: "research", ...overrides });

// ── Ownership ────────────────────────────────────────────────────────

describe("ownership", () => {
  it("refuses an author who does not own the post", () => {
    const decision = canWriteToPost(otherAuthor, post());
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.refusal).toBe("not_owner");
  });

  it("allows the owner", () => {
    expect(canWriteToPost(author, post()).allowed).toBe(true);
  });

  it("allows editors and admins on posts they do not own", () => {
    expect(canWriteToPost(editor, post()).allowed).toBe(true);
    expect(canWriteToPost(admin, post()).allowed).toBe(true);
  });

  it("never infers ownership from anything the caller sent", () => {
    // The snapshot's author_id comes from the database. A caller claiming to
    // be the author of a post they do not own is the shape of the bug this
    // whole layer exists to make impossible.
    const decision = canWriteToPost(
      { kind: "author", userId: "whoever-they-say" },
      post({ author_id: AUTHOR })
    );
    expect(decision.allowed).toBe(false);
  });
});

// ── The six live locks ───────────────────────────────────────────────

describe("an author cannot self-publish work that requires editorial acceptance", () => {
  for (const type of ["research", "policy_brief"]) {
    it(`refuses draft -> published for ${type}`, () => {
      const decision = checkTransition({
        actor: author,
        post: post({ type, status: "draft" }),
        nextStatus: "published",
      });
      expect(decision.allowed).toBe(false);
      expect(decision.allowed === false && decision.refusal).toBe(
        "self_publish_reviewed"
      );
    });
  }

  it("allows an editor to publish the same submission", () => {
    expect(
      checkTransition({
        actor: editor,
        post: research({ status: "pending" }),
        nextStatus: "published",
      }).allowed
    ).toBe(true);
  });

  it("still allows an author to publish an ordinary essay", () => {
    expect(
      checkTransition({
        actor: author,
        post: post({ type: "essay", status: "draft" }),
        nextStatus: "published",
      }).allowed
    ).toBe(true);
  });

  it("refuses a single write that reclassifies and publishes at once", () => {
    // The bypass the classification freeze was written for: check the
    // resulting classification, not only the stored one.
    const decision = checkTransition({
      actor: author,
      post: post({ type: "essay", status: "draft" }),
      nextStatus: "published",
      nextClassification: { type: "research" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.refusal).toBe(
      "self_publish_reviewed"
    );
  });
});

describe("workflow evidence cannot be forged", () => {
  for (const field of ["citation_id", "published_version_id"] as const) {
    it(`refuses an author setting ${field}`, () => {
      const decision = checkContentEdit(author, post(), {
        [field]: "forged-value",
      });
      expect(decision.allowed).toBe(false);
    });

    it(`refuses an author clearing an existing ${field}`, () => {
      // Either direction. Clearing somebody's citation is as damaging as
      // awarding yourself one.
      const decision = checkContentEdit(
        author,
        post({ [field]: "INDEGENIUS-1" } as Partial<PostStateSnapshot>),
        { [field]: null }
      );
      expect(decision.allowed).toBe(false);
    });

    it(`allows the editorial workflow to write ${field}`, () => {
      expect(
        checkContentEdit(system, post(), { [field]: "INDEGENIUS-1" }).allowed
      ).toBe(true);
    });
  }
});

describe("an accepted publication is locked", () => {
  it("refuses the author editing a published research paper", () => {
    const decision = canWriteToPost(author, research({ status: "published" }));
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.refusal).toBe(
      "locked_publication"
    );
  });

  it("still allows the author editing a published essay", () => {
    expect(
      canWriteToPost(author, post({ type: "essay", status: "published" })).allowed
    ).toBe(true);
  });

  it("allows an editor to correct a locked publication", () => {
    expect(canWriteToPost(editor, research({ status: "published" })).allowed).toBe(
      true
    );
  });
});

describe("a removed post is untouchable", () => {
  it("refuses the owner", () => {
    const decision = canWriteToPost(author, post({ status: "removed" }));
    expect(decision.allowed === false && decision.refusal).toBe("removed_post");
  });

  it("refuses an editor, who has no moderation authority", () => {
    // Moderation is not undone by editing around it, and editorial authority
    // is not moderation authority.
    expect(canWriteToPost(editor, post({ status: "removed" })).allowed).toBe(false);
  });

  it("lets moderation reverse itself, and only through the restore", () => {
    // Not a weakening: the trigger exempts service_role entirely, and
    // restoring a removed post is a thing moderation does today. The
    // transition table is what limits it to the one legitimate move.
    expect(
      checkTransition({
        actor: admin,
        post: post({ status: "removed" }),
        nextStatus: "published",
      }).allowed
    ).toBe(true);
  });

  it("refuses every other transition out of removed, for everyone", () => {
    for (const next of ["draft", "pending", "pending_revision", "rejected"] as PostStatus[]) {
      for (const who of [author, editor, admin]) {
        expect(
          checkTransition({
            actor: who,
            post: post({ status: "removed" }),
            nextStatus: next,
          }).allowed,
          `removed -> ${next} as ${who.kind}`
        ).toBe(false);
      }
    }
  });

  it("refuses the author and the editor a restore", () => {
    for (const who of [author, editor]) {
      expect(
        checkTransition({
          actor: who,
          post: post({ status: "removed" }),
          nextStatus: "published",
        }).allowed
      ).toBe(false);
    }
  });
});

describe("a withdrawn submission cannot be resurrected", () => {
  it("refuses the owner writing to it", () => {
    const decision = canWriteToPost(author, research({ status: "withdrawn" }));
    expect(decision.allowed === false && decision.refusal).toBe("withdrawn_post");
  });

  it("refuses withdrawn -> pending, which is the resurrection", () => {
    // Re-entering review with retired reviewer assignments and a stale
    // editorial history is the specific harm.
    expect(
      checkTransition({
        actor: author,
        post: research({ status: "withdrawn" }),
        nextStatus: "pending",
      }).allowed
    ).toBe(false);
  });

  it("allows only research and policy briefs to be withdrawn at all", () => {
    const decision = checkTransition({
      actor: author,
      post: post({ type: "essay", status: "pending" }),
      nextStatus: "withdrawn",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.refusal).toBe(
      "withdraw_not_eligible"
    );
  });

  it("allows withdrawal from pending and pending_revision", () => {
    for (const from of ["pending", "pending_revision"] as PostStatus[]) {
      expect(
        checkTransition({
          actor: author,
          post: research({ status: from }),
          nextStatus: "withdrawn",
        }).allowed
      ).toBe(true);
    }
  });

  it("refuses withdrawal from a state that was never in review", () => {
    expect(
      checkTransition({
        actor: author,
        post: research({ status: "draft" }),
        nextStatus: "withdrawn",
      }).allowed
    ).toBe(false);
  });
});

describe("hard delete is for drafts only", () => {
  it("allows the owner to delete their draft", () => {
    expect(checkDelete(author, post({ status: "draft" })).allowed).toBe(true);
  });

  for (const status of [
    "pending",
    "pending_revision",
    "published",
    "rejected",
    "removed",
    "withdrawn",
  ] as PostStatus[]) {
    it(`refuses deleting a ${status} post`, () => {
      const decision = checkDelete(author, post({ status }));
      expect(decision.allowed).toBe(false);
      expect(decision.allowed === false && decision.refusal).toBe(
        "delete_non_draft"
      );
    });
  }

  it("refuses a stranger deleting somebody's draft", () => {
    expect(checkDelete(otherAuthor, post({ status: "draft" })).allowed).toBe(false);
  });
});

// ── Protected columns ────────────────────────────────────────────────

describe("protected columns", () => {
  it("rejects the whole mutation rather than stripping the dangerous key", () => {
    // Silently stripping means a request to publish yourself returns success
    // having done something else, which is a refusal the caller cannot see.
    const decision = checkContentEdit(author, post(), {
      title: "A new title",
      status: "published",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.refusal).toBe("protected_field");
  });

  it("names every protected field it refused", () => {
    const { rejected } = partitionPostPatch({
      title: "ok",
      status: "published",
      author_id: STRANGER,
      citation_id: "x",
    });
    expect(rejected.protectedFields.sort()).toEqual([
      "author_id",
      "citation_id",
      "status",
    ]);
  });

  it("refuses an unknown column, because default-deny is the point", () => {
    // A column added to the table since this list was written must not be
    // author-writable by default.
    const { rejected } = partitionPostPatch({ some_new_column: 1 });
    expect(rejected.unknownFields).toEqual(["some_new_column"]);
    expect(checkContentEdit(author, post(), { some_new_column: 1 }).allowed).toBe(
      false
    );
  });

  it("allows an ordinary content edit", () => {
    expect(
      checkContentEdit(author, post(), {
        title: "A new title",
        content: "<p>body</p>",
        tags: ["governance"],
      }).allowed
    ).toBe(true);
  });

  it("keeps status out of the author allowlist", () => {
    // The single most important entry in the table. A general patch API that
    // accepted status is how a content edit and a publication become one
    // statement.
    expect(AUTHOR_EDITABLE_POST_COLUMNS).not.toContain("status");
    expect(NEVER_AUTHOR_WRITABLE_POST_COLUMNS).toContain("status");
  });

  it("keeps the two evidence columns out of it", () => {
    for (const field of ["citation_id", "published_version_id"]) {
      expect(AUTHOR_EDITABLE_POST_COLUMNS).not.toContain(field);
      expect(NEVER_AUTHOR_WRITABLE_POST_COLUMNS).toContain(field);
    }
  });

  it("lets the editorial workflow past the allowlist", () => {
    expect(
      checkContentEdit(system, post(), { status: "published", citation_id: "x" })
        .allowed
    ).toBe(true);
  });
});

// ── State machine ────────────────────────────────────────────────────

describe("the state machine", () => {
  it("allows the transitions the product actually performs", () => {
    const legitimate: Array<[PostStatus, PostStatus, PostActor]> = [
      ["draft", "draft", author],
      ["draft", "published", author],
      ["draft", "pending", author],
      ["pending", "pending_revision", editor],
      ["pending", "published", editor],
      ["pending", "rejected", editor],
      ["pending_revision", "pending", author],
      ["pending_revision", "pending_revision", author],
      ["published", "published", author],
    ];
    for (const [from, to, actor] of legitimate) {
      const decision = checkTransition({
        actor,
        post: post({ status: from }),
        nextStatus: to,
      });
      expect(decision, `${from} -> ${to} as ${actor.kind}`).toMatchObject({
        allowed: true,
      });
    }
  });

  it("refuses transitions no flow performs", () => {
    const forbidden: Array<[PostStatus, PostStatus]> = [
      ["published", "draft"],
      ["rejected", "pending"],
      ["rejected", "published"],
      ["withdrawn", "pending"],
      ["removed", "draft"],
      ["draft", "rejected"],
      ["draft", "withdrawn"],
      ["published", "pending"],
    ];
    for (const [from, to] of forbidden) {
      const decision = checkTransition({
        actor: author,
        post: research({ status: from }),
        nextStatus: to,
      });
      expect(decision, `${from} -> ${to}`).toMatchObject({ allowed: false });
    }
  });

  it("refuses an author performing an editorial transition", () => {
    for (const next of ["pending_revision", "rejected"] as PostStatus[]) {
      const decision = checkTransition({
        actor: author,
        post: research({ status: "pending" }),
        nextStatus: next,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.allowed === false && decision.refusal).toBe("role_required");
    }
  });

  it("refuses an editor removing a post, which is moderation", () => {
    const decision = checkTransition({
      actor: editor,
      post: post({ status: "published" }),
      nextStatus: "removed",
    });
    expect(decision.allowed).toBe(false);
    expect(admin.kind).toBe("admin");
    expect(
      checkTransition({
        actor: admin,
        post: post({ status: "published" }),
        nextStatus: "removed",
      }).allowed
    ).toBe(true);
  });

  it("lets nothing but moderation leave a terminal state", () => {
    // The table and canWriteToPost have to agree about what is terminal, or
    // one of them is decoration. Exactly two rules may start from a terminal
    // status: withdrawn -> removed, and the moderation restore.
    const fromTerminal = POST_TRANSITIONS.filter((rule) =>
      ["removed", "withdrawn"].includes(rule.from)
    );

    expect(
      fromTerminal.map((rule) => `${rule.from}->${rule.to}`).sort()
    ).toEqual(["removed->published", "withdrawn->removed"]);

    for (const rule of fromTerminal) {
      expect(rule.actors, `${rule.from} -> ${rule.to}`).not.toContain("author");
      expect(rule.actors, `${rule.from} -> ${rule.to}`).not.toContain("editor");
    }
  });

  it("exposes the table for inspection rather than hiding it in conditionals", () => {
    expect(findTransition("draft", "pending")).toBeDefined();
    expect(findTransition("published", "draft")).toBeUndefined();
  });
});

// ── The three repo-only rules ────────────────────────────────────────

describe("the three rules production does not have", () => {
  const inReview = research({ status: "pending" });

  it("permits classification changes under LIVE_POLICY, matching production", () => {
    // Not an endorsement. This is what the deployed trigger does today, and a
    // policy layer that silently differed from production would be a third
    // version of the rules rather than a port of them.
    expect(
      checkTransition(
        {
          actor: author,
          post: inReview,
          nextStatus: "pending",
          nextClassification: { type: "essay" },
        },
        LIVE_POLICY
      ).allowed
    ).toBe(true);
  });

  it("refuses them under REPO_POLICY", () => {
    const decision = checkTransition(
      {
        actor: author,
        post: inReview,
        nextStatus: "pending",
        nextClassification: { type: "essay" },
      },
      REPO_POLICY
    );
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.refusal).toBe(
      "classification_frozen"
    );
  });

  it("under REPO_POLICY, a pending submission may only be moved by an editor", () => {
    const decision = checkTransition(
      { actor: author, post: inReview, nextStatus: "withdrawn" },
      REPO_POLICY
    );
    expect(decision.allowed).toBe(false);
  });

  it("under REPO_POLICY, a revision may stay or be resubmitted, nothing else", () => {
    const revising = research({ status: "pending_revision" });
    expect(
      checkTransition(
        { actor: author, post: revising, nextStatus: "pending" },
        REPO_POLICY
      ).allowed
    ).toBe(true);
    expect(
      checkTransition(
        { actor: author, post: revising, nextStatus: "withdrawn" },
        REPO_POLICY
      ).allowed
    ).toBe(false);
  });

  it("widens the editorial classification only under REPO_POLICY", () => {
    const byKind = post({ type: "essay", content_kind: "research" });
    expect(requiresEditorialPublication(byKind, LIVE_POLICY)).toBe(false);
    expect(requiresEditorialPublication(byKind, REPO_POLICY)).toBe(true);
  });
});
