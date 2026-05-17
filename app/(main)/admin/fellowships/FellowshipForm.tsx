"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
import { OPPORTUNITY_LABELS, OPPORTUNITY_TYPES } from "@/lib/opportunities";
import { createFellowship } from "./actions";

export default function FellowshipForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const feedback = useAdminActionFeedback<"create">();
  const [form, setForm] = useState({
    title: "",
    description: "",
    sponsor_name: "",
    amount: "",
    eligibility: "",
    deadline: "",
    application_url: "",
    opportunity_type: "fellowship",
    skills: "",
    location: "",
    featured: false,
    status: "open",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    feedback.startAction("create", "Saving opportunity...");
    const skills = form.skills
      .split(",")
      .map((skill) => skill.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);

    const result = await createFellowship({
      title: form.title,
      description: form.description,
      sponsor_name: form.sponsor_name,
      amount: form.amount,
      eligibility: form.eligibility,
      deadline: form.deadline,
      application_url: form.application_url,
      opportunity_type: form.opportunity_type,
      skills,
      location: form.location,
      featured: form.featured,
      status: form.status,
    });

    if (result.error) {
      feedback.failAction(result.error);
      return;
    }

    setOpen(false);
    setForm({
      title: "",
      description: "",
      sponsor_name: "",
      amount: "",
      eligibility: "",
      deadline: "",
      application_url: "",
      opportunity_type: "fellowship",
      skills: "",
      location: "",
      featured: false,
      status: "open",
    });
    feedback.finishAction("Opportunity created.");
    router.refresh();
  };

  const loading = feedback.pendingAction !== null;

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
        >
          + Add Opportunity
        </button>
        <AdminActionStatus
          status={feedback.statusMessage}
          error={feedback.error}
          toastMessage={feedback.toastMessage}
          onToastDone={feedback.clearToast}
          className="text-sm"
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
      <h3 className="font-semibold text-gray-900">New curated opportunity</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input required type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sponsor Name</label>
          <input type="text" value={form.sponsor_name} onChange={e => setForm({ ...form, sponsor_name: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select value={form.opportunity_type} onChange={e => setForm({ ...form, opportunity_type: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent">
            {OPPORTUNITY_TYPES.map((type) => (
              <option key={type} value={type}>{OPPORTUNITY_LABELS[type]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Award or pay</label>
          <input type="text" placeholder="e.g. $500 grant, paid internship" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input type="text" placeholder="Remote, Lagos, Nairobi..." value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
          <input type="datetime-local" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent">
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
          <input type="text" value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })}
            placeholder="research, policy analysis, data visualization"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
          <p className="mt-1 text-xs text-gray-400">Separate skills with commas.</p>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Eligibility</label>
          <textarea rows={2} value={form.eligibility} onChange={e => setForm({ ...form, eligibility: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Application URL</label>
          <input type="url" value={form.application_url} onChange={e => setForm({ ...form, application_url: e.target.value })}
            placeholder="https://..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={e => setForm({ ...form, featured: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-emerald-brand focus:ring-emerald-brand"
          />
          Feature on the opportunity hub
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading}
          className="px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
          {loading ? "Saving..." : "Save opportunity"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          Cancel
        </button>
      </div>
      <AdminActionStatus
        status={feedback.statusMessage}
        error={feedback.error}
        toastMessage={feedback.toastMessage}
        onToastDone={feedback.clearToast}
        className="text-sm"
      />
    </form>
  );
}
