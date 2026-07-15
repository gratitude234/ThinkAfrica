"use server";

import { createClient } from "@/lib/supabase/server";
import { sendTestPushNotification, type TestPushResult } from "@/lib/push";

export async function sendCurrentDeviceTestPush(endpoint: string): Promise<TestPushResult> {
  if (!endpoint || endpoint.length > 4096) return { ok: false, code: "not_found" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_found" };

  return sendTestPushNotification(user.id, endpoint);
}
