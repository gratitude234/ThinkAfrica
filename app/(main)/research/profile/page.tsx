import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ResearchCollaborationStatus } from "@/lib/research";
import ResearchProfileForm from "./ResearchProfileForm";

export const metadata: Metadata = {
  title: "Research Profile",
  description: "Describe your research interests, methods, and collaboration availability.",
};

export default async function ResearchProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=%2Fresearch%2Fprofile");

  const { data } = await supabase
    .from("researcher_profiles")
    .select("headline, overview, research_interests, methods, collaboration_status, preferred_roles, orcid_url, website_url")
    .eq("user_id", user.id)
    .maybeSingle();
  const profile = data
    ? {
        ...data,
        research_interests: data.research_interests ?? [],
        methods: data.methods ?? [],
        preferred_roles: data.preferred_roles ?? [],
        collaboration_status: data.collaboration_status as ResearchCollaborationStatus,
      }
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Research identity</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-gray-950">Make your research capabilities legible.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">This complements your Intellectual Record with the questions, methods, and project roles you are equipped to take on.</p>
        {/* Same fields, same server action, same table. This page stays for
            the links that already point at it; the Command Center is where
            they sit beside the rest of the public profile. */}
        <p className="mt-4 rounded-xl border border-card-border bg-canvas px-4 py-3 text-sm leading-6 text-ink-soft">
          These fields are also in{" "}
          <Link
            href="/settings/profile#research"
            className="font-semibold text-emerald-ink hover:underline"
          >
            Manage your profile
          </Link>
          , alongside everything else a visitor sees.
        </p>
      </header>
      <ResearchProfileForm initialProfile={profile} />
    </div>
  );
}
