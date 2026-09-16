import { describe, expect, it } from "vitest";

import {
  AUTHOR_EDITABLE_POST_COLUMNS,
  COMPOSABLE_POST_COLUMNS,
  canWriteToPost,
  checkComposition,
  checkContentEdit,
  checkDelete,
  checkInsert,
  checkSlugRename,
  checkTransition,
  checkWorkflowEvidence,
  findTransition,
  NEVER_AUTHOR_WRITABLE_POST_COLUMNS,
  partitionPostPatch,
  POST_TRANSITIONS,
  TRANSITION_BOOKKEEPING_COLUMNS,
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
 *
 * Phase 2I removed the editorial half of the matrix, because 20260915000007
 * removed it from the trigger: there is no self-publish refusal, no lock on an
 * accepted publication, no frozen classification window, no withdrawal, and no
 * `editor` actor.
 */

const AUTHOR = "author-1";
const STRANGER = "author-2";

const author: PostActor = { kind: "author", userId: AUTHOR };
const otherAuthor: PostActor = { kind: "author", userId: STRANGER };
const admin: PostActor = { kind: "admin", userId: "admin-1" };
const system: PostActor = { kind: "system" };

function post(overrides: Partial<PostStateSnapshot> = {}): PostStateSnapshot {
  return {
    id: "post-1",
    author_id: AUTHOR,
    status: "draft",
    content_kind: "article",
    citation_id: null,
    published_version_id: null,
    ...overrides,
  };
}

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

  it("allows admins and the system on posts they do not own", () => {
    expect(canWriteToPost(admin, post()).allowed).toBe(true);
    expect(canWriteToPost(system, post()).allowed).toBe(true);
  });

  it("never infers ownership from anything the caller sent", () => {
    // The actor id is resolved by the server. A patch naming an author_id is a
    // patch, not an identity.
    const decision = checkContentEdit(otherAuthor, post(), {
      author_id: STRANGER,
      title: "Mine now",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.refusal).toBe("not_owner");
  });
});

// ── Publishing is the author's ───────────────────────────────────────

describe("every publication is the author to make", () => {
  it("allows an author to publish their own draft", () => {
    const decision = checkTransition({
      actor: author,
      post: post(),
      nextStatus: "published",
    });
    expect(decision.allowed).toBe(true);
  });

  it("allows an author to keep editing after publication", () => {
    // The lock on an accepted publication is retired. Two published rows still
    // carry a citation_id and they are editable like any other; only the id
    // itself stays immutable, which checkWorkflowEvidence covers.
    const published = post({ status: "published", citation_id: "IND-2026-0001" });
    expect(canWriteToPost(author, published).allowed).toBe(true);
    expect(
      checkContentEdit(author, published, { title: "Corrected" }).allowed
    ).toBe(true);
  });
});

// ── Workflow evidence ────────────────────────────────────────────────

describe("workflow evidence cannot be forged", () => {
  it("refuses an author setting a citation_id", () => {
    const decision = checkWorkflowEvidence(author, post(), {
      citation_id: "IND-2026-9999",
    });
    expect(decision.allowed === false && decision.refusal).toBe(
      "citation_id_forbidden"
    );
  });

  it("refuses an author clearing a citation_id", () => {
    // Clearing is the direction that breaks /publication/[citationId] for a
    // link somebody else already published.
    const decision = checkWorkflowEvidence(
      author,
      post({ citation_id: "IND-2026-0001" }),
      { citation_id: null }
    );
    expect(decision.allowed === false && decision.refusal).toBe(
      "citation_id_forbidden"
    );
  });

  it("refuses a published_version_id in either direction", () => {
    expect(
      checkWorkflowEvidence(author, post(), {
        published_version_id: "version-1",
      }).allowed
    ).toBe(false);
    expect(
      checkWorkflowEvidence(
        author,
        post({ published_version_id: "version-1" }),
        { published_version_id: null }
      ).allowed
    ).toBe(false);
  });

  it("permits writing back the value already there", () => {
    const row = post({ citation_id: "IND-2026-0001" });
    expect(
      checkWorkflowEvidence(author, row, { citation_id: "IND-2026-0001" }).allowed
    ).toBe(true);
  });

  it("lets the system write it, which is the only thing that ever did", () => {
    expect(
      checkWorkflowEvidence(system, post(), { citation_id: "IND-2026-0002" })
        .allowed
    ).toBe(true);
  });
});

// ── Moderation locks ─────────────────────────────────────────────────

describe("a removed post is untouchable", () => {
  it("refuses the owner", () => {
    const decision = canWriteToPost(author, post({ status: "removed" }));
    expect(decision.allowed === false && decision.refusal).toBe("removed_post");
  });

  it("lets moderation reverse itself, and only through the restore", () => {
    expect(
      checkTransition({
        actor: admin,
        post: post({ status: "removed" }),
        nextStatus: "published",
      }).allowed
    ).toBe(true);
  });

  it("refuses every other transition out of removed, for everyone", () => {
    const statuses: PostStatus[] = ["draft", "pending", "rejected", "withdrawn"];
    for (const nextStatus of statuses) {
      for (const actor of [author, admin, system]) {
        expect(
          checkTransition({ actor, post: post({ status: "removed" }), nextStatus })
            .allowed,
          `${actor.kind} removed to ${nextStatus}`
        ).toBe(false);
      }
    }
  });

  it("refuses the author a restore", () => {
    const decision = checkTransition({
      actor: author,
      post: post({ status: "removed" }),
      nextStatus: "published",
    });
    expect(decision.allowed).toBe(false);
  });
});

describe("a withdrawn submission cannot be resurrected", () => {
  it("refuses the owner writing to it", () => {
    const decision = canWriteToPost(author, post({ status: "withdrawn" }));
    expect(decision.allowed === false && decision.refusal).toBe("withdrawn_post");
  });

  it("refuses withdrawn to pending, which is the resurrection", () => {
    expect(
      checkTransition({
        actor: author,
        post: post({ status: "withdrawn" }),
        nextStatus: "pending",
      }).allowed
    ).toBe(false);
  });

  it("is unreachable: nothing may move a post into withdrawn", () => {
    const from: PostStatus[] = ["draft", "pending", "pending_revision", "published"];
    for (const status of from) {
      for (const actor of [author, admin, system]) {
        expect(
          checkTransition({ actor, post: post({ status }), nextStatus: "withdrawn" })
            .allowed,
          `${actor.kind} ${status} to withdrawn`
        ).toBe(false);
      }
    }
  });
});

// ── Delete ───────────────────────────────────────────────────────────

describe("hard delete is for drafts only", () => {
  it("allows the owner to delete their draft", () => {
    expect(checkDelete(author, post()).allowed).toBe(true);
  });

  it("refuses deleting anything that is not a draft", () => {
    const statuses: PostStatus[] = [
      "published",
      "pending",
      "pending_revision",
      "rejected",
      "withdrawn",
      "removed",
    ];
    for (const status of statuses) {
      const decision = checkDelete(author, post({ status }));
      expect(decision.allowed, status).toBe(false);
      expect(decision.allowed === false && decision.refusal, status).toBe(
        "delete_non_draft"
      );
    }
  });

  it("refuses a stranger deleting a draft", () => {
    const decision = checkDelete(otherAuthor, post());
    expect(decision.allowed === false && decision.refusal).toBe("not_owner");
  });
});

// ── Column allowlists ────────────────────────────────────────────────

describe("protected columns", () => {
  it("rejects the whole mutation rather than stripping the dangerous key", () => {
    const decision = checkContentEdit(author, post(), {
      title: "Fine",
      status: "published",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.refusal).toBe("protected_field");
  });

  it("names every protected field it refused", () => {
    const { rejected } = partitionPostPatch({
      title: "Fine",
      status: "published",
      author_id: STRANGER,
      citation_id: "IND-2026-0003",
    });
    expect(rejected.protectedFields.sort()).toEqual([
      "author_id",
      "citation_id",
      "status",
    ]);
  });

  it("refuses an unknown column, because default-deny is the point", () => {
    const { rejected } = partitionPostPatch({ title: "Fine", nonsense: 1 });
    expect(rejected.unknownFields).toEqual(["nonsense"]);
  });

  it("allows an ordinary content edit", () => {
    expect(
      checkContentEdit(author, post(), { title: "A better title" }).allowed
    ).toBe(true);
  });

  it("keeps status and the evidence columns out of the author allowlist", () => {
    for (const column of ["status", "citation_id", "published_version_id"]) {
      expect(
        AUTHOR_EDITABLE_POST_COLUMNS as readonly string[],
        column
      ).not.toContain(column);
      expect(
        NEVER_AUTHOR_WRITABLE_POST_COLUMNS as readonly string[],
        column
      ).toContain(column);
    }
  });

  it("keeps the classification columns the database owns out of an ordinary edit", () => {
    // `type` and `article_format` are derived by the database now, and
    // `content_kind` is the composer to write, not an edit.
    for (const column of ["type", "article_format", "content_kind", "in_response_to"]) {
      expect(
        AUTHOR_EDITABLE_POST_COLUMNS as readonly string[],
        column
      ).not.toContain(column);
      const decision = checkContentEdit(author, post(), { [column]: "x" });
      expect(decision.allowed, column).toBe(false);
    }
  });

  it("carries no retired research column in any allowlist", () => {
    const every = [
      ...AUTHOR_EDITABLE_POST_COLUMNS,
      ...COMPOSABLE_POST_COLUMNS,
      ...TRANSITION_BOOKKEEPING_COLUMNS,
    ] as readonly string[];
    for (const gone of [
      "type",
      "article_format",
      "research_keywords",
      "document_path",
      "document_original_name",
      "document_mime_type",
      "document_size_bytes",
      "in_response_to",
      "current_round",
      "revision_due_at",
    ]) {
      expect(every, gone).not.toContain(gone);
    }
  });
});

describe("composition", () => {
  it("lets the composer write the content kind, which an edit may not", () => {
    expect(
      checkComposition(author, post(), { title: "T", content_kind: "article" })
        .allowed
    ).toBe(true);
    expect(
      checkContentEdit(author, post(), { content_kind: "article" }).allowed
    ).toBe(false);
  });

  it("refuses the composer a column outside its allowlist", () => {
    const decision = checkComposition(author, post(), { status: "published" });
    expect(decision.allowed === false && decision.refusal).toBe("protected_field");
  });

  it("refuses a composer write to a removed post", () => {
    const decision = checkComposition(author, post({ status: "removed" }), {
      title: "T",
    });
    expect(decision.allowed === false && decision.refusal).toBe("removed_post");
  });
});

// ── Insert ───────────────────────────────────────────────────────────

describe("creating a post", () => {
  it("allows an author to create their own draft", () => {
    expect(
      checkInsert(author, {
        author_id: AUTHOR,
        title: "A title",
        content_kind: "article",
        status: "draft",
      }).allowed
    ).toBe(true);
  });

  it("refuses naming somebody else as the author", () => {
    const decision = checkInsert(author, { author_id: STRANGER });
    expect(decision.allowed === false && decision.refusal).toBe("not_owner");
  });

  it("refuses a new row born carrying workflow evidence", () => {
    expect(
      checkInsert(author, { author_id: AUTHOR, citation_id: "IND-2026-0004" })
        .allowed
    ).toBe(false);
    expect(
      checkInsert(author, {
        author_id: AUTHOR,
        published_version_id: "version-1",
      }).allowed
    ).toBe(false);
  });

  it("refuses a status nothing creates", () => {
    for (const status of [
      "removed",
      "withdrawn",
      "rejected",
      "pending",
      "pending_revision",
    ]) {
      const decision = checkInsert(author, { author_id: AUTHOR, status });
      expect(decision.allowed, status).toBe(false);
    }
  });

  it("refuses an insert naming the legacy classification columns", () => {
    for (const column of ["type", "article_format", "current_round"]) {
      const decision = checkInsert(author, { author_id: AUTHOR, [column]: "essay" });
      expect(decision.allowed, column).toBe(false);
      expect(decision.allowed === false && decision.refusal, column).toBe(
        "protected_field"
      );
    }
  });
});

// ── Slug ─────────────────────────────────────────────────────────────

describe("renaming a slug", () => {
  it("accepts a usable slug", () => {
    expect(checkSlugRename(author, post(), "a-usable-slug").allowed).toBe(true);
  });

  it("refuses a slug that is not URL shaped", () => {
    for (const slug of ["", "Has Capitals", "trailing-", "a/b", "under_score"]) {
      expect(checkSlugRename(author, post(), slug).allowed, slug).toBe(false);
    }
  });

  it("refuses a rename on a removed post", () => {
    expect(
      checkSlugRename(author, post({ status: "removed" }), "fine-slug").allowed
    ).toBe(false);
  });
});

// ── The state machine ────────────────────────────────────────────────

describe("the state machine", () => {
  it("allows the transitions the product actually performs", () => {
    const allowed: Array<[PostStatus, PostStatus, PostActor]> = [
      ["draft", "draft", author],
      ["draft", "published", author],
      ["published", "published", author],
      ["published", "removed", admin],
      ["removed", "published", admin],
    ];
    for (const [from, to, actor] of allowed) {
      expect(
        checkTransition({ actor, post: post({ status: from }), nextStatus: to }),
        `${from} to ${to} as ${actor.kind}`
      ).toMatchObject({ allowed: true });
    }
  });

  it("refuses the review transitions the product no longer has", () => {
    const gone: Array<[PostStatus, PostStatus]> = [
      ["draft", "pending"],
      ["pending", "published"],
      ["pending", "pending_revision"],
      ["pending", "rejected"],
      ["pending_revision", "pending"],
      ["published", "draft"],
      ["rejected", "published"],
    ];
    for (const [from, to] of gone) {
      for (const actor of [author, admin, system]) {
        expect(
          checkTransition({ actor, post: post({ status: from }), nextStatus: to })
            .allowed,
          `${actor.kind} ${from} to ${to}`
        ).toBe(false);
      }
    }
  });

  it("refuses an author performing a moderation transition", () => {
    const decision = checkTransition({
      actor: author,
      post: post({ status: "published" }),
      nextStatus: "removed",
    });
    expect(decision.allowed === false && decision.refusal).toBe("role_required");
  });

  it("exposes the table for inspection rather than hiding it in conditionals", () => {
    expect(findTransition("draft", "published")).toBeDefined();
    expect(findTransition("draft", "pending")).toBeUndefined();
    expect(POST_TRANSITIONS.length).toBeGreaterThan(0);
  });

  it("names no editor in any transition, because there is no editor actor", () => {
    for (const rule of POST_TRANSITIONS) {
      expect(
        rule.actors as readonly string[],
        `${rule.from} to ${rule.to}`
      ).not.toContain("editor");
    }
  });

  it("lets only moderation produce or leave a removed state", () => {
    for (const rule of POST_TRANSITIONS) {
      if (rule.to === "removed" || rule.from === "removed") {
        expect(
          rule.actors as readonly string[],
          `${rule.from} to ${rule.to}`
        ).not.toContain("author");
      }
    }
  });
});
