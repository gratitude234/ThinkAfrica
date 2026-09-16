"use client";

import { useState } from "react";
import type { ProfileSettingsModel } from "@/lib/profileSettings";
import { saveVisibilitySection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave } from "../useSectionSave";
import { Field, FIELD_INPUT, Toggle } from "./fields";

export default function VisibilitySection({ model }: { model: ProfileSettingsModel }) {
  const [profileVisibility, setProfileVisibility] = useState(
    model.visibility.profileVisibility
  );
  const [showInDirectory, setShowInDirectory] = useState(
    model.visibility.showInDirectory
  );
  const [saved, setSaved] = useState(model.visibility);

  const isDirty =
    profileVisibility !== saved.profileVisibility ||
    showInDirectory !== saved.showInDirectory;

  const { status, error, save } = useSectionSave({
    section: "visibility",
    profileId: model.id,
    isDirty,
  });

  return (
    <SectionShell
      section="visibility"
      status={status}
      error={error}
      onSave={() =>
        void save(async () => {
          const result = await saveVisibilitySection({ profileVisibility, showInDirectory });
          if (result.ok) setSaved({ profileVisibility, showInDirectory });
          return result;
        })
      }
    >
      {/* Says plainly what a visitor gets, rather than leaving a member to
          infer it from separate control labels. */}
      <div className="rounded-xl border border-card-border bg-canvas p-4">
        <h3 className="text-sm font-medium text-ink-soft">What visitors can see</h3>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          {profileVisibility === "public"
            ? "Anyone, signed in or not, can read your profile."
            : "Only signed-in members can read your profile. Your work stays where it is published."}{" "}
          {showInDirectory
            ? "You appear in member directory searches."
            : "You do not appear in directory searches, but your profile URL still works."}
        </p>
      </div>

      <Field label="Profile visibility">
        {(props) => (
          <select
            {...props}
            value={profileVisibility}
            onChange={(event) =>
              setProfileVisibility(event.target.value as typeof profileVisibility)
            }
            className={FIELD_INPUT}
          >
            <option value="public">Public: anyone can view your profile</option>
            <option value="members_only">Members only: signed-in users only</option>
          </select>
        )}
      </Field>

      <Toggle
        label="Show in directory"
        description="Appear in member directory searches."
        checked={showInDirectory}
        onChange={setShowInDirectory}
      />
    </SectionShell>
  );
}
