"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  webinarId: string;
  userId: string | null;
  initialRegistered: boolean;
  webinarStatus: string;
}

export default function WebinarRegister({
  webinarId,
  userId,
  initialRegistered,
  webinarStatus,
}: Props) {
  const router = useRouter();
  const [registered, setRegistered] = useState(initialRegistered);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!userId) {
      router.push(`/login?redirectTo=/webinars/${webinarId}`);
      return;
    }
    setLoading(true);
    const supabase = createClient();

    if (registered) {
      await supabase
        .from("webinar_attendees")
        .delete()
        .eq("user_id", userId)
        .eq("webinar_id", webinarId);
      setRegistered(false);
    } else {
      await supabase
        .from("webinar_attendees")
        .insert([{ user_id: userId, webinar_id: webinarId }]);
      setRegistered(true);
    }
    setLoading(false);
    router.refresh();
  };

  if (webinarStatus === "ended") {
    return (
      <span className="text-sm text-gray-400">This webinar has ended.</span>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
        registered
          ? "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
          : "bg-emerald-brand text-white hover:bg-emerald-600"
      }`}
    >
      {loading ? "..." : registered ? "Unregister" : "Register"}
    </button>
  );
}
