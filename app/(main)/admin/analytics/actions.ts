"use server";

import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";
import { logEmailResult, sendUserEmail } from "@/lib/email";

type ReminderProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  interests: string[] | null;
  onboarding_completed: boolean | null;
};

function needsProfileReminder(profile: ReminderProfileRow) {
  return (
    profile.onboarding_completed !== true ||
    !profile.full_name ||
    !profile.username ||
    !profile.country ||
    !profile.university ||
    !profile.field_of_study ||
    !Array.isArray(profile.interests) ||
    profile.interests.length === 0
  );
}

export async function sendProfileCompletionReminders() {
  try {
    const { admin, context } = await createAdminActionClient("analytics.view");
    const { data, error } = await admin
      .from("profiles")
      .select(
        "id, full_name, username, country, university, field_of_study, interests, onboarding_completed"
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
        subject: "Finish setting up your ThinkAfrica profile",
        preview: "Complete your profile so readers can trust your work.",
        title: "Finish your ThinkAfrica profile",
        intro:
          "Your profile is almost ready. Add the missing details so your posts, comments, and opportunity signals carry a credible academic identity.",
        ctaLabel: "Complete profile",
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
