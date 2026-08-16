import type { Metadata } from "next";
import { BRAND_PROMISE, BRAND_SEO_DESCRIPTION } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: `${BRAND_PROMISE} | Indegenius` },
  description: BRAND_SEO_DESCRIPTION,
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
