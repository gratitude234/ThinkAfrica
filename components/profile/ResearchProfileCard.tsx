import Link from "next/link";
import { formatResearchValue } from "@/lib/research";

export interface PublicResearchProfile {
  headline: string | null;
  overview: string | null;
  research_interests: string[];
  methods: string[];
  collaboration_status: string;
  preferred_roles: string[];
  orcid_url: string | null;
  website_url: string | null;
}

export interface PublicResearchProject {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  disciplines: string[];
  role: string;
  updated_at: string;
}

const COLLABORATION_COPY: Record<string, string> = {
  open: "Open to collaboration requests",
  selective: "Selective about new collaborations",
  not_open: "Not currently taking collaboration requests",
};

export default function ResearchProfileCard({
  displayName,
  profile,
  projects,
  isOwnProfile,
}: {
  displayName: string;
  profile: PublicResearchProfile | null;
  projects: PublicResearchProject[];
  isOwnProfile: boolean;
}) {
  if (!profile && projects.length === 0 && !isOwnProfile) return null;

  const activeCount = projects.filter((project) =>
    ["active", "analysis", "writing"].includes(project.status)
  ).length;
  const completedCount = projects.filter(
    (project) => project.status === "completed"
  ).length;

  return (
    <section
      aria-labelledby="research-practice-title"
      className="rounded-2xl border border-card-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Research practice
          </p>
          <h2
            id="research-practice-title"
            className="mt-1 font-display text-2xl font-semibold text-ink"
          >
            {profile?.headline ?? `${displayName}'s structured inquiry`}
          </h2>
          {profile ? (
            <p className="mt-2 text-sm font-medium text-ink-muted">
              {COLLABORATION_COPY[profile.collaboration_status] ??
                formatResearchValue(profile.collaboration_status)}
            </p>
          ) : null}
        </div>
        {isOwnProfile ? (
          <Link
            href="/research/profile"
            className="inline-flex min-h-10 items-center rounded-lg border border-card-border px-3 text-sm font-semibold text-ink-soft transition-colors hover:border-emerald-200 hover:text-emerald-800"
          >
            {profile ? "Edit research profile" : "Add research profile"}
          </Link>
        ) : null}
      </div>

      {profile?.overview ? (
        <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-ink-soft">
          {profile.overview}
        </p>
      ) : isOwnProfile ? (
        <p className="mt-4 text-sm leading-6 text-ink-muted">
          Add your questions, methods, preferred roles, and collaboration status
          so potential collaborators can assess fit.
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-3 gap-2 sm:max-w-lg sm:gap-3">
        {[
          ["Projects", projects.length],
          ["Active", activeCount],
          ["Completed", completedCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-canvas p-3">
            <dt className="text-[11px] font-medium text-ink-muted">{label}</dt>
            <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {profile?.research_interests.length || profile?.methods.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {profile.research_interests.length ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Research interests
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.research_interests.map((interest) => (
                  <span key={interest} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {profile.methods.length ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Methods
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.methods.map((method) => (
                  <span key={method} className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink-soft">
                    {method}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {profile?.preferred_roles.length ? (
        <p className="mt-4 text-sm text-ink-soft">
          <span className="font-semibold text-ink">Preferred roles:</span>{" "}
          {profile.preferred_roles.map(formatResearchValue).join(", ")}
        </p>
      ) : null}

      {projects.length ? (
        <div className="mt-6 border-t border-divider pt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Research projects</h3>
            <Link href="/research" className="text-sm font-semibold text-emerald-700">
              Explore research
            </Link>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {projects.slice(0, 4).map((project) => (
              <Link
                key={project.id}
                href={`/research/projects/${project.slug}`}
                className="rounded-xl border border-card-border p-4 transition-colors hover:border-emerald-200"
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  <span className="text-emerald-700">{formatResearchValue(project.status)}</span>
                  <span className="text-ink-muted">·</span>
                  <span className="text-ink-muted">{formatResearchValue(project.role)}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold text-ink">
                  {project.title}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-muted">
                  {project.summary}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : isOwnProfile ? (
        <div className="mt-5 border-t border-divider pt-5">
          <Link href="/research/proposals/new" className="text-sm font-semibold text-emerald-700">
            Create your first research proposal
          </Link>
        </div>
      ) : null}

      {profile?.orcid_url || profile?.website_url ? (
        <div className="mt-5 flex flex-wrap gap-4 border-t border-divider pt-4 text-sm font-semibold text-emerald-700">
          {profile.orcid_url ? <a href={profile.orcid_url} target="_blank" rel="noreferrer">ORCID</a> : null}
          {profile.website_url ? <a href={profile.website_url} target="_blank" rel="noreferrer">Research website</a> : null}
        </div>
      ) : null}
    </section>
  );
}
