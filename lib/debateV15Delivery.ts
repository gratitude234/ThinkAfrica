import "server-only";

import { randomUUID } from "node:crypto";
import {
  escapeHtml,
  logEmailResult,
  sendUserEmail,
} from "@/lib/email";
import { logPushResult, sendPushNotification } from "@/lib/push";

type DebateV15Stance = "for" | "against";
type DebateV15Response = "accepted" | "declined";
type DebateV15OpenedPhase = "opening" | "rebuttal" | "voting";
type DebateV15Phase = "recruiting" | "opening" | "rebuttal" | "voting";

type CommonEvent = {
  recipientId: string;
  debateId: string;
  debateTitle: string;
  eventKey?: string;
};

export type DebateV15DeliveryEvent =
  | (CommonEvent & {
      kind: "invitation";
      stance: DebateV15Stance;
    })
  | (CommonEvent & {
      kind: "invitation_response";
      participantName: string;
      response: DebateV15Response;
    })
  | (CommonEvent & {
      kind: "invitation_withdrawn";
      stance: DebateV15Stance;
    })
  | (CommonEvent & {
      kind: "phase_opened";
      phase: DebateV15OpenedPhase;
    })
  | (CommonEvent & {
      kind: "cancelled";
      reason: string;
    })
  // The three below are time-driven rather than action-driven. Every other
  // event here fires because a person clicked something; without these,
  // nothing in a V1.5 debate ever notices a deadline going by, and a debate
  // whose moderator has gone quiet stalls silently for everyone in it.
  | (CommonEvent & {
      kind: "deadline_soon";
      phase: DebateV15OpenedPhase;
      hoursLeft: number;
    })
  | (CommonEvent & {
      kind: "deadline_missed_moderator";
      phase: DebateV15Phase;
      missingSides: DebateV15Stance[];
    })
  | (CommonEvent & {
      kind: "deadline_missed_participant";
      phase: DebateV15Phase;
    });

export type DebateV15DeliveryContent = {
  email: {
    subject: string;
    preview: string;
    title: string;
    intro: string;
    bodyHtml: string;
    bodyTextLines: string[];
    ctaLabel: string;
  };
  push: {
    title: string;
    body: string;
  };
};

function stanceLabel(stance: DebateV15Stance) {
  return stance.toUpperCase();
}

function plainText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function excerpt(value: string, maxLength = 180) {
  const normalized = plainText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function phaseCopy(phase: DebateV15OpenedPhase) {
  switch (phase) {
    case "opening":
      return {
        emailTitle: "Opening arguments are now active",
        intro: "The debate has started. Open the room to submit your opening argument before the deadline.",
        pushTitle: "Opening arguments are active",
        pushBody: "Your Indegenius Debate opening stage has started.",
      };
    case "rebuttal":
      return {
        emailTitle: "Rebuttals are now active",
        intro: "The rebuttal stage has started. Open the room to read the opening cases and submit your rebuttal.",
        pushTitle: "Rebuttals are active",
        pushBody: "Your Indegenius Debate rebuttal stage has started.",
      };
    case "voting":
      return {
        emailTitle: "Final community voting is open",
        intro: "The arguments are complete and community voting is now open. Open the room to follow the result.",
        pushTitle: "Final voting is open",
        pushBody: "Community voting is now open for your debate.",
      };
  }
}

function phaseNoun(phase: DebateV15Phase) {
  switch (phase) {
    case "recruiting":
      return "recruiting stage";
    case "opening":
      return "opening argument";
    case "rebuttal":
      return "rebuttal";
    case "voting":
      return "final vote";
  }
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function hoursLabel(hoursLeft: number) {
  const hours = Math.max(1, Math.round(hoursLeft));
  // The reminder window reaches past a full day, and "about 25 hours left"
  // reads like a countdown nobody thinks in. Past a day, say days.
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return days === 1 ? "1 day" : `${days} days`;
  }
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

function motionBlock(debateTitle: string) {
  const safeTitle = escapeHtml(debateTitle);
  return `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;"><strong style="color:#111827;">Motion:</strong> ${safeTitle}</p>`;
}

export function buildDebateV15DeliveryContent(
  event: DebateV15DeliveryEvent
): DebateV15DeliveryContent {
  const debateTitle = plainText(event.debateTitle);
  const motion = `Motion: ${debateTitle}`;

  switch (event.kind) {
    case "invitation": {
      const side = stanceLabel(event.stance);
      return {
        email: {
          subject: `You’re invited to a debate on Indegenius`,
          preview: `You were invited to argue ${side} in an Indegenius Debate motion.`,
          title: "Debate invitation",
          intro:
            "A moderator invited you to take part in a curated one-on-one debate. Open the room to review the schedule and accept or decline.",
          bodyHtml: `${motionBlock(debateTitle)}<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;"><strong style="color:#111827;">Your side:</strong> ${side}</p>`,
          bodyTextLines: [motion, `Your side: ${side}`],
          ctaLabel: "Review invitation",
        },
        push: {
          title: "Debate invitation",
          body: excerpt(`You’ve been invited to argue ${side}: ${debateTitle}`),
        },
      };
    }
    case "invitation_response": {
      const response = event.response === "accepted" ? "accepted" : "declined";
      const participantName = plainText(event.participantName);
      const safeName = escapeHtml(participantName);
      return {
        email: {
          subject: excerpt(
            `${participantName} ${response} your debate invitation`,
            160
          ),
          preview: `${participantName} ${response} an Indegenius Debate invitation.`,
          title: `Invitation ${response}`,
          intro: `${participantName} ${response} the invitation to join your debate.`,
          bodyHtml: `${motionBlock(debateTitle)}<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;"><strong style="color:#111827;">Debater:</strong> ${safeName}</p>`,
          bodyTextLines: [motion, `Debater: ${participantName}`],
          ctaLabel: "Open debate",
        },
        push: {
          title: `Invitation ${response}`,
          body: excerpt(`${participantName} ${response}: ${debateTitle}`),
        },
      };
    }
    case "invitation_withdrawn": {
      const side = stanceLabel(event.stance);
      return {
        email: {
          subject: "Your debate invitation was withdrawn",
          preview: `Your ${side} invitation is no longer active.`,
          title: "Debate invitation withdrawn",
          intro:
            "The moderator withdrew your invitation. You are no longer expected to participate in this debate.",
          bodyHtml: `${motionBlock(debateTitle)}<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;"><strong style="color:#111827;">Side:</strong> ${side}</p>`,
          bodyTextLines: [motion, `Side: ${side}`],
          ctaLabel: "View debate record",
        },
        push: {
          title: "Debate invitation withdrawn",
          body: excerpt(
            `Your ${side} invitation was withdrawn: ${debateTitle}`
          ),
        },
      };
    }
    case "phase_opened": {
      const copy = phaseCopy(event.phase);
      return {
        email: {
          subject: excerpt(`${copy.emailTitle}: ${debateTitle}`, 160),
          preview: copy.intro,
          title: copy.emailTitle,
          intro: copy.intro,
          bodyHtml: motionBlock(debateTitle),
          bodyTextLines: [motion],
          ctaLabel: "Open debate room",
        },
        push: {
          title: copy.pushTitle,
          body: excerpt(`${copy.pushBody} ${debateTitle}`),
        },
      };
    }
    case "cancelled": {
      const reason = plainText(event.reason);
      const safeReason = escapeHtml(reason);
      return {
        email: {
          subject: excerpt(`Debate cancelled: ${debateTitle}`, 160),
          preview: "An Indegenius Debate motion you were participating in was cancelled.",
          title: "Debate cancelled",
          intro:
            "The moderator cancelled this debate. The room remains available as an honest record of what happened.",
          bodyHtml: `${motionBlock(debateTitle)}<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;"><strong style="color:#111827;">Reason:</strong> ${safeReason}</p>`,
          bodyTextLines: [motion, `Reason: ${reason}`],
          ctaLabel: "View debate record",
        },
        push: {
          title: "Debate cancelled",
          body: excerpt(`${debateTitle} · ${reason}`),
        },
      };
    }

    case "deadline_soon": {
      const stage = phaseNoun(event.phase);
      const window = hoursLabel(event.hoursLeft);
      return {
        email: {
          subject: excerpt(`${window} left to submit your ${stage}`, 160),
          preview: `Your ${stage} is still unsubmitted with ${window} to go.`,
          title: `${window} left to submit`,
          intro: `You have not submitted your ${stage} yet. Once the deadline passes the room locks and the submission cannot be made.`,
          bodyHtml: `${motionBlock(debateTitle)}<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;"><strong style="color:#111827;">Time remaining:</strong> about ${escapeHtml(window)}</p>`,
          bodyTextLines: [motion, `Time remaining: about ${window}`],
          ctaLabel: `Submit your ${stage}`,
        },
        push: {
          title: `${window} left to submit`,
          body: excerpt(`Your ${stage} is still unsubmitted: ${debateTitle}`),
        },
      };
    }

    case "deadline_missed_moderator": {
      const stage = phaseNoun(event.phase);
      // Naming who is missing turns a vague "something needs attention" into
      // a decision the moderator can actually make without opening the room.
      const missing = event.missingSides.length
        ? event.missingSides.map(stanceLabel).join(" and ")
        : null;
      const missingLine = missing
        ? `${missing} did not submit before the deadline.`
        : "Both sides submitted before the deadline.";
      return {
        email: {
          subject: excerpt(`Your debate is waiting on you: ${debateTitle}`, 160),
          preview: `The ${stage} deadline passed and the room cannot move without you.`,
          title: "This debate is waiting for you",
          intro: `The ${stage} deadline has passed. Debates only move forward when their moderator advances them, so this room is paused until you act. You can advance it, extend the deadline, or cancel it.`,
          bodyHtml: `${motionBlock(debateTitle)}<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;"><strong style="color:#111827;">Status:</strong> ${escapeHtml(missingLine)}</p>`,
          bodyTextLines: [motion, `Status: ${missingLine}`],
          ctaLabel: "Open moderator controls",
        },
        push: {
          title: "A debate is waiting for you",
          body: excerpt(`The ${stage} deadline passed: ${debateTitle}`),
        },
      };
    }

    case "deadline_missed_participant": {
      const stage = phaseNoun(event.phase);
      return {
        email: {
          subject: excerpt(`The ${stage} deadline has passed`, 160),
          preview: `This debate is now waiting for its moderator, not for you.`,
          title: `The ${stage} deadline has passed`,
          intro: `Submissions for this stage are closed. The debate now waits for its moderator to move it forward. There is nothing further for you to do right now, and you have not missed anything you can still act on.`,
          bodyHtml: motionBlock(debateTitle),
          bodyTextLines: [motion],
          ctaLabel: "View the debate",
        },
        push: {
          title: `${capitalise(stage)} deadline passed`,
          body: excerpt(`Waiting on the moderator: ${debateTitle}`),
        },
      };
    }
  }
}

export async function deliverDebateV15Event(
  event: DebateV15DeliveryEvent
): Promise<void> {
  const content = buildDebateV15DeliveryContent(event);
  const eventKey =
    event.eventKey ??
    `debate-v1-5:${event.kind}:${event.debateId}:${event.recipientId}:${randomUUID()}`;
  const path = `/debates/${event.debateId}`;

  try {
    const [emailResult, pushResult] = await Promise.all([
      sendUserEmail({
        recipientId: event.recipientId,
        subject: content.email.subject,
        preview: content.email.preview,
        title: content.email.title,
        intro: content.email.intro,
        bodyHtml: content.email.bodyHtml,
        bodyTextLines: content.email.bodyTextLines,
        ctaLabel: content.email.ctaLabel,
        ctaPath: path,
        idempotencyKey: `${eventKey}:email`,
        preferenceKey: "email_debate_updates",
      }),
      sendPushNotification({
        recipientId: event.recipientId,
        title: content.push.title,
        body: content.push.body,
        path,
        preferenceKey: "push_debate_updates",
      }),
    ]);

    logEmailResult(eventKey, emailResult);
    logPushResult(eventKey, pushResult);
  } catch (error) {
    console.error(
      `Debate V1.5 delivery failed for ${eventKey}: ${
        error instanceof Error ? error.message : "Unknown delivery error"
      }`
    );
  }
}
