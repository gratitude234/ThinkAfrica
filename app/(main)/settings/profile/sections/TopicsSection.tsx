"use client";

import Link from "next/link";
import { INTEREST_OPTIONS } from "@/lib/interests";
import type { ProfileCommandCenterModel } from "@/lib/profileCommandCenter";
import { buildProfileRecordHref } from "@/lib/profileRecord";
import { saveTopicsSection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave } from "../useSectionSave";
import type { CommandCenterDraft } from "../ProfileCommandCenter";
import { ChipToggle } from "./fields";

/**
 * Interests are editable. Demonstrated topics are not, and this section says
 * why rather than leaving an author hunting for the control that would let
 * them add one.
 */
export default function TopicsSection({
  model,
  draft,
  setDraft,
  onSaved,
}: {
  model: ProfileCommandCenterModel;
  draft: CommandCenterDraft;
  setDraft: (update: (current: CommandCenterDraft) => CommandCenterDraft) => void;
  onSaved: (patch: Partial<CommandCenterDraft>) => void;
}) {
  const isDirty =
    draft.interests.join("|") !== model.topics.interests.join("|");

  const { status, error, save } = useSectionSave({
    section: "topics",
    profileId: model.identity.id,
    isDirty,
  });

  const toggle = (label: string) =>
    setDraft((current) => ({
      ...current,
      interests: current.interests.some(
        (interest) => interest.toLowerCase() === label.toLowerCase()
      )
        ? current.interests.filter(
            (interest) => interest.toLowerCase() !== label.toLowerCase()
          )
        : [...current.interests, label],
    }));

  // Interests the author holds that are not in the curated list, usually from
  // an older signup. They stay selectable so a save does not silently drop them.
  const customInterests = draft.interests.filter(
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
          const result = await saveTopicsSection({ interests: draft.interests });
          if (result.ok) onSaved({ interests: draft.interests });
          return result;
        })
      }
    >
      <fieldset>
        <legend className="text-sm font-medium text-ink-soft">Interested in</legend>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          What you want to read and write about. These shape your feed and your
          recommendations. Visitors see them as interests, never as evidence.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map((option) => (
            <ChipToggle
              key={option.id}
              label={option.label}
              selected={draft.interests.some(
                (interest) => interest.toLowerCase() === option.label.toLowerCase()
              )}
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

      <div className="rounded-xl border border-card-border bg-canvas p-4">
        <h3 className="text-sm font-medium text-ink-soft">Demonstrated topics</h3>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          Read from the tags on your published work, so every one of them leads a
          visitor to something you actually wrote. They cannot be added here:
          that is the point of them. To change this list, tag your work
          differently when you publish.
        </p>
        {model.topics.demonstratedTopics.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {model.topics.demonstratedTopics.map((topic) => (
              <li key={topic.key}>
                <Link
                  href={buildProfileRecordHref({
                    username: model.identity.username,
                    topic: topic.key,
                  })}
                  className="tap-target focus-ring inline-flex items-center gap-1.5 rounded-full bg-green-tint px-3 py-1.5 text-xs font-medium text-emerald-brand hover:opacity-80"
                >
                  {topic.label}
                  <span className="tabular-nums text-emerald-brand/70">
                    {topic.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            {model.recordSummary.publicationCount > 0
              ? "Your published work carries no topic tags yet. Add them when you publish or edit a piece."
              : "These appear once you publish work with topic tags."}
          </p>
        )}
      </div>
    </SectionShell>
  );
}
