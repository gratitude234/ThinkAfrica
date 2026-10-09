import { Suspense } from "react";
import SettingsSkeleton from "@/components/loading/SettingsSkeleton";
import SettingsLoadingContent from "./SettingsLoadingContent";
export default function Loading() {
  return <Suspense fallback={<SettingsSkeleton />}><SettingsLoadingContent /></Suspense>;
}
