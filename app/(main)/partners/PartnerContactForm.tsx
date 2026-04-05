"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function PartnerContactForm() {
  const [form, setForm] = useState({
    name: "",
    organization: "",
    email: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("contact_requests")
      .insert([form]);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="text-center py-6">
        <div className="text-3xl mb-2">✓</div>
        <p className="font-semibold text-gray-900">Message sent!</p>
        <p className="text-sm text-gray-500 mt-1">
          Our partnerships team will get back to you shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your Name <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Organization <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="text"
            value={form.organization}
            onChange={(e) => setForm({ ...form, organization: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          required
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <textarea
          rows={4}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Tell us about your organization and how you'd like to partner with ThinkAfrica..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
      >
        {loading ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}
