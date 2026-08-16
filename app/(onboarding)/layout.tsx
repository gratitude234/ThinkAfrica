import type { Metadata } from "next";
import { BRAND_PROMISE, BRAND_SEO_DESCRIPTION } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: `Start Your Intellectual Record | Indegenius` },
  description: `${BRAND_PROMISE} ${BRAND_SEO_DESCRIPTION}`,
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
