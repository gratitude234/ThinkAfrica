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
      const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
      setOverflows(node.scrollHeight > lineHeight * 3 + 2);
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [bio]);
  return (
    <div className="profile-bio">
      <p ref={ref} id={id} className={expanded ? "" : "line-clamp-3"}>{bio}</p>
      {overflows ? <button type="button" className="focus-ring bio-toggle" aria-expanded={expanded}
        aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? "Less" : "More"}</button> : null}
    </div>
  );
}
