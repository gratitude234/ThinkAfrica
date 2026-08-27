import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverDebateV15Event } from "@/lib/debateV15Delivery";
import {
  planDebateV15Reminders,
  type DebateV15ReminderCandidate,
  type DebateV15ReminderPhase,
  type PlannedDebateV15Reminder,
} from "@/lib/debateV15Reminders";
import { getCronAuthorizationError } from "@/lib/cronAuth";

/**
 * Notices V1.5 deadlines going by, which nothing else in the system does.
 *
 * V1.5 debates advance only when a moderator acts, and every other V1.5
 * notification is triggered by a user action -- so a debate whose moderator
 * went quiet used to stall silently and indefinitely. This warns debaters
 * before their deadline, tells the moderator when the room is waiting on
 * them, and tells the debaters that it is waiting on the moderator rather
 * than on them.
 */

const DEBATE_BATCH_LIMIT = 200;

const ACTIVE_PHASES: DebateV15ReminderPhase[] = [
  "recruiting",
  "opening",
  "rebuttal",
  "voting",
];

function deadlineForPhase(
  row: Record<string, unknown>,
  phase: DebateV15ReminderPhase
): string | null {
  const column =
    phase === "recruiting"
      ? "recruiting_deadline"
      : phase === "opening"
        ? "opening_deadline"
        : phase === "rebuttal"
          ? "rebuttal_deadline"
          : "voting_deadline";
  const value = row[column];
  return typeof value === "string" ? value : null;
}

function asPhase(value: unknown): DebateV15ReminderPhase | null {
  return ACTIVE_PHASES.includes(value as DebateV15ReminderPhase)
    ? (value as DebateV15ReminderPhase)
    : null;
}

export async function GET(request: NextRequest) {
  const authorizationError = getCronAuthorizationError(request);
  if (authorizationError) return authorizationError;

  const admin = createAdminClient();
  const now = Date.now();

  const { data: debates, error: debatesError } = await admin
    .from("debates")
    .select(
      "id, title, moderator_id, current_phase, recruiting_deadline, opening_deadline, rebuttal_deadline, voting_deadline"
    )
    .eq("debate_variant", "v1_5")
    .neq("status", "cancelled")
    .in("current_phase", ACTIVE_PHASES)
    .limit(DEBATE_BATCH_LIMIT);

  if (debatesError) {
    return NextResponse.json({ error: debatesError.message }, { status: 500 });
  }

  const rows = debates ?? [];
  if (!rows.length) {
    return NextResponse.json({ scanned: 0, planned: 0, sent: 0, skipped: 0 });
  }

  const debateIds = rows.map((row) => row.id as string);

  const [slotsResult, argumentsResult] = await Promise.all([
    admin
      .from("debate_slots_v1_5")
      .select("debate_id, user_id, stance, status")
      .in("debate_id", debateIds)
      .eq("status", "accepted"),
    admin
      .from("debate_arguments")
      .select("debate_id, author_id, round_number")
      .in("debate_id", debateIds),
  ]);

  if (slotsResult.error || argumentsResult.error) {
    return NextResponse.json(
      {
        error:
          slotsResult.error?.message ??
          argumentsResult.error?.message ??
          "Failed to load debate participants",
      },
      { status: 500 }
    );
  }

  let planned = 0;
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const phase = asPhase(row.current_phase);
    if (!phase) continue;

    const debateId = row.id as string;
    const acceptedSlots = (slotsResult.data ?? [])
      .filter((slot) => slot.debate_id === debateId)
      .map((slot) => ({
        userId: slot.user_id as string,
        stance: slot.stance as "for" | "against",
      }));

    // Round 2 is the rebuttal; anything else recorded is an opening. This
    // mirrors how the room itself maps stored arguments onto phases.
    const submittedAuthorIds = (argumentsResult.data ?? [])
      .filter((argument) => {
        if (argument.debate_id !== debateId) return false;
        const isRebuttal = Number(argument.round_number) === 2;
        return phase === "rebuttal" ? isRebuttal : !isRebuttal;
      })
      .map((argument) => argument.author_id as string);

    const candidate: DebateV15ReminderCandidate = {
      debateId,
      debateTitle: (row.title as string) ?? "Untitled debate",
      phase,
      deadline: deadlineForPhase(row, phase),
      moderatorId: (row.moderator_id as string | null) ?? null,
      acceptedSlots,
      submittedAuthorIds,
    };

    for (const reminder of planDebateV15Reminders(candidate, now)) {
      planned += 1;

      // Claim the reminder before sending it. The unique index makes this the
      // dedupe: a duplicate insert fails, and that recipient is skipped rather
      // than nudged again on every run for as long as the debate stays stuck.
      const { error: claimError } = await admin
        .from("debate_v1_5_reminders")
        .insert({
          debate_id: reminder.debateId,
          recipient_id: reminder.recipientId,
          kind: reminder.kind,
          phase: reminder.phase,
        });

      if (claimError) {
        skipped += 1;
        continue;
      }

      try {
        await deliverDebateV15Event(toDeliveryEvent(reminder));
        sent += 1;
      } catch (error) {
        errors.push(
          `${reminder.kind}:${reminder.debateId}: ${
            error instanceof Error ? error.message : "delivery failed"
          }`
        );
      }
    }
  }

  return NextResponse.json({
    scanned: rows.length,
    planned,
    sent,
    skipped,
    ...(errors.length ? { errors } : {}),
  });
}

function toDeliveryEvent(reminder: PlannedDebateV15Reminder) {
  // A stable key per reminder, so the email provider's own idempotency
  // agrees with the ledger above instead of minting a fresh random key.
  const eventKey = `debate-v1-5:${reminder.kind}:${reminder.debateId}:${reminder.phase}:${reminder.recipientId}`;
  const common = {
    recipientId: reminder.recipientId,
    debateId: reminder.debateId,
    debateTitle: reminder.debateTitle,
    eventKey,
  };

  if (reminder.kind === "deadline_soon") {
    return {
      ...common,
      kind: "deadline_soon" as const,
      phase: reminder.phase as "opening" | "rebuttal" | "voting",
      hoursLeft: reminder.hoursLeft ?? 0,
    };
  }

  if (reminder.kind === "deadline_missed_moderator") {
    return {
      ...common,
      kind: "deadline_missed_moderator" as const,
      phase: reminder.phase,
      missingSides: reminder.missingSides ?? [],
    };
  }

  return {
    ...common,
    kind: "deadline_missed_participant" as const,
    phase: reminder.phase,
  };
}
