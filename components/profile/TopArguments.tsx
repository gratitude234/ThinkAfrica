import Link from "next/link";
import Pill from "@/components/ui/Pill";
import { generateExcerpt } from "@/lib/utils";

interface TopArgument {
  id: string;
  content: string;
  stance: string | null;
  upvotes: number | null;
  round_number: number | null;
  debate_id: string;
  debates: {
    id: string;
    title: string;
    status?: string | null;
  } | null;
}

interface TopArgumentsProps {
  argumentsList: TopArgument[];
}

export default function TopArguments({ argumentsList }: TopArgumentsProps) {
  if (argumentsList.length === 0) return null;

  return (
    <section className="min-w-0 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Top Arguments</h2>
        <p className="mt-1 text-sm text-gray-500">
          The strongest debate contributions from this profile.
        </p>
      </div>

      <div className="space-y-4">
        {argumentsList.map((argument) => {
          const debate = Array.isArray(argument.debates)
            ? argument.debates[0]
            : argument.debates;
          if (!debate) return null;

          const stanceLabel =
            argument.stance === "against" ? "Arguing Against" : "Arguing For";

          return (
            <article
              key={argument.id}
              className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/debates/${argument.debate_id}`}
                    className="text-base font-semibold text-gray-900 transition-colors hover:text-emerald-brand"
                  >
                    {debate.title}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <Pill variant="purple">{stanceLabel}</Pill>
                    {argument.round_number ? (
                      <span>Round {argument.round_number}</span>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium text-gray-500">
                  {(argument.upvotes ?? 0).toLocaleString()} upvotes
                </span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-gray-600">
                {generateExcerpt(argument.content ?? "", 180)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
