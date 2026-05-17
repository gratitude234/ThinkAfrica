"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RecapPoller() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 8000);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
