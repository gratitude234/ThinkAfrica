import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResearchProposalForm from "./ResearchProposalForm";

export const metadata: Metadata = {
  title: "Create a Research Proposal",
  description: "Frame a structured research inquiry and recruit the collaborators needed to carry it forward.",
};

export default async function NewResearchProposalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=%2Fresearch%2Fproposals%2Fnew");

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Research proposal</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-gray-950">Turn a question into a workable inquiry.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">Define what you want to learn, how the work could be done, and which capabilities would make the project stronger.</p>
      </header>
      <ResearchProposalForm />
    </div>
  );
}
