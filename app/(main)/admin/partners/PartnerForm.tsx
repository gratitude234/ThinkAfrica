"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PartnerForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "university",
    country: "",
    description: "",
    website_url: "",
    active: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase.from("institutional_partners").insert([form]);
    setLoading(false);
    setOpen(false);
    setForm({ name: "", type: "university", country: "", description: "", website_url: "", active: true });
    router.refresh();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors">
        + Add Partner
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
      <h3 className="font-semibold text-gray-900">New Partner</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input required type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent">
            {["university","ngo","government","thinktank","media"].map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
          <input type="text" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
          <input type="url" value={form.website_url} onChange={e => setForm({ ...form, website_url: e.target.value })}
            placeholder="https://..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading}
          className="px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
          {loading ? "Saving..." : "Save Partner"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
      </div>
    </form>
  );
}
