import { notFound } from "next/navigation";
import { isResearchEnabled } from "@/lib/featureFlags";

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  if (!isResearchEnabled()) notFound();

  return children;
}
