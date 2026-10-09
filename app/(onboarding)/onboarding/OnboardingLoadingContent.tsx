"use client";
import { useSearchParams } from "next/navigation";
import OnboardingSkeleton from "@/components/loading/OnboardingSkeleton";
export default function OnboardingLoadingContent() {
  return <OnboardingSkeleton step={useSearchParams().get("step") === "topics" ? "topics" : "profile"} />;
}
