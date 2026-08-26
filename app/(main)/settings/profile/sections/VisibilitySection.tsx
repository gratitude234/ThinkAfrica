"use client";

import { useState } from "react";
import type { ProfileCommandCenterModel } from "@/lib/profileCommandCenter";
import { saveVisibilitySection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave } from "../useSectionSave";
import { Field, FIELD_INPUT, Toggle } from "./fields";

export default function VisibilitySection({
  model,
}: {
  model: ProfileCommandCenterModel;
}) {
  const [profileVisibility, setProfileVisibility] = useState(
    model.visibility.profileVisibility
  );
  const [allowMessages, setAllowMessages] = useState(model.visibility.allowMessages);
  const [showInDirectory, setShowInDirectory] = useState(
    model.visibility.showInDirectory
  );

  const isDirty =
    profileVisibility !== model.visibility.profileVisibility ||
    allowMessages !== model.visibility.allowMessages ||
    showInDirectory !== model.visibility.showInDirectory;

  const { status, error, save } = useSectionSave({
    section: "visibility",
    profileId: model.identity.id,
    isDirty,
  });

  return (
    <SectionShell
      section="visibility"
      status={status}
      error={error}
      onSave={() =>
        void save(() =>
          saveVisibilitySection({ profileVisibility, allowMessages, showInDirectory })
        )
      }
    >
      {/* Says plainly what a visitor gets, rather than leaving an author to
          infer it from three separate control labels. */}
      <div className="rounded-xl border border-card-border bg-canvas p-4">
        <h3 className="text-sm font-medium text-ink-soft">What visitors can see</h3>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          {profileVisibility === "public"
            ? "Anyone, signed in or not, can read your profile and your Intellectual Record."
            : "Only signed-in members can read your profile. Your work stays where it is published."}{" "}
          {showInDirectory
            ? "You appear in member and alumni directory searches."
            : "You do not appear in directory searches, but your profile URL still works."}{" "}
          {allowMessages === "everyone"
            ? "Anyone can start a conversation with you."
            : allowMessages === "followers_only"
              ? "Only people you follow back can start a conversation."
              : "Nobody can start a new conversation with you."}
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

      <Field
        label="Who can start a conversation with you"
        help="This controls new conversations. Block a member to stop messages in an existing conversation."
      >
        {(props) => (
          <select
            {...props}
            value={allowMessages}
            onChange={(event) =>
              setAllowMessages(event.target.value as typeof allowMessages)
            }
            className={FIELD_INPUT}
          >
            <option value="everyone">Everyone</option>
            <option value="followers_only">Followers only</option>
            <option value="nobody">No one</option>
          </select>
        )}
      </Field>

      <Toggle
        label="Show in directory"
        description="Appear in member and alumni directory searches."
        checked={showInDirectory}
        onChange={setShowInDirectory}
      />
    </SectionShell>
  );
}
