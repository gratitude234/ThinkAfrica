"use client";

import { useEffect, useState } from "react";

export function useResendCooldown(seconds: number) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timeoutId = setTimeout(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [remaining]);

  const start = () => setRemaining(seconds);
  const reset = () => setRemaining(0);

  return { remaining, start, reset } as const;
}
