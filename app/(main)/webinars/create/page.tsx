"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateWebinarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    scheduled_at: "",
    tags: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login?redirectTo=/webinars/create");
      return;
    }

    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const { data, error: insertError } = await supabase
      .from("webinars")
      .insert([
        {
          host_id: user.id,
          title: form.title,
          description: form.description || null,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          tags,
          status: "scheduled",
        },
      ])
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/webinars/${data.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Host a Webinar</h1>
        <p className="text-gray-500 text-sm mt-1">
          Share your knowledge with the ThinkAfrica community
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. The Future of Tech Policy in Africa"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What will attendees learn? Who should attend?"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Scheduled Date &amp; Time <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            required
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags
          </label>
          <input
            type="text"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="e.g. Tech, Policy, Education (comma-separated)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
          <p className="text-xs text-gray-400 mt-1">Separate tags with commas</p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating..." : "Create Webinar"}
          </button>
        </div>
      </form>
    </div>
  );
}
