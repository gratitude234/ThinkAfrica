import { describe, expect, it } from "vitest";
import {
  groupAuthorSubscriptions,
  groupTopicSubscriptions,
  classifyProviderDeliveryResult,
  isQualifiedPublicationRead,
  publicationChannelsForContent,
  publicationNotificationCopy,
  summarizePublicationFunnel,
  topicPublicationNotificationCopy,
  shouldClaimDelivery,
} from "./publicationDelivery";

describe("publication delivery policy", () => {
  it("uses in-app only for Posts and all channels for Articles and Research", () => {
    expect(publicationChannelsForContent({ content_kind: "post", type: "blog" })).toEqual([
      "in_app",
    ]);
    expect(publicationChannelsForContent({ content_kind: "article", type: "essay" })).toEqual([
      "in_app",
      "email",
      "push",
    ]);
    expect(publicationChannelsForContent({ content_kind: "research", type: "research" })).toEqual([
      "in_app",
      "email",
      "push",
    ]);
  });

  it("unions subscribers across accepted authors without duplicate recipients", () => {
    const grouped = groupAuthorSubscriptions(
      [
        { subscriber_id: "reader", author_id: "lead" },
        { subscriber_id: "reader", author_id: "coauthor" },
        { subscriber_id: "other", author_id: "coauthor" },
        { subscriber_id: "lead", author_id: "coauthor" },
      ],
      ["lead", "coauthor"]
    );

    expect([...grouped.entries()]).toEqual([
      ["reader", ["coauthor", "lead"]],
      ["other", ["coauthor"]],
    ]);
  });

  it("groups exact topic matches before the event and excludes credited authors", () => {
    const grouped = groupTopicSubscriptions(
      [
        {
          subscriber_id: "reader",
          topic_key: "climate",
          created_at: "2026-07-29T10:00:00Z",
        },
        {
          subscriber_id: "reader",
          topic_key: "energy",
          created_at: "2026-07-29T10:00:00Z",
        },
        {
          subscriber_id: "late-reader",
          topic_key: "climate",
          created_at: "2026-07-29T12:01:00Z",
        },
        {
          subscriber_id: "lead",
          topic_key: "climate",
          created_at: "2026-07-29T10:00:00Z",
        },
      ],
      ["energy", "climate"],
      ["lead", "coauthor"],
      "2026-07-29T12:00:00Z"
    );

    expect([...grouped.entries()]).toEqual([
      ["reader", ["energy", "climate"]],
    ]);
  });

  it("uses safe copy for a titleless Post", () => {
    expect(
      publicationNotificationCopy({
        authorName: "Ama",
        title: null,
        content: { content_kind: "post", type: "blog" },
      })
    ).toBe("Ama published a new Post.");
    expect(
      topicPublicationNotificationCopy({
        topicLabel: "Climate",
        authorName: "Ama",
        title: null,
        content: { content_kind: "post", type: "blog" },
      })
    ).toBe("Ama published a new Post in #Climate.");
  });

  it("reuses the short and long qualified-read thresholds", () => {
    expect(
      isQualifiedPublicationRead({
        wordCount: 600,
        activeSeconds: 15,
        scrollDepth: 50,
      })
    ).toBe(true);
    expect(
      isQualifiedPublicationRead({
        wordCount: 601,
        activeSeconds: 29,
        scrollDepth: 60,
      })
    ).toBe(false);
    expect(
      isQualifiedPublicationRead({
        wordCount: 601,
        activeSeconds: 30,
        scrollDepth: 60,
      })
    ).toBe(true);
  });

  it("terminally skips disabled preferences and absent destinations", () => {
    expect(
      classifyProviderDeliveryResult("email", {
        skipped: true,
        reason: "recipient_preference_disabled",
      })
    ).toEqual({ status: "skipped", reason: "recipient_preference_disabled" });
    expect(
      classifyProviderDeliveryResult("email", {
        skipped: true,
        reason: "recipient_has_no_email",
      })
    ).toEqual({ status: "skipped", reason: "recipient_has_no_email" });
    expect(
      classifyProviderDeliveryResult("push", {
        skipped: true,
        reason: "no_push_subscription",
      })
    ).toEqual({ status: "skipped", reason: "no_push_subscription" });
  });

  it("retries missing provider configuration and transient failures", () => {
    expect(
      classifyProviderDeliveryResult("email", {
        skipped: true,
        reason: "missing_email_configuration",
      })
    ).toEqual({ status: "failed", error: "missing_email_configuration" });
    expect(
      classifyProviderDeliveryResult("push", {
        skipped: true,
        reason: "missing_vapid_configuration",
      })
    ).toEqual({ status: "failed", error: "missing_vapid_configuration" });
    expect(
      classifyProviderDeliveryResult("email", {
        ok: false,
        error: "provider timeout",
      })
    ).toEqual({ status: "failed", error: "provider timeout" });
  });

  it("recovers expired leases but stops after five attempts", () => {
    const now = Date.parse("2026-07-29T12:00:00Z");
    expect(
      shouldClaimDelivery({
        status: "processing",
        attempts: 2,
        lockedAt: "2026-07-29T11:40:00Z",
        now,
        leaseMs: 15 * 60 * 1000,
      })
    ).toBe(true);
    expect(
      shouldClaimDelivery({
        status: "failed",
        attempts: 5,
        lockedAt: null,
        now,
        leaseMs: 15 * 60 * 1000,
      })
    ).toBe(false);
  });

  it("deduplicates the overall funnel and preserves author/topic source segments", () => {
    const summary = summarizePublicationFunnel(
      [
        {
          recipient_id: "reader-1",
          channel: "in_app",
          status: "sent",
          matched_author_ids: ["author"],
          matched_topic_keys: ["climate"],
          opened_at: "2026-01-01",
          qualified_read_at: null,
        },
        {
          recipient_id: "reader-1",
          channel: "email",
          status: "sent",
          matched_author_ids: ["author"],
          matched_topic_keys: [],
          opened_at: "2026-01-01",
          qualified_read_at: "2026-01-01",
        },
        {
          recipient_id: "reader-2",
          channel: "in_app",
          status: "sent",
          matched_author_ids: ["coauthor"],
          matched_topic_keys: ["climate"],
          opened_at: "2026-01-01",
          qualified_read_at: "2026-01-01",
        },
      ],
      "author"
    );

    expect(summary).toEqual({
      overall: {
        deliveredRecipients: 2,
        opens: 2,
        qualifiedReads: 2,
        qualifiedReadConversionRate: 100,
      },
      authorSource: {
        deliveredRecipients: 1,
        opens: 1,
        qualifiedReads: 1,
        qualifiedReadConversionRate: 100,
      },
      topicSource: {
        deliveredRecipients: 2,
        opens: 2,
        qualifiedReads: 1,
        qualifiedReadConversionRate: 50,
      },
    });
  });
});
