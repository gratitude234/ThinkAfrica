import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Set up your profile | Indegenius" },
  description: "Set up your Indegenius profile: a name, a username and the topics you want to read.",
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
