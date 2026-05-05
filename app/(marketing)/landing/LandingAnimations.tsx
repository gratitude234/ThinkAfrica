"use client";

import { useEffect } from "react";

export default function LandingAnimations() {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".landing-page");
    const heroEls = document.querySelectorAll<HTMLElement>(".hero-animate");
    const compactEls = document.querySelectorAll<HTMLElement>(".hero-compact");
    const revealEls = document.querySelectorAll<HTMLElement>(
      ".section-head, .stat-item, .post-card, .topic-pill, .value-item, .cta-card, .debate-card"
    );
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const observers: IntersectionObserver[] = [];

    page?.classList.add("landing-animations-ready");

    const revealEverything = () => {
      heroEls.forEach((el) => el.classList.add("go"));
      compactEls.forEach((el) => el.classList.add("revealed"));
      revealEls.forEach((el) => el.classList.add("revealed"));
      document.getElementById("debates-copy")?.removeAttribute("style");
      document.getElementById("debates-cards")?.removeAttribute("style");
      document.getElementById("stance-bar")?.classList.add("animated");
    };

    const onScroll = () =>
      document
        .querySelector("nav")
        ?.classList.toggle("shadow-sm", window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (prefersReducedMotion || isMobile) {
          revealEverything();
          return;
        }

        heroEls.forEach((el) => el.classList.add("go"));
        compactEls.forEach((c, i) => {
          c.style.transitionDelay = 0.42 + i * 0.1 + "s";
          c.classList.add("revealed");
        });
      })
    );

    if (prefersReducedMotion || isMobile) {
      return () => {
        window.removeEventListener("scroll", onScroll);
        page?.classList.remove("landing-animations-ready");
      };
    }

    const EASE = "cubic-bezier(0.25,0,0,1)";

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
    observers.push(revealObs);
    document
      .querySelectorAll(".section-head")
      .forEach((el) => revealObs.observe(el));

    const postGrid = document.getElementById("post-grid");
    if (postGrid) {
      const cards = postGrid.querySelectorAll<HTMLElement>(".post-card");
      cards.forEach((c, i) => {
        c.style.transitionDelay = i * 0.07 + "s";
      });
      const postObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            cards.forEach((c) => c.classList.add("revealed"));
          }
        },
        { threshold: 0.08 }
      );
      observers.push(postObserver);
      postObserver.observe(postGrid);
    }

    const valueGrid = document.getElementById("value-grid");
    if (valueGrid) {
      const valueObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            valueGrid
              .querySelectorAll(".value-item")
              .forEach((v) => v.classList.add("revealed"));
          }
        },
        { threshold: 0.1 }
      );
      observers.push(valueObserver);
      valueObserver.observe(valueGrid);
    }

    const dualCta = document.getElementById("dual-cta");
    if (dualCta) {
      const ctaObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            dualCta
              .querySelectorAll(".cta-card")
              .forEach((c) => c.classList.add("revealed"));
          }
        },
        { threshold: 0.1 }
      );
      observers.push(ctaObserver);
      ctaObserver.observe(dualCta);
    }

    function animateCount(el: HTMLElement, target: number, suffix: string) {
      const dur = 1400;
      const start = performance.now();
      function step(now: number) {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        const cur = Math.round(eased * target);
        el.textContent =
          (target >= 1000 ? cur.toLocaleString() : String(cur)) + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    const statsBar = document.getElementById("stats-bar");
    if (statsBar) {
      let done = false;
      const statsObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !done) {
            done = true;
            statsBar
              .querySelectorAll(".stat-item")
              .forEach((s) => s.classList.add("revealed"));
            setTimeout(() => {
              statsBar
                .querySelectorAll<HTMLElement>("[data-target]")
                .forEach((el, i) => {
                  const target = parseInt(el.dataset.target!, 10);
                  const suffix = el.innerHTML.includes("+") ? "+" : "";
                  el.textContent = "0" + suffix;
                  setTimeout(() => animateCount(el, target, suffix), i * 60);
                });
            }, 200);
          }
        },
        { threshold: 0.5 }
      );
      observers.push(statsObserver);
      statsObserver.observe(statsBar);
    }

    const stanceBar = document.getElementById("stance-bar");
    if (stanceBar) {
      let done = false;
      const stanceObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !done) {
            done = true;
            setTimeout(() => stanceBar.classList.add("animated"), 300);
          }
        },
        { threshold: 0.5 }
      );
      observers.push(stanceObserver);
      stanceObserver.observe(stanceBar);
    }

    const debatesCards = document.getElementById("debates-cards");
    const debatesCopy = document.getElementById("debates-copy");
    if (debatesCards && debatesCopy) {
      debatesCopy.style.cssText += `opacity:0;transform:translateX(-20px);transition:opacity 0.6s ${EASE},transform 0.6s ${EASE};`;
      debatesCards.style.cssText += `opacity:0;transform:translateX(20px);transition:opacity 0.6s ${EASE} 0.1s,transform 0.6s ${EASE} 0.1s;`;
      const debatesObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            debatesCopy.style.opacity = "1";
            debatesCopy.style.transform = "none";
            debatesCards.style.opacity = "1";
            debatesCards.style.transform = "none";
            debatesCards
              .querySelectorAll<HTMLElement>(".debate-card")
              .forEach((c, i) => {
                c.style.transitionDelay = 0.1 + i * 0.1 + "s";
                c.classList.add("revealed");
              });
          }
        },
        { threshold: 0.1 }
      );
      observers.push(debatesObserver);
      debatesObserver.observe(debatesCards);
    }

    const topicsGrid = document.getElementById("topics-grid");
    if (topicsGrid) {
      const topicsObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            topicsGrid
              .querySelectorAll<HTMLElement>(".topic-pill")
              .forEach((p, i) => {
                p.style.transitionDelay = i * 0.04 + "s";
                p.classList.add("revealed");
              });
          }
        },
        { threshold: 0.1 }
      );
      observers.push(topicsObserver);
      topicsObserver.observe(topicsGrid);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      observers.forEach((observer) => observer.disconnect());
      page?.classList.remove("landing-animations-ready");
    };
  }, []);

  return null;
}
