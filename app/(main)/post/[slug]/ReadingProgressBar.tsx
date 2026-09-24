"use client";

import { useEffect, useState } from "react";

export default function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const article = document.getElementById("post-article-prose");
    if (!article) return;
    let frame = 0;
    const updateProgress = () => {
      const bounds = article.getBoundingClientRect();
      const top = bounds.top + window.scrollY;
      // Completion means the end of the body has entered the viewport. Sources,
      // recommendations and an arbitrarily long discussion do not affect it.
      const end = bounds.bottom + window.scrollY - window.innerHeight;
      const start = Math.min(top, Math.max(0, end - 1));
      setProgress(Math.min(100, Math.max(0, ((window.scrollY - start) / Math.max(1, end - start)) * 100)));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateProgress);
    };
    updateProgress();
    const observer = new ResizeObserver(schedule);
    observer.observe(article);
    observer.observe(document.body);
    document.fonts?.ready.then(schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div aria-hidden="true" className="publication-reading-progress fixed left-0 right-0 z-40 h-0.5 bg-[#EFEBE2] transition-[top] duration-200 motion-reduce:transition-none">
      <div className="h-full bg-emerald-brand transition-[width] duration-75 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
    </div>
  );
}
