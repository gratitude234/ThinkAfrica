"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function useSignOut() {
  const router = useRouter();
  const [isRequesting, setIsRequesting] = useState(false);
  const [isLeaving, startLeaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isSigningOut = isRequesting || isLeaving;

  const signOut = useCallback(async () => {
    if (isRequesting || isLeaving) return false;

    setError(null);
    setIsRequesting(true);

    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        setError(
          signOutError.message || "Unable to sign out. Please try again."
        );
        setIsRequesting(false);
        return false;
      }
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Unable to sign out. Please try again."
      );
      setIsRequesting(false);
      return false;
    }

    setIsRequesting(false);
    startLeaving(() => {
      router.push("/login");
      router.refresh();
    });
    return true;
  }, [isLeaving, isRequesting, router]);

  return { signOut, isSigningOut, error };
}
