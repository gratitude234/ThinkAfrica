import { createClient } from "@/lib/supabase/server";
import PartnerContactForm from "./PartnerContactForm";

const TYPE_STYLES: Record<string, string> = {
  university: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ngo: "bg-amber-50 text-amber-700 border-amber-200",
  government: "bg-purple-50 text-purple-700 border-purple-200",
  thinktank: "bg-gray-100 text-gray-700 border-gray-200",
  media: "bg-blue-50 text-blue-700 border-blue-200",
};

const TYPE_LABELS: Record<string, string> = {
  university: "University",
  ngo: "NGO",
  government: "Government",
  thinktank: "Think Tank",
  media: "Media",
};

export default async function PartnersPage() {
  const supabase = await createClient();

  const { data: partners } = await supabase
    .from("institutional_partners")
    .select("id, name, type, country, description, website_url")
    .eq("active", true)
    .order("name");

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Institutional Partners</h1>
        <p className="text-gray-500 text-lg max-w-2xl mx-auto">
          Institutions That Believe in African Student Scholarship
        </p>
      </div>

      {/* Partners grid */}
      {(partners ?? []).length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>No partners listed yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {(partners ?? []).map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm flex-shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                {p.type && (
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      TYPE_STYLES[p.type] ?? "bg-gray-100 text-gray-600 border-gray-200"
                    }`}
                  >
                    {TYPE_LABELS[p.type] ?? p.type}
                  </span>
                )}
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">{p.name}</h3>
              {p.country && (
                <p className="text-xs text-gray-400 mb-2">{p.country}</p>
              )}
              {p.description && (
                <p className="text-xs text-gray-500 leading-relaxed mb-3 flex-1 line-clamp-3">
                  {p.description}
                </p>
              )}
              {p.website_url && (
                <a
                  href={p.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-brand hover:underline mt-auto"
                >
                  Visit website →
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Become a partner */}
      <div className="bg-gray-50 rounded-2xl p-8">
        <div className="max-w-xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
            Become a Partner
          </h2>
          <p className="text-gray-500 text-sm text-center mb-6">
            Join the growing network of institutions supporting African student scholarship.
          </p>
          <PartnerContactForm />
        </div>
      </div>
    </div>
  );
}
