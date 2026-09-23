import Link from "next/link";
import { formatInterestLabel } from "@/lib/profileTopics";
import { getExactCanonicalTag, normalizeTagValue } from "@/lib/tags";
import type { ProfileIdentityRecord } from "@/lib/profileViewData";

export function joinedLabel(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(date);
}

export function WriterTopics({ interests }: { interests: string[] | null }) {
  const topics = [...new Map((interests ?? []).map(value => value.trim()).filter(Boolean)
    .map(value => [value.toLowerCase(), value])).values()];
  if (!topics.length) return null;
  return <ul className="profile-topics">{topics.map(topic => {
    const canonical = getExactCanonicalTag(topic);
    const label = formatInterestLabel(topic);
    return <li key={topic}>{canonical ? <Link className="focus-ring" href={`/topics/${encodeURIComponent(normalizeTagValue(canonical))}`}>{label}</Link> : <span>{label}</span>}</li>;
  })}</ul>;
}

export function AtAGlance({ profile }: { profile: ProfileIdentityRecord }) {
  const education = [profile.field_of_study?.trim(), profile.university?.trim(), profile.graduation_year].filter(Boolean).join(" · ");
  const facts = [["Education", education], ["Location", profile.country?.trim()], ["Joined", joinedLabel(profile.created_at)]]
    .filter(([, value]) => Boolean(value));
  if (!facts.length) return null;
  return <section className="profile-section" aria-labelledby="at-a-glance">
    <h2 id="at-a-glance" className="profile-section-title">At a glance</h2>
    <dl className="profile-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}
