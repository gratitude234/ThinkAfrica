"use client";

import Image from "next/image";
import { useState } from "react";

export interface TeamMember {
  name: string;
  role: string;
  image: string;
  badgeClass: string;
  shortBio: string;
  fullBio: string[];
  priority?: boolean;
}

export default function AboutTeamCard({ member }: { member: TeamMember }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <article className="overflow-hidden rounded-2xl border border-[#e5e0d8] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_10px_36px_rgba(0,0,0,0.08)]">
      <div className="relative aspect-[5/4] overflow-hidden bg-[#f4f2ee]">
        <Image
          src={member.image}
          alt={member.name}
          fill
          sizes="(max-width: 1024px) 100vw, 320px"
          className="object-cover object-top"
          priority={member.priority}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10" />
      </div>

      <div className="p-5">
        <span
          className={`inline-flex rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${member.badgeClass}`}
        >
          {member.role}
        </span>
        <h3 className="mt-3 font-display text-[19px] font-bold leading-tight text-ink">
          {member.name}
        </h3>
        <p className="mt-3 border-t border-[#e5e0d8] pt-3 text-[13px] leading-[1.75] text-ink-muted">
          {member.shortBio}
        </p>

        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 transition hover:gap-2"
        >
          {isOpen ? "Hide full bio" : "Read full bio"}
          <span
            aria-hidden="true"
            className={`text-[10px] transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            v
          </span>
        </button>

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ${
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-3 pt-4">
              {member.fullBio.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-[13px] leading-[1.75] text-ink-muted"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
