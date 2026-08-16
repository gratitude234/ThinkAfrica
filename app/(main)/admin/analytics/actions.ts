"use server";

import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";
import { logEmailResult, sendUserEmail } from "@/lib/email";
import { isProfileComplete } from "@/lib/activation";

type ReminderProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  profile_type: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  interests: string[] | null;
  onboarding_completed: boolean | null;
};

function needsProfileReminder(profile: ReminderProfileRow) {
  return (
    profile.onboarding_completed !== true ||
    !isProfileComplete(profile)
  );
}

export async function sendProfileCompletionReminders() {
  try {
    const { admin, context } = await createAdminActionClient("analytics.view");
    const { data, error } = await admin
      .from("profiles")
      .select(
        "id, full_name, username, profile_type, country, university, field_of_study, interests, onboarding_completed"
      )
      .limit(10000);

    if (error) {
      return {
        error: error.message,
        sent: 0,
        skipped: 0,
        failed: 0,
        total: 0,
      };
    }

    const targets = ((data ?? []) as ReminderProfileRow[]).filter(needsProfileReminder);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const reminderKey = new Date().toISOString().slice(0, 10);

    for (const profile of targets) {
      const result = await sendUserEmail({
        recipientId: profile.id,
        subject: "Finish setting up your Indegenius profile",
        preview: "Complete your profile and begin building your Intellectual Record.",
        title: "Build your intellectual identity.",
        intro:
          "Your profile is almost ready. Add the missing details, then publish or respond to begin an evidence-backed record of what you think and contribute.",
        ctaLabel: "Start your Intellectual Record",
        ctaPath: "/onboarding",
        preferenceKey: "email_profile_reminders",
        idempotencyKey: `profile-reminder:${reminderKey}:${profile.id}`,
      });

      logEmailResult(`profile_reminder:${profile.id}`, result);
      if ("ok" in result && result.ok) sent += 1;
      else if ("skipped" in result) skipped += 1;
      else failed += 1;
    }

    await recordAdminAuditEvent({
      admin,
      context,
      action: "profile_completion_reminders.sent",
      targetTable: "profiles",
      targetId: null,
      metadata: {
        total: targets.length,
        sent,
        skipped,
        failed,
        source: "admin_analytics",
      },
    });

    return {
      error: null,
      sent,
      skipped,
      failed,
      total: targets.length,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to send profile completion reminders.",
      sent: 0,
      skipped: 0,
      failed: 0,
      total: 0,
    };
  }
}
