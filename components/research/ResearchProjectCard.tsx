import Link from "next/link";
import { formatResearchValue } from "@/lib/research";

export interface ResearchProjectCardData {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  disciplines: string[];
  skills_needed: string[];
  target_completion_date: string | null;
  owner:
    | { username: string; full_name: string | null; university: string | null }
    | null;
  activeMemberCount: number;
}

export default function ResearchProjectCard({ project }: { project: ResearchProjectCardData }) {
  return (
    <Link
      href={`/research/projects/${project.slug}`}
      className="group block rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-emerald-200"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          {formatResearchValue(project.status)}
        </span>
        <span className="text-xs text-gray-500">
          {project.activeMemberCount} contributor{project.activeMemberCount === 1 ? "" : "s"}
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-gray-950 transition-colors group-hover:text-emerald-800">
        {project.title}
      </h3>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{project.summary}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {project.disciplines.slice(0, 3).map((discipline) => (
          <span key={discipline} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
            {discipline}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
        <span className="truncate">Led by {project.owner?.full_name ?? project.owner?.username ?? "Researcher"}</span>
        {project.target_completion_date ? <span className="shrink-0">Target {project.target_completion_date}</span> : null}
      </div>
    </Link>
  );
}
