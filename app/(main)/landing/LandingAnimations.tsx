"use client";

import { useEffect } from "react";

export default function LandingAnimations() {
  useEffect(() => {
    // 1. Hero entrance — stagger on load
    const heroEls = document.querySelectorAll<HTMLElement>(".hero-animate");
    heroEls.forEach((el) => { el.style.opacity = "0"; });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        heroEls.forEach((el) => el.classList.add("go"));
        const compacts = document.querySelectorAll<HTMLElement>(".hero-compact");
        compacts.forEach((c, i) => {
          c.style.transitionDelay = 0.42 + i * 0.1 + "s";
          c.classList.add("revealed");
        });
      })
    );

    // 2. Nav shadow on scroll
    const onScroll = () =>
      document.querySelector("nav")?.classList.toggle("shadow-sm", window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });

    const EASE = "cubic-bezier(0.25,0,0,1)";

    // 3. Generic scroll reveal observer
    const revealObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            revealObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll(".section-head").forEach((el) => revealObs.observe(el));

    // Post grid
    const postGrid = document.getElementById("post-grid");
    if (postGrid) {
      const cards = postGrid.querySelectorAll<HTMLElement>(".post-card");
      cards.forEach((c, i) => { c.style.transitionDelay = i * 0.07 + "s"; });
      new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) cards.forEach((c) => c.classList.add("revealed")); },
        { threshold: 0.08 }
      ).observe(postGrid);
    }

    // Value grid
    const valueGrid = document.getElementById("value-grid");
    if (valueGrid) {
      new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting)
            valueGrid.querySelectorAll(".value-item").forEach((v) => v.classList.add("revealed"));
        },
        { threshold: 0.1 }
      ).observe(valueGrid);
    }

    // Dual CTA
    const dualCta = document.getElementById("dual-cta");
    if (dualCta) {
      new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting)
            dualCta.querySelectorAll(".cta-card").forEach((c) => c.classList.add("revealed"));
        },
        { threshold: 0.1 }
      ).observe(dualCta);
    }

    // 4. Stats counter
    function animateCount(el: HTMLElement, target: number, suffix: string) {
      const dur = 1400;
      const start = performance.now();
      function step(now: number) {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        const cur = Math.round(eased * target);
        el.textContent = (target >= 1000 ? cur.toLocaleString() : String(cur)) + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    const statsBar = document.getElementById("stats-bar");
    if (statsBar) {
      let done = false;
      new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !done) {
            done = true;
            statsBar.querySelectorAll(".stat-item").forEach((s) => s.classList.add("revealed"));
            setTimeout(() => {
              statsBar.querySelectorAll<HTMLElement>("[data-target]").forEach((el, i) => {
                const target = parseInt(el.dataset.target!, 10);
                const suffix = el.innerHTML.includes("+") ? "+" : "";
                el.textContent = "0" + suffix;
                setTimeout(() => animateCount(el, target, suffix), i * 60);
              });
            }, 200);
          }
        },
        { threshold: 0.5 }
      ).observe(statsBar);
    }

    // 5. Debate stance bar
    const stanceBar = document.getElementById("stance-bar");
    if (stanceBar) {
      let done = false;
      new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !done) {
            done = true;
            setTimeout(() => stanceBar.classList.add("animated"), 300);
          }
        },
        { threshold: 0.5 }
      ).observe(stanceBar);
    }

    // 6. Debates section slide-in
    const debatesCards = document.getElementById("debates-cards");
    const debatesCopy = document.getElementById("debates-copy");
    if (debatesCards && debatesCopy) {
      debatesCopy.style.cssText += `opacity:0;transform:translateX(-20px);transition:opacity 0.6s ${EASE},transform 0.6s ${EASE};`;
      debatesCards.style.cssText += `opacity:0;transform:translateX(20px);transition:opacity 0.6s ${EASE} 0.1s,transform 0.6s ${EASE} 0.1s;`;
      new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            debatesCopy.style.opacity = "1";
            debatesCopy.style.transform = "none";
            debatesCards.style.opacity = "1";
            debatesCards.style.transform = "none";
            debatesCards.querySelectorAll<HTMLElement>(".debate-card").forEach((c, i) => {
              c.style.transitionDelay = 0.1 + i * 0.1 + "s";
              c.classList.add("revealed");
            });
          }
        },
        { threshold: 0.1 }
      ).observe(debatesCards);
    }

    // 7. Topics stagger
    const topicsGrid = document.getElementById("topics-grid");
    if (topicsGrid) {
      new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting)
            topicsGrid.querySelectorAll<HTMLElement>(".topic-pill").forEach((p, i) => {
              p.style.transitionDelay = i * 0.04 + "s";
              p.classList.add("revealed");
            });
        },
        { threshold: 0.1 }
      ).observe(topicsGrid);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      revealObs.disconnect();
    };
  }, []);

  return null;
}
