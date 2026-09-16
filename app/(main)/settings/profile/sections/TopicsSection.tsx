"use client";

import { useState } from "react";
import { INTEREST_OPTIONS } from "@/lib/interests";
import type { ProfileSettingsModel } from "@/lib/profileSettings";
import { saveTopicsSection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave, useUnsavedChangesWarning } from "../useSectionSave";
import { ChipToggle } from "./fields";

/** A simple topic picker. Topics shape the feed and appear on About. */
export default function TopicsSection({ model }: { model: ProfileSettingsModel }) {
  const [interests, setInterests] = useState<string[]>(model.interests);
  const [saved, setSaved] = useState<string[]>(model.interests);

  const isDirty = interests.join("|") !== saved.join("|");
  useUnsavedChangesWarning(isDirty);

  const { status, error, save } = useSectionSave({
    section: "topics",
    profileId: model.id,
    isDirty,
  });

  const has = (label: string) =>
    interests.some((interest) => interest.toLowerCase() === label.toLowerCase());

  const toggle = (label: string) =>
    setInterests((current) =>
      current.some((interest) => interest.toLowerCase() === label.toLowerCase())
        ? current.filter((interest) => interest.toLowerCase() !== label.toLowerCase())
        : [...current, label]
    );

  // Interests an older signup typed that are not in the list. They stay
  // selectable so a save does not silently drop them.
  const customInterests = interests.filter(
    (interest) =>
      !INTEREST_OPTIONS.some(
        (option) => option.label.toLowerCase() === interest.toLowerCase()
      )
  );

  return (
    <SectionShell
      section="topics"
      status={status}
      error={error}
      onSave={() =>
        void save(async () => {
          const result = await saveTopicsSection({ interests });
          if (result.ok) setSaved(interests);
          return result;
        })
      }
    >
      <fieldset>
        <legend className="text-sm font-medium text-ink-soft">Interested in</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map((option) => (
            <ChipToggle
              key={option.id}
              label={option.label}
              selected={has(option.label)}
              onToggle={() => toggle(option.label)}
            />
          ))}
          {customInterests.map((interest) => (
            <ChipToggle
              key={interest}
              label={interest}
              selected
              onToggle={() => toggle(interest)}
            />
          ))}
        </div>
      </fieldset>
    </SectionShell>
  );
}
