"use client";
import { useSearchParams } from "next/navigation";
import ProfileSettingsSkeleton from "@/components/loading/ProfileSettingsSkeleton";
import SettingsSkeleton from "@/components/loading/SettingsSkeleton";

export default function SettingsLoadingContent() {
  const tab = useSearchParams().get("tab");
  if (tab === "profile") return <ProfileSettingsSkeleton />;
  return <SettingsSkeleton tab={tab === "notifications" || tab === "privacy" ? tab : "account"} />;
}
