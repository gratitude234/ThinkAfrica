"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function FellowshipForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    sponsor_name: "",
    amount: "",
    eligibility: "",
    deadline: "",
    application_url: "",
    status: "open",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase.from("fellowships").insert([{
      ...form,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
    }]);
    setLoading(false);
    setOpen(false);
    setForm({ title: "", description: "", sponsor_name: "", amount: "", eligibility: "", deadline: "", application_url: "", status: "open" });
    router.refresh();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
      >
        + Add New Fellowship
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
      <h3 className="font-semibold text-gray-900">New Fellowship</h3>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
          <input type="text" placeholder="e.g. $500 grant" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
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
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading}
          className="px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
          {loading ? "Saving..." : "Save Fellowship"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
