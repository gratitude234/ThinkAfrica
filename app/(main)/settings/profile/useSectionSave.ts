"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SectionSaveResult } from "./actions";
import type { ProfileSectionKey } from "@/lib/profileCommandCenter";
import { trackSectionSaved } from "@/lib/profileOwnerAnalytics";

export type SectionStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * The save lifecycle every Command Center section shares.
 *
 * One hook rather than per-section state so dirty, saving, saved and failed
 * mean the same thing everywhere, and so the analytics event fires from one
 * place: after persistence returns success, never on the click.
 *
 * A failure keeps the draft. The section stays dirty and holds the values the
 * author typed, because losing an edit to a network blip is worse than any
 * error message.
 */
export function useSectionSave({
  section,
  profileId,
  isDirty,
  onSaved,
}: {
  section: ProfileSectionKey;
  profileId: string;
  isDirty: boolean;
  onSaved?: (result: SectionSaveResult) => void;
}) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    // Never overwrite a terminal state mid-save: the author typing again
    // while a request is out should not report the section as clean.
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
          trackSectionSaved({ section, profileId, outcome: "failure" });
          return result;
        }

        setStatus("saved");
        trackSectionSaved({ section, profileId, outcome: "success" });
        onSaved?.(result);
        return result;
      } catch {
        setError("Could not save this section. Try again.");
        setStatus("error");
        trackSectionSaved({ section, profileId, outcome: "failure" });
        return { ok: false, error: "Could not save this section. Try again." };
      } finally {
        inFlight.current = false;
      }
    },
    [onSaved, profileId, section]
  );

  return { status, error, save, saving: status === "saving" };
}

/**
 * Warns before a reload or a tab close discards unsaved section edits.
 *
 * Only for the hard exits the browser owns. In-app navigation is left alone:
 * Next's App Router gives no reliable cancellable hook, and a blocker that
 * fires on some navigations and not others teaches an author to distrust it.
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
