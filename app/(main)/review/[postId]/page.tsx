import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canReview } from "@/lib/roles";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import Badge from "@/components/ui/Badge";
import SubmitReviewForm from "../SubmitReviewForm";

interface PageProps {
  params: Promise<{ postId: string }>;
}

export default async function ReviewDetailPage({ params }: PageProps) {
  const { postId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !canReview(profile.role)) {
    redirect("/");
  }

  const { data: assignment } = await supabase
    .from("post_reviews")
    .select("id, round, recommendation")
    .eq("post_id", postId)
    .eq("reviewer_id", user.id)
    .single();

  if (!assignment || assignment.recommendation) notFound();

  const [
    { data: post },
    { data: references },
    { data: authors },
    { data: reviews },
    { data: decisions },
    { data: versions },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, title, excerpt, content, type, tags, current_round, document_path, document_original_name, document_size_bytes, profiles!posts_author_id_fkey(full_name, username, university)"
      )
      .eq("id", postId)
      .single(),
    supabase
      .from("post_references")
      .select("id, title, authors, source, year, url, doi")
      .eq("post_id", postId)
      .order("display_order", { ascending: true }),
    supabase
      .from("post_authors")
      .select(
        "user_id, display_order, corresponding_author, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name)"
      )
      .eq("post_id", postId)
      .not("accepted_at", "is", null)
      .order("display_order", { ascending: true }),
    supabase
      .from("post_reviews")
      .select(
        "id, round, recommendation, notes, submitted_at, reviewer:profiles!post_reviews_reviewer_id_fkey(username, full_name)"
      )
      .eq("post_id", postId)
      .not("recommendation", "is", null)
      .order("round", { ascending: false }),
    supabase
      .from("post_editor_decisions")
      .select(
        "round, decision, notes, created_at, editor:profiles!post_editor_decisions_editor_id_fkey(username, full_name)"
      )
      .eq("post_id", postId)
      .order("round", { ascending: false }),
    supabase
      .from("post_versions")
      .select("id, round, version_number, version_kind, title, excerpt, author_note, created_at")
      .eq("post_id", postId)
      .order("version_number", { ascending: false }),
  ]);

  if (!post) notFound();

  const sanitizedContent = sanitizePostHtml(post.content);
  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  const orderedAuthors = ((authors ?? []) as Array<Record<string, unknown>>)
    .map((authorRow) => ({
      user_id: authorRow.user_id as string,
      corresponding_author: Boolean(authorRow.corresponding_author),
      profile: Array.isArray(authorRow.profile)
        ? (authorRow.profile[0] as { username: string; full_name: string | null })
        : (authorRow.profile as { username: string; full_name: string | null } | null),
    }))
    .filter((authorRow) => authorRow.profile?.username);
  const priorRounds = Array.from(
    new Set([
      ...((reviews ?? []) as Array<{ round: number }>).map((review) => review.round),
      ...((decisions ?? []) as Array<{ round: number }>).map((decision) => decision.round),
      ...((versions ?? []) as Array<{ round: number }>).map((version) => version.round),
    ])
  )
    .filter((round) => round < assignment.round)
    .sort((left, right) => right - left);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <article className="space-y-8 rounded-2xl border border-gray-200 bg-white p-6">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge type={post.type} />
            <span className="text-xs text-gray-400">
              Round {assignment.round} review
            </span>
            <span className="text-xs text-gray-400">
              {author?.full_name ?? author?.username} · {author?.university}
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-gray-900">{post.title}</h1>
          {post.excerpt ? (
            <p className="mt-3 text-sm leading-relaxed text-gray-500">{post.excerpt}</p>
          ) : null}
        </div>

        {orderedAuthors.length > 0 ? (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Authors
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {orderedAuthors.map((authorRow) => (
                <span
                  key={authorRow.user_id}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
                >
                  {authorRow.profile?.full_name ?? authorRow.profile?.username}
                  {authorRow.corresponding_author ? " · Corresponding" : ""}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {post.type === "research" ? (
          <section className="rounded-xl border border-purple-100 bg-purple-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
              Research PDF
            </p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {(post as { document_original_name?: string | null })
                .document_original_name ?? "Uploaded research paper"}
            </p>
            {(post as { document_path?: string | null }).document_path ? (
              <a
                href={`/api/research-document/${post.id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex rounded-lg bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800"
              >
                Open PDF for review
              </a>
            ) : (
              <p className="mt-2 text-sm text-amber-700">
                No PDF is attached to this research submission.
              </p>
            )}
          </section>
        ) : (
          <div
            className="prose prose-gray max-w-none prose-a:text-emerald-brand"
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        )}

        {references && references.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold text-gray-900">References</h2>
            <ol className="mt-4 space-y-3 text-sm text-gray-600">
              {references.map((reference, index) => (
                <li key={reference.id} className="pl-8 -indent-8 leading-relaxed">
                  [{index + 1}]{" "}
                  {[reference.authors, reference.year ? `(${reference.year}).` : null, reference.title, reference.source, reference.doi ? `DOI: ${reference.doi}` : null, reference.url]
                    .filter(Boolean)
                    .join(" ")}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </article>

      <aside className="space-y-4">
        <SubmitReviewForm postId={postId} />

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Round context</h2>
          <p className="mt-1 text-sm text-gray-500">
            You are reviewing round {assignment.round}. Prior rounds are shown below for continuity.
          </p>
        </div>

        {priorRounds.map((round) => {
          const roundReviews = ((reviews ?? []) as Array<Record<string, unknown>>).filter(
            (review) => review.round === round
          );
          const roundDecision = (decisions ?? []).find((decision) => decision.round === round);
          const roundVersion = (versions ?? []).find((version) => version.round === round);

          return (
            <div key={round} className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Round {round}
              </h3>

              {roundDecision ? (
                <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Editor decision
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {roundDecision.decision.replace("_", " ")}
                  </p>
                  {roundDecision.notes ? (
                    <p className="mt-1 text-sm text-gray-600">{roundDecision.notes}</p>
                  ) : null}
                </div>
              ) : null}

              {roundReviews.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {roundReviews.map((review) => {
                    const reviewer = Array.isArray(review.reviewer)
                      ? review.reviewer[0]
                      : review.reviewer;
                    return (
                      <div
                        key={review.id as string}
                        className="rounded-lg border border-gray-100 px-3 py-3"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {review.recommendation as string}
                        </p>
                        <p className="mt-1 text-xs font-medium text-gray-700">
                          {reviewer?.full_name ?? reviewer?.username ?? "Reviewer"}
                        </p>
                        {review.notes ? (
                          <p className="mt-1 text-sm text-gray-600">{review.notes as string}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {roundVersion ? (
                <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                    Version {roundVersion.version_number}
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {roundVersion.version_kind}
                  </p>
                  {roundVersion.author_note ? (
                    <p className="mt-1 text-sm text-gray-600">{roundVersion.author_note}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </aside>
    </div>
  );
}
