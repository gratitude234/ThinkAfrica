"use client";

import { useEffect, useState } from "react";

export default function AboutSectionIndex({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      const first = sections.find(section => visible.has(section.id));
      if (first) setActive(first.id);
    }, { rootMargin: "-170px 0px -35% 0px", threshold: 0 });
    for (const section of sections) {
      const node = document.getElementById(section.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [sections]);
  if (!sections.length) return null;
  return <nav className="profile-about-index" aria-label="About sections">{sections.map(section =>
    <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? "location" : undefined}
      className="focus-ring" onClick={event => {
        const node = document.getElementById(section.id);
        if (!node) return;
        event.preventDefault();
        node.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
        node.focus({ preventScroll: true });
        setActive(section.id);
      }}>{section.label}</a>
  )}</nav>;
}
