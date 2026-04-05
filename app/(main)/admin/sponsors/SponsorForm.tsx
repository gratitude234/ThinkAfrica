"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SponsorForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    sponsor_name: "",
    placement_type: "leaderboard",
    content: "",
    link_url: "",
    active: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase.from("sponsor_placements").insert([form]);
    setLoading(false);
    setOpen(false);
    setForm({ sponsor_name: "", placement_type: "leaderboard", content: "", link_url: "", active: true });
    router.refresh();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors">
        + Add Sponsor Placement
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
      <h3 className="font-semibold text-gray-900">New Sponsor Placement</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sponsor Name *</label>
          <input required type="text" value={form.sponsor_name} onChange={e => setForm({ ...form, sponsor_name: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Placement Page</label>
          <select value={form.placement_type} onChange={e => setForm({ ...form, placement_type: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent">
            <option value="leaderboard">Leaderboard</option>
            <option value="webinar">Webinars</option>
            <option value="policy_hub">Policy Hub</option>
            <option value="fellowship">Fellowships</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tagline / Content</label>
          <input type="text" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
            placeholder="e.g. Investing in Africa's future leaders"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Link URL</label>
          <input type="url" value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })}
            placeholder="https://..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading}
          className="px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
          {loading ? "Saving..." : "Save Placement"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
      </div>
    </form>
  );
}
