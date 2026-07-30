/**
 * "Where am I, and what is mine to do?" — resolved for the person actually
 * looking at the room.
 *
 * A V1.5 room shows the same five stages to a moderator, a debater and a
 * passing reader, but only one of them has anything to do at any moment. Until
 * now the room stated its stage and left each viewer to work out whether that
 * stage concerned them, which is the single thing people found hardest about
 * it.
 *
 * Pure and separate from the component so the wording for every
 * role-by-stage combination can be pinned down in tests rather than read off a
 * rendered page.
 */

export type DebateV15Role =
  | "moderator"
  | "debater"
  | "invitee"
  | "reader"
  | "guest";

export interface DebateV15Guidance {
  /**
   * `action` = this viewer is the one holding the room up.
   * `warning` = a deadline has gone by and someone must decide what happens.
   * `waiting` = nothing is required of this viewer right now.
   */
  tone: "action" | "warning" | "waiting";
  heading: string;
  body: string;
}

export interface DebateV15GuidanceInput {
  role: DebateV15Role;
  phase: "recruiting" | "opening" | "rebuttal" | "voting" | "completed";
  deadlinePassed: boolean;
  /** Both slots hold an accepted debater. */
  bothDebatersAccepted: boolean;
  /** The viewer has already submitted for the current phase. */
  viewerHasSubmitted: boolean;
  /** Sides yet to submit this phase — drives what a moderator is told. */
  missingSides: Array<"for" | "against">;
  viewerHasVoted: boolean;
}

function sideList(sides: Array<"for" | "against">): string {
  return sides.map((side) => side.toUpperCase()).join(" and ");
}

function phaseNoun(phase: "opening" | "rebuttal"): string {
  return phase === "opening" ? "opening argument" : "rebuttal";
}

export function resolveDebateV15Guidance(
  input: DebateV15GuidanceInput
): DebateV15Guidance {
  const { role, phase, deadlinePassed, viewerHasSubmitted } = input;

  if (phase === "completed") {
    return {
      tone: "waiting",
      heading: "The verdict is in",
      body: "Voting is closed. The result below is final, and the arguments stay on the record for anyone who wants to read how it was won.",
    };
  }

  if (phase === "recruiting") {
    if (role === "moderator") {
      if (input.bothDebatersAccepted) {
        return {
          tone: "action",
          heading: "Both sides are confirmed — you can start",
          body: "Publish the schedule and open the debate whenever you are ready. Nothing moves until you do.",
        };
      }
      return {
        tone: deadlinePassed ? "warning" : "action",
        heading: deadlinePassed
          ? "Recruiting has run out of time"
          : "Confirm one debater on each side",
        body: deadlinePassed
          ? "The recruiting deadline has passed. Extend it to keep inviting, or cancel the debate so nobody is left waiting."
          : "Invite one voice to argue FOR and one to argue AGAINST. The debate cannot start until both accept.",
      };
    }
    if (role === "invitee") {
      return {
        tone: "action",
        heading: "You have been invited to debate",
        body: "Accepting commits you to one argument and one rebuttal, each before its deadline. Your side is locked once you accept.",
      };
    }
    if (role === "debater") {
      return {
        tone: "waiting",
        heading: "You are confirmed — nothing to do yet",
        body: "You will be able to write once the other side accepts and the moderator starts the debate. You will be notified.",
      };
    }
    return {
      tone: "waiting",
      heading: "This debate is still being assembled",
      body: "The moderator is confirming one debater for each side. Writing begins once both have accepted.",
    };
  }

  if (phase === "opening" || phase === "rebuttal") {
    const noun = phaseNoun(phase);

    if (role === "debater") {
      if (viewerHasSubmitted) {
        return {
          tone: "waiting",
          heading: `Your ${noun} is in`,
          body: "It is on the record and cannot be edited. The moderator moves the room on once both sides have submitted.",
        };
      }
      if (deadlinePassed) {
        return {
          tone: "warning",
          heading: `The ${noun} deadline has passed`,
          body: "Anything you had written is still saved below, but it can no longer be submitted. Ask the moderator to extend the deadline if you want it on the record.",
        };
      }
      return {
        tone: "action",
        heading: `Your turn — write your ${noun}`,
        body:
          phase === "opening"
            ? "Make your case in one submission, up to 300 words, with up to five sources. It is final once sent."
            : "Answer the case against you in one submission, up to 200 words. It is final once sent.",
      };
    }

    if (role === "moderator") {
      if (input.missingSides.length === 0) {
        return {
          tone: "action",
          heading: "Both sides have submitted — you can advance",
          body: `Move the room on when you are ready. Advancing closes ${noun}s for good and cannot be undone.`,
        };
      }
      return {
        tone: deadlinePassed ? "warning" : "waiting",
        heading: deadlinePassed
          ? `${sideList(input.missingSides)} missed the ${noun} deadline`
          : `Waiting on ${sideList(input.missingSides)}`,
        body: deadlinePassed
          ? "Extend the deadline to give them longer, or advance without them — advancing is permanent."
          : `Nothing is needed from you until both sides have submitted, or until the ${noun} deadline passes.`,
      };
    }

    return {
      tone: "waiting",
      heading:
        phase === "opening"
          ? "Read how each side opens"
          : "Read how each side answers back",
      body: "Upvote whichever arguments you find strongest. The vote that decides the debate opens after the rebuttals.",
    };
  }

  // voting
  if (role === "guest") {
    return {
      tone: "action",
      heading: "Sign in to cast your vote",
      body: "The arguments are closed and the community decides from here. Signing in lets you cast the vote that settles it.",
    };
  }
  if (role === "moderator") {
    return {
      tone: deadlinePassed ? "warning" : "waiting",
      heading: deadlinePassed
        ? "Voting has run past its deadline"
        : "Voting is open",
      body: deadlinePassed
        ? "Close the debate to publish the verdict, or extend voting if you want a larger turnout."
        : "Nothing is needed from you yet. You can close voting and publish the verdict whenever the turnout satisfies you.",
    };
  }
  if (input.viewerHasVoted) {
    return {
      tone: "waiting",
      heading: "Your vote is recorded",
      body: "The verdict is published once the moderator closes voting. Upvoting individual arguments is still open if you want to mark the strongest.",
    };
  }
  if (role === "debater") {
    return {
      tone: "action",
      heading: "Your arguments are in — now you vote like everyone else",
      body: "Debating is over and the community decides. Your vote counts once, the same as any reader's.",
    };
  }
  return {
    tone: "action",
    heading: "Cast the vote that decides this debate",
    body: "Upvotes mark strong arguments but settle nothing. This is the only vote that determines the verdict, and you get one.",
  };
}
