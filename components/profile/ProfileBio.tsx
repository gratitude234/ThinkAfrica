"use client";

import { useEffect, useId, useRef, useState } from "react";

export default function ProfileBio({ bio }: { bio: string }) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const style = getComputedStyle(node);
      const lineHeight = Number.parseFloat(style.lineHeight);
      const lines = Number.parseInt(style.getPropertyValue("--profile-bio-lines"), 10) || 3;
      setOverflows(node.scrollHeight > lineHeight * lines + 2);
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [bio]);
  return (
    <div className="profile-bio">
      <p ref={ref} id={id} className={expanded ? "" : "profile-bio-preview"}>{bio}</p>
      {overflows ? <button type="button" className="focus-ring bio-toggle" aria-expanded={expanded}
        aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? "Less" : "More"}</button> : null}
    </div>
  );
}
