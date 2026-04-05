"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const OPPORTUNITY_TYPES = ["internship", "research", "fellowship", "job"];
const OPPORTUNITY_LABELS: Record<string, string> = {
  internship: "Internship",
  research: "Research",
  fellowship: "Fellowship",
  job: "Job",
};

interface TalentProfile {
  id: string;
  open_to_opportunities: boolean;
  opportunity_types: string[] | null;
  cv_url: string | null;
  linkedin_url: string | null;
  skills: string[] | null;
  visibility: string;
}

interface Props {
  profileId: string;
  isOwnProfile: boolean;
  talentProfile: TalentProfile | null;
  userId: string | null;
}

export default function OpportunitiesTab({ profileId, isOwnProfile, talentProfile, userId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    open_to_opportunities: talentProfile?.open_to_opportunities ?? false,
    opportunity_types: talentProfile?.opportunity_types ?? [],
    cv_url: talentProfile?.cv_url ?? "",
    linkedin_url: talentProfile?.linkedin_url ?? "",
    skills: talentProfile?.skills?.join(", ") ?? "",
    visibility: talentProfile?.visibility ?? "public",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Inquiry modal state
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquiry, setInquiry] = useState({ organization_name: "", contact_email: "", message: "" });
  const [sendingInquiry, setSendingInquiry] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);

  const toggleType = (type: string) => {
    setForm((prev) => ({
      ...prev,
      opportunity_types: prev.opportunity_types.includes(type)
        ? prev.opportunity_types.filter((t) => t !== type)
        : [...prev.opportunity_types, type],
    }));
  };

  const saveProfile = async () => {
    setSaving(true);
    const supabase = createClient();
    const skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
    const payload = {
      user_id: profileId,
      open_to_opportunities: form.open_to_opportunities,
      opportunity_types: form.opportunity_types,
      cv_url: form.cv_url || null,
      linkedin_url: form.linkedin_url || null,
      skills,
      visibility: form.visibility,
      updated_at: new Date().toISOString(),
    };

    if (talentProfile) {
      await supabase.from("talent_profiles").update(payload).eq("id", talentProfile.id);
    } else {
      await supabase.from("talent_profiles").insert([payload]);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  };

  const sendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!talentProfile) return;
    setSendingInquiry(true);
    const supabase = createClient();
    await supabase.from("talent_inquiries").insert([{
      talent_id: talentProfile.id,
      ...inquiry,
    }]);
    setSendingInquiry(false);
    setInquirySent(true);
    setShowInquiry(false);
    setInquiry({ organization_name: "", contact_email: "", message: "" });
  };

  if (isOwnProfile) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">Opportunities Settings</h2>
          {saved && <span className="text-sm text-emerald-600">Saved!</span>}
        </div>

        <div className="space-y-5">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Open to Opportunities</p>
              <p className="text-xs text-gray-500">Let organisations discover your profile</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, open_to_opportunities: !p.open_to_opportunities }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.open_to_opportunities ? "bg-emerald-brand" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow ${form.open_to_opportunities ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Opportunity types */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Opportunity Types</p>
            <div className="flex flex-wrap gap-2">
              {OPPORTUNITY_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.opportunity_types.includes(type)
                      ? "bg-emerald-brand text-white border-emerald-brand"
                      : "bg-white text-gray-600 border-gray-200 hover:border-emerald-brand"
                  }`}
                >
                  {OPPORTUNITY_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
            <input
              type="text"
              value={form.skills}
              onChange={(e) => setForm({ ...form, skills: e.target.value })}
              placeholder="e.g. Research, Policy Analysis, Python (comma-separated)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
            />
          </div>

          {/* CV & LinkedIn */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CV URL</label>
              <input
                type="url"
                value={form.cv_url}
                onChange={(e) => setForm({ ...form, cv_url: e.target.value })}
                placeholder="https://..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
              <input
                type="url"
                value={form.linkedin_url}
                onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                placeholder="https://linkedin.com/in/..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
              />
            </div>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profile Visibility</label>
            <select
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
            >
              <option value="public">Public</option>
              <option value="partners_only">Partners Only</option>
              <option value="private">Private</option>
            </select>
          </div>

          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="px-5 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    );
  }

  // Viewing another user's profile
  if (!talentProfile || !talentProfile.open_to_opportunities || talentProfile.visibility === "private") {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>This user hasn&apos;t enabled opportunity discovery.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Open to Opportunities</h2>
        {!inquirySent ? (
          <button
            onClick={() => {
              if (!userId) { router.push("/login"); return; }
              setShowInquiry(true);
            }}
            className="px-4 py-1.5 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
          >
            Send Inquiry
          </button>
        ) : (
          <span className="text-sm text-emerald-600">Inquiry sent!</span>
        )}
      </div>

      {talentProfile.opportunity_types && talentProfile.opportunity_types.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">Interested in</p>
          <div className="flex flex-wrap gap-2">
            {talentProfile.opportunity_types.map((type) => (
              <span key={type} className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                {OPPORTUNITY_LABELS[type] ?? type}
              </span>
            ))}
          </div>
        </div>
      )}

      {talentProfile.skills && talentProfile.skills.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {talentProfile.skills.map((s) => (
              <span key={s} className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{s}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 text-sm">
        {talentProfile.cv_url && (
          <a href={talentProfile.cv_url} target="_blank" rel="noopener noreferrer"
            className="text-emerald-brand hover:underline">View CV</a>
        )}
        {talentProfile.linkedin_url && (
          <a href={talentProfile.linkedin_url} target="_blank" rel="noopener noreferrer"
            className="text-emerald-brand hover:underline">LinkedIn</a>
        )}
      </div>

      {/* Inquiry modal */}
      {showInquiry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-4">Send an Inquiry</h3>
            <form onSubmit={sendInquiry} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization *</label>
                <input required type="text" value={inquiry.organization_name}
                  onChange={(e) => setInquiry({ ...inquiry, organization_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Email *</label>
                <input required type="email" value={inquiry.contact_email}
                  onChange={(e) => setInquiry({ ...inquiry, contact_email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea rows={3} value={inquiry.message}
                  onChange={(e) => setInquiry({ ...inquiry, message: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowInquiry(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 transition-colors">Cancel</button>
                <button type="submit" disabled={sendingInquiry}
                  className="px-4 py-1.5 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
                  {sendingInquiry ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
