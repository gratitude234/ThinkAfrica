"use client";

import { useEffect, useState } from "react";

function getRemainingLabel(endsAt: string) {
  const diffMs = new Date(endsAt).getTime() - Date.now();

  if (diffMs <= 0) {
    return "Ended";
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s remaining`;
}

export default function DebateCountdown({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState(() => getRemainingLabel(endsAt));

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(getRemainingLabel(endsAt));
    }, 1000);

    return () => clearInterval(timer);
  }, [endsAt]);

  return (
    <span className="text-sm font-mono font-semibold text-amber-600">
      {remaining}
    </span>
  );
}
