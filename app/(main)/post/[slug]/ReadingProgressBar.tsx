"use client";

import { useEffect, useState } from "react";

export default function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      const el = document.documentElement;
      const scrollTop = window.scrollY || el.scrollTop || document.body.scrollTop;
      const scrollHeight = el.scrollHeight - window.innerHeight;
      setProgress(scrollHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100)) : 0);
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="publication-reading-progress fixed left-0 right-0 z-40 h-0.5 bg-[#EFEBE2] transition-[top] duration-200"
    >
      <div
        className="h-full bg-emerald-brand transition-[width] duration-75"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
