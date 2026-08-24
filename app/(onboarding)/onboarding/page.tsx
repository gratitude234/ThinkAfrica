import OnboardingClient from "./OnboardingClient";

interface OnboardingPageProps {
  searchParams: Promise<{ step?: string }>;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const { step } = await searchParams;
  return <OnboardingClient requestedStep={step ?? null} />;
}
