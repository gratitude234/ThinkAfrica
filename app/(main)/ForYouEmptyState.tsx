"use client";

import { useState } from "react";

const INTEREST_OPTIONS = [
  "Law",
  "Economics",
  "Tech",
  "Health",
  "Politics",
  "Environment",
  "Education",
  "Culture",
  "Research",
  "Philosophy",
];

export default function ForYouEmptyState() {
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = (interest: string) => {
    setSelected((prev) =>
      prev.includes(interest)
        ? prev.filter((item) => item !== interest)
        : [...prev, interest]
    );
  };

  const save = async () => {
    if (selected.length === 0) return;

    setSaving(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase.from("profiles").update({ interests: selected }).eq("id", user.id);
    }

    setSaved(true);
    setSaving(false);
    setTimeout(() => window.location.reload(), 800);
  };

  if (saved) {
    return (
      <div className="py-12 text-center">
        <p className="font-medium text-emerald-600">
          ✓ Interests saved — personalising your feed…
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
      <div className="mb-3 text-3xl">🎯</div>
      <h3 className="mb-1 text-lg font-semibold text-gray-900">
        Personalise your feed
      </h3>
      <p className="mb-6 text-sm text-gray-500">
        Pick the topics you care about and we&apos;ll curate posts just for you.
      </p>

      <div className="mb-6 flex flex-wrap justify-center gap-2">
        {INTEREST_OPTIONS.map((interest) => (
          <button
            key={interest}
            type="button"
            onClick={() => toggle(interest)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              selected.includes(interest)
                ? "border-emerald-brand bg-emerald-brand text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300"
            }`}
          >
            {interest}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={selected.length === 0 || saving}
        className="rounded-xl bg-emerald-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
      >
        {saving ? "Saving..." : `Save ${selected.length > 0 ? `(${selected.length}) ` : ""}interests`}
      </button>
    </div>
  );
}
