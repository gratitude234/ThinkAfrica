import { Suspense } from "react";
import OnboardingSkeleton from "@/components/loading/OnboardingSkeleton";
import OnboardingLoadingContent from "./OnboardingLoadingContent";
export default function Loading() {
  return <Suspense fallback={<OnboardingSkeleton />}><OnboardingLoadingContent /></Suspense>;
}
