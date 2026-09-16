"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";
import type { ProfileSettingsSection } from "@/lib/profileSettings";
import type { SectionSaveResult } from "./actions";

export type SectionStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * `profile_section_saved`, the one analytics event Edit profile records. It
 * fires after persistence answers, never on the click, and carries the section
 * and the outcome: nothing a member typed.
 */
function trackSectionSaved(
  section: ProfileSettingsSection,
  profileId: string,
  outcome: "success" | "failure"
) {
  trackActivationEvent({
    event: "profile_section_saved",
    metadata: { profileId, section, outcome },
  });
}

/**
 * The save lifecycle every Edit profile section shares, so dirty, saving,
 * saved and failed mean the same thing everywhere.
 *
 * A failure keeps the draft. The section stays dirty and holds the values the
 * member typed, because losing an edit to a network blip is worse than any
 * error message.
 */
export function useSectionSave({
  section,
  profileId,
  isDirty,
}: {
  section: ProfileSettingsSection;
  profileId: string;
  isDirty: boolean;
}) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    // Never overwrite a terminal state mid-save: typing again while a request
    // is out should not report the section as clean.
    setStatus((current) => {
      if (current === "saving") return current;
      if (isDirty) return "dirty";
      return current === "error" ? "error" : current === "saved" ? "saved" : "idle";
    });
  }, [isDirty]);

  const save = useCallback(
    async (run: () => Promise<SectionSaveResult>) => {
      // Guards a double submit from a double click or an Enter keypress
      // landing while the first request is still open.
      if (inFlight.current) return;
      inFlight.current = true;
      setStatus("saving");
      setError(null);

      try {
        const result = await run();
        if (!result.ok) {
          setError(result.error ?? "Could not save this section. Try again.");
          setStatus("error");
          trackSectionSaved(section, profileId, "failure");
          return result;
        }

        setStatus("saved");
        trackSectionSaved(section, profileId, "success");
        return result;
      } catch {
        setError("Could not save this section. Try again.");
        setStatus("error");
        trackSectionSaved(section, profileId, "failure");
        return { ok: false, error: "Could not save this section. Try again." };
      } finally {
        inFlight.current = false;
      }
    },
    [profileId, section]
  );

  return { status, error, save, saving: status === "saving" };
}

/**
 * Warns before a reload or a tab close discards unsaved section edits.
 *
 * Only for the hard exits the browser owns. In-app navigation is left alone:
 * the App Router gives no reliable cancellable hook, and a blocker that fires
 * on some navigations and not others teaches a member to distrust it.
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);
}
