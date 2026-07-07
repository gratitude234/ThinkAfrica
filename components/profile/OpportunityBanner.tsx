"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ContactInquiryModal from "@/components/profile/ContactInquiryModal";
import { getOpportunityShortLabel } from "@/lib/opportunities";

interface OpportunityBannerProps {
  isOwnProfile: boolean;
  userId: string | null;
  firstName: string;
  opportunityTypes: string[] | null;
  talentProfileId: string | null;
  isVisibleToViewer: boolean;
  settingsHref?: string;
}

export default function OpportunityBanner({
  isOwnProfile,
  userId,
  firstName,
  opportunityTypes,
  talentProfileId,
  isVisibleToViewer,
  settingsHref = "/settings",
}: OpportunityBannerProps) {
  const router = useRouter();
  const [showInquiry, setShowInquiry] = useState(false);

  const typeLabel = useMemo(() => {
    const labels =
      opportunityTypes?.map((type) => getOpportunityShortLabel(type)) ?? [];
    return labels.length > 0 ? labels.join(" / ") : "";
  }, [opportunityTypes]);

  if (!isVisibleToViewer) return null;

  return (
    <>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm font-medium text-emerald-900">
            Open to {typeLabel ? `${typeLabel} opportunities` : "opportunities"}
          </p>

          {isOwnProfile ? (
            <Link
              href={settingsHref}
              className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:border-emerald-400"
            >
              Edit availability
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!userId) {
                  router.push("/login");
                  return;
                }
                setShowInquiry(true);
              }}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37]"
            >
              Contact {firstName}
            </button>
          )}
        </div>
      </div>

      {talentProfileId ? (
        <ContactInquiryModal
          talentProfileId={talentProfileId}
          open={showInquiry}
          onClose={() => setShowInquiry(false)}
          source="opportunity_banner"
        />
      ) : null}
    </>
  );
}
