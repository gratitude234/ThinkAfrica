import Link from "next/link";
import type { ProfileSettingsModel } from "@/lib/profileSettings";
import ProfileSection from "./sections/ProfileSection";
import TopicsSection from "./sections/TopicsSection";
import VisibilitySection from "./sections/VisibilitySection";

/**
 * Edit profile: Profile, Topics and Visibility, each saving on its own.
 * Account, notification and privacy settings stay on `/settings`.
 */
export default function ProfileSettings({ model }: { model: ProfileSettingsModel }) {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            Edit profile
          </h1>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            What readers see on your profile. Account and notification settings
            are in{" "}
            <Link href="/settings" className="focus-ring font-semibold text-emerald-ink">
              Settings
            </Link>
            .
          </p>
        </div>
        <Link
          href={`/${model.username}`}
          className="focus-ring inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-card-border bg-card px-4 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          View profile
        </Link>
      </header>

      <div className="mt-6 space-y-6">
        <ProfileSection model={model} />
        <TopicsSection model={model} />
        <VisibilitySection model={model} />
      </div>
    </div>
  );
}
