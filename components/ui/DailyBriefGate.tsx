"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ta_last_visit_date";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyBriefGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const today = todayString();
    const lastSeen = window.localStorage.getItem(STORAGE_KEY);
    if (lastSeen === today) {
      setVisible(false);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, today);
    setVisible(true);
  }, []);

  if (!visible) return null;

  return <>{children}</>;
}
