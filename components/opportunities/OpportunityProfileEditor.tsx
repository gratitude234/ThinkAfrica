"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TagInput from "@/components/ui/TagInput";
import { trackActivationEvent } from "@/lib/activationEvents";
import { OPPORTUNITY_LABELS, OPPORTUNITY_TYPES } from "@/lib/opportunities";
import { createClient } from "@/lib/supabase/client";

interface TalentProfile {
  id: string;
  open_to_opportunities: boolean;
  opportunity_types: string[] | null;
  cv_url: string | null;
  linkedin_url: string | null;
  skills: string[] | null;
  visibility: string;
}

export default function OpportunityProfileEditor({
  userId,
  talentProfile,
  source,
  mobileCollapsed = false,
}: {
  userId: string;
  talentProfile: TalentProfile | null;
  source: "dashboard" | "profile" | "opportunities";
  mobileCollapsed?: boolean;
}) {
  const router = useRouter();
  const [mobileExpanded, setMobileExpanded] = useState(!mobileCollapsed);
  const [form, setForm] = useState({
    open_to_opportunities: talentProfile?.open_to_opportunities ?? false,
    opportunity_types: talentProfile?.opportunity_types ?? [],
    cv_url: talentProfile?.cv_url ?? "",
    linkedin_url: talentProfile?.linkedin_url ?? "",
    skills: talentProfile?.skills ?? [],
    visibility: talentProfile?.visibility ?? "public",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackActivationEvent({
      event: "opportunity_profile_viewed",
      metadata: { source, hasProfile: Boolean(talentProfile?.id) },
    });
  }, [source, talentProfile?.id]);

  const toggleType = (type: string) => {
    setForm((current) => ({
      ...current,
      opportunity_types: current.opportunity_types.includes(type)
        ? current.opportunity_types.filter((item) => item !== type)
        : [...current.opportunity_types, type],
    }));
  };

  const saveProfile = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    const payload = {
      user_id: userId,
      open_to_opportunities: form.open_to_opportunities,
      opportunity_types: form.opportunity_types,
      cv_url: form.cv_url.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      skills: form.skills,
      visibility: form.visibility,
      updated_at: new Date().toISOString(),
    };

    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("talent_profiles")
      .upsert(payload, { onConflict: "user_id" });

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    trackActivationEvent({
      event: "opportunity_profile_updated",
      metadata: {
        source,
        open: form.open_to_opportunities,
        visibility: form.visibility,
        skillCount: form.skills.length,
        typeCount: form.opportunity_types.length,
      },
    });
    setSaved(true);
    router.refresh();
  };

  return (
    <section
      id="opportunity-profile"
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Opportunity profile
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">
            Set up your opportunity signal
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">
            Choose the work you want, add scan-friendly skills, and control who
            can find your profile.
          </p>
        </div>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      {mobileCollapsed ? (
        <button
          type="button"
          onClick={() => setMobileExpanded((current) => !current)}
          className="mb-4 flex w-full items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-left md:hidden"
          aria-expanded={mobileExpanded}
          aria-controls="opportunity-profile-fields"
        >
          <span>
            <span className="block text-sm font-semibold text-emerald-950">
              {mobileExpanded ? "Hide setup fields" : "Edit opportunity profile"}
            </span>
            <span className="mt-0.5 block text-xs text-emerald-800">
              Add skills, links, visibility, and opportunity types.
            </span>
          </span>
          <span className="text-lg font-semibold text-emerald-brand">
            {mobileExpanded ? "-" : "+"}
          </span>
        </button>
      ) : null}

      <div
        id="opportunity-profile-fields"
        className={`space-y-5 ${mobileCollapsed && !mobileExpanded ? "hidden md:block" : ""}`}
      >
        <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-canvas px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Step 1
            </p>
            <p className="mt-0.5 text-sm font-medium text-gray-900">
              Open to opportunities
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Turn this on when your profile is ready to receive inquiries.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setForm((current) => ({
                ...current,
                open_to_opportunities: !current.open_to_opportunities,
              }))
            }
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              form.open_to_opportunities ? "bg-emerald-brand" : "bg-gray-200"
            }`}
            aria-pressed={form.open_to_opportunities}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                form.open_to_opportunities ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Step 2
          </p>
          <p className="mb-2 mt-0.5 text-sm font-medium text-gray-700">
            Opportunity types
          </p>
          <div className="flex flex-wrap gap-2">
            {OPPORTUNITY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  form.opportunity_types.includes(type)
                    ? "border-emerald-brand bg-emerald-brand text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-emerald-brand"
                }`}
              >
                {OPPORTUNITY_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Step 3
          </p>
          <TagInput
            label="Skills"
            value={form.skills}
            onChange={(skills) => setForm((current) => ({ ...current, skills }))}
            placeholder="Add a skill"
            helperText="Add 2-8 practical skills partners can scan quickly."
            maxTags={8}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              CV URL
            </label>
            <input
              type="url"
              value={form.cv_url}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  cv_url: event.target.value,
                }))
              }
              placeholder="https://..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              LinkedIn URL
            </label>
            <input
              type="url"
              value={form.linkedin_url}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  linkedin_url: event.target.value,
                }))
              }
              placeholder="https://linkedin.com/in/..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Step 4
          </p>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Visibility
          </label>
          <select
            value={form.visibility}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                visibility: event.target.value,
              }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand sm:max-w-xs"
          >
            <option value="public">Public</option>
            <option value="partners_only">Signed-in members</option>
            <option value="private">Private</option>
          </select>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              trackActivationEvent({
                event: "opportunity_profile_setup_cta_clicked",
                metadata: {
                  source,
                  action: "save_opportunity_profile",
                },
              });
              void saveProfile();
            }}
            disabled={saving}
            className="rounded-lg bg-emerald-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save opportunity profile"}
          </button>
          <p className="text-xs text-gray-400">
            Public profiles appear in opportunity discovery. Signed-in members
            keeps discovery inside ThinkAfrica.
          </p>
        </div>
      </div>
    </section>
  );
}
