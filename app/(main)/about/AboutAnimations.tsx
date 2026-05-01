"use client";

import { useEffect } from "react";

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function animateStat(element: HTMLElement) {
  const target = Number(element.dataset.aboutStatTarget ?? 0);
  const suffix = element.dataset.aboutStatSuffix ?? "";
  const duration = 950;
  const startedAt = performance.now();
  let animationFrame = 0;

  element.textContent = `0${suffix}`;

  function tick(now: number) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const value = Math.round(target * easeOutCubic(progress));
    element.textContent = `${value.toLocaleString()}${suffix}`;

    if (progress < 1) {
      animationFrame = requestAnimationFrame(tick);
      return;
    }

    element.classList.add("about-stat-counted");
  }

  animationFrame = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(animationFrame);
}

export default function AboutAnimations() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".about-page");
    if (!root) return;

    const revealElements = Array.from(
      root.querySelectorAll<HTMLElement>("[data-about-reveal]")
    );
    const statElements = Array.from(
      root.querySelectorAll<HTMLElement>("[data-about-stat-target]")
    );

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    root.classList.add("about-animations-ready");
    revealElements.forEach((element) => {
      const delay = Number(element.dataset.aboutDelay ?? 0);
      if (Number.isFinite(delay) && delay > 0) {
        element.style.setProperty("--about-delay", `${delay * 90}ms`);
      }
    });

    if (prefersReducedMotion) {
      revealElements.forEach((element) => {
        element.classList.add("about-visible");
      });
      return;
    }

    const countedStats = new WeakSet<HTMLElement>();
    const cancelStatAnimations: Array<() => void> = [];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const element = entry.target as HTMLElement;
          element.classList.add("about-visible");

          if (
            element.dataset.aboutStatTarget &&
            !countedStats.has(element)
          ) {
            countedStats.add(element);
            cancelStatAnimations.push(animateStat(element));
          }

          observer.unobserve(element);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.18 }
    );

    revealElements.forEach((element) => observer.observe(element));
    statElements.forEach((element) => {
      if (!revealElements.includes(element)) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
      cancelStatAnimations.forEach((cancel) => cancel());
    };
  }, []);

  return null;
}
