import { notFound } from "next/navigation";
import { isResearchEnabled } from "@/lib/featureFlags";

export default function ResearchSubmissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isResearchEnabled()) notFound();

  return children;
}
