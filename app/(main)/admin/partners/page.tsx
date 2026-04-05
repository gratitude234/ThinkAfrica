import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PartnerForm from "./PartnerForm";
import PartnerToggle from "./PartnerToggle";

export default async function AdminPartnersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return <div className="max-w-2xl mx-auto py-20 text-center text-gray-500">Access denied.</div>;
  }

  const { data: partners } = await supabase
    .from("institutional_partners")
    .select("id, name, type, country, active, website_url")
    .order("name");

  const active = (partners ?? []).filter((p) => p.active);
  const inactive = (partners ?? []).filter((p) => !p.active);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Partners</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {active.length} active · {inactive.length} inactive
          </p>
        </div>
        <PartnerForm />
      </div>

      <div className="space-y-3">
        {[...active, ...inactive].map((partner) => (
          <div key={partner.id} className={`bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4 ${!partner.active ? "opacity-60" : ""}`}>
            <div>
              <p className="font-medium text-gray-900 text-sm">{partner.name}</p>
              <p className="text-xs text-gray-400">
                {partner.type && `${partner.type.charAt(0).toUpperCase() + partner.type.slice(1)} · `}
                {partner.country}
              </p>
            </div>
            <PartnerToggle partnerId={partner.id} active={partner.active} />
          </div>
        ))}
      </div>
    </div>
  );
}
