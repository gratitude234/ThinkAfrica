import { Fragment } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import PointsTierBadge from "@/components/ui/PointsTierBadge";
import { formatDate, getPointTier, getNextTier } from "@/lib/utils";
import {
  isAuthorSubscriptionsEnabled,
  isAuthorSubscriptionsUxV2Enabled,
  isTopicSubscriptionsEnabled,
  RESEARCH_TYPE_QUERY_EXCLUSION,
} from "@/lib/featureFlags";
import {
  getAuthorPublicationFunnel,
  getAuthorSubscriberGrowth,
} from "@/lib/publicationDistribution";
import type { PublicationFunnelSegment } from "@/lib/publicationDelivery";

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function PublicationFunnelVisual({
  segment,
}: {
  segment: PublicationFunnelSegment;
}) {
  const openWidth =
    segment.deliveredRecipients > 0
      ? Math.max(4, (segment.opens / segment.deliveredRecipients) * 100)
      : 0;
  const readWidth =
    segment.deliveredRecipients > 0
      ? Math.max(4, (segment.qualifiedReads / segment.deliveredRecipients) * 100)
      : 0;
  return (
    <div className="mt-3 w-full max-w-xs space-y-1" aria-label="Delivery funnel">
      <div className="h-1.5 w-full rounded-full bg-emerald-200" />
      <div
        className="h-1.5 rounded-full bg-emerald-500"
        style={{ width: `${openWidth}%` }}
      />
      <div
        className="h-1.5 rounded-full bg-purple-500"
        style={{ width: `${readWidth}%` }}
      />
      <p className="text-[10px] text-gray-400">
        Delivered → opened → qualified read
      </p>
    </div>
  );
}

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, points")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/onboarding");

  const [{ data: publishedPosts }, publicationFunnel, subscriptionGrowth] =
    await Promise.all([
    supabase
      .from("posts")
      .select("id, title, slug, type, content_kind, article_format, view_count, read_count, created_at, published_at")
      .eq("author_id", profile.id)
      .eq("status", "published")
      .neq("type", RESEARCH_TYPE_QUERY_EXCLUSION)
      .order("read_count", { ascending: false }),
    getAuthorPublicationFunnel(profile.id),
    getAuthorSubscriberGrowth(profile.id),
  ]);

  const theirPostIds = (publishedPosts ?? []).map((p) => p.id);
  const totalReads = (publishedPosts ?? []).reduce(
    (sum, p) => sum + ((p as { read_count?: number | null }).read_count ?? 0),
    0
  );

  const [{ data: likeCountRows }, { count: followerCount }, { count: newFollowerCount }] =
    await Promise.all([
      theirPostIds.length > 0
        ? supabase.from("post_like_counts").select("like_count").in("post_id", theirPostIds)
        : Promise.resolve({ data: [] as { like_count: number }[] }),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profile.id),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profile.id)
        .gte("created_at", weekAgo),
    ]);

  const totalLikes = (likeCountRows ?? []).reduce(
    (sum, row) => sum + row.like_count,
    0
  );
  const tier = getPointTier(profile.points);
  const nextTier = getNextTier(profile.points);
  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.round(
          ((profile.points - tier.min) / (nextTier.min - tier.min)) * 100
        )
      )
    : 100;
  const acquisitionByPost = new Map(
    subscriptionGrowth.acquisition.map((row) => [
      row.postId,
      row.subscribersGained,
    ])
  );
  const bestConversion = publicationFunnel.rows
    .filter((row) => row.overall.deliveredRecipients >= 5)
    .sort(
      (left, right) =>
        right.overall.qualifiedReadConversionRate -
        left.overall.qualifiedReadConversionRate
    )[0];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Stats</h1>
        <p className="text-gray-500 text-sm mt-1">
          How your content is performing
        </p>
      </div>

      {/* 4 stat cards */}
      <div className={`grid grid-cols-2 gap-4 mb-8 ${isAuthorSubscriptionsEnabled() ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <StatCard label="Total Reads" value={totalReads} />
        <StatCard label="Total Likes" value={totalLikes} />
        <StatCard label="Followers" value={followerCount ?? 0} />
        <StatCard
          label="New Followers"
          value={newFollowerCount ?? 0}
          sub={
            (newFollowerCount ?? 0) > 0
              ? `+${newFollowerCount} this week`
              : "this week"
          }
        />
        {isAuthorSubscriptionsEnabled() ? (
          <StatCard
            label="Active Subscribers"
            value={
              isAuthorSubscriptionsUxV2Enabled()
                ? subscriptionGrowth.growth.activeSubscribers
                : publicationFunnel.activeSubscriberCount
            }
            sub="explicit author subscriptions"
          />
        ) : null}
      </div>

      {isAuthorSubscriptionsUxV2Enabled() ? (
        <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Subscriber growth
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Privacy-safe totals only. Tracking began{" "}
                {subscriptionGrowth.growth.trackingSince
                  ? formatDate(subscriptionGrowth.growth.trackingSince)
                  : "when UX V2 was enabled"}
                .
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[11px] text-gray-500">7 days</p>
                <p className="text-sm font-semibold text-gray-900">
                  +{subscriptionGrowth.growth.gained7d} / -
                  {subscriptionGrowth.growth.lost7d} · Net{" "}
                  {subscriptionGrowth.growth.net7d >= 0 ? "+" : ""}
                  {subscriptionGrowth.growth.net7d}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[11px] text-gray-500">30 days</p>
                <p className="text-sm font-semibold text-gray-900">
                  +{subscriptionGrowth.growth.gained30d} / -
                  {subscriptionGrowth.growth.lost30d} · Net{" "}
                  {subscriptionGrowth.growth.net30d >= 0 ? "+" : ""}
                  {subscriptionGrowth.growth.net30d}
                </p>
              </div>
            </div>
          </div>
          {subscriptionGrowth.growth.daily.length > 0 ? (
            <div
              className="mt-5 flex h-28 items-end gap-1"
              aria-label="30-day subscriber growth chart"
            >
              {subscriptionGrowth.growth.daily.map((day) => {
                const magnitude = Math.max(day.gained, day.lost, 1);
                return (
                  <div
                    key={day.date}
                    className="flex min-w-0 flex-1 flex-col justify-end gap-px"
                    title={`${day.date}: +${day.gained}, -${day.lost}`}
                  >
                    <span
                      className="w-full rounded-t bg-emerald-400"
                      style={{ height: `${Math.max(2, day.gained * 8)}px` }}
                    />
                    <span
                      className="w-full rounded-b bg-red-300"
                      style={{
                        height: `${Math.max(day.lost ? 2 : 0, day.lost * 8)}px`,
                        opacity: magnitude ? 1 : 0,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">
              Growth will appear after the first tracked subscription change.
            </p>
          )}
        </section>
      ) : null}

      {isAuthorSubscriptionsEnabled() ? (
        <section className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Publication delivery funnel
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Unique recipients across in-app, email, and push. Topic delivery
              is shared across credited authors; direct-author delivery remains
              private to the matched author.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Delivered means at least one channel completed; opened means a
              tracked publication link was opened; qualified reads meet the
              active-time and scroll-depth threshold.
            </p>
            {bestConversion ? (
              <p className="mt-2 text-xs font-semibold text-emerald-700">
                Best qualified-read conversion (minimum 5 delivered):{" "}
                {bestConversion.title} ·{" "}
                {bestConversion.overall.qualifiedReadConversionRate.toFixed(1)}%
              </p>
            ) : null}
          </div>
          {publicationFunnel.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Publication</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 text-right font-medium">Delivered</th>
                    <th className="px-4 py-3 text-right font-medium">Opens</th>
                    <th className="px-4 py-3 text-right font-medium">Qualified reads</th>
                    <th className="px-6 py-3 text-right font-medium">Conversion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {publicationFunnel.rows.map((row) => {
                    const segments = isTopicSubscriptionsEnabled()
                      ? [
                          { label: "Overall", value: row.overall },
                          { label: "Direct author", value: row.authorSource },
                          { label: "Topics", value: row.topicSource },
                        ]
                      : [{ label: "Overall", value: row.overall }];

                    return (
                      <Fragment key={row.postId}>
                        {segments.map((segment, index) => (
                          <tr key={`${row.postId}:${segment.label}`}>
                            {index === 0 ? (
                              <td
                                rowSpan={segments.length}
                                className="max-w-sm px-6 py-3 align-top"
                              >
                                <Link
                                  href={`/post/${row.slug}`}
                                  className="block truncate font-medium text-gray-900 hover:text-emerald-brand"
                                >
                                  {row.title}
                                </Link>
                                <span className="text-xs text-gray-400">
                                  {row.publishedAt ? formatDate(row.publishedAt) : ""}
                                </span>
                                {isAuthorSubscriptionsUxV2Enabled() ? (
                                  <>
                                    <PublicationFunnelVisual segment={row.overall} />
                                    {(acquisitionByPost.get(row.postId) ?? 0) > 0 ? (
                                      <span className="mt-1 block text-xs font-semibold text-emerald-700">
                                        +{acquisitionByPost.get(row.postId)} subscriber
                                        {acquisitionByPost.get(row.postId) === 1
                                          ? ""
                                          : "s"}{" "}
                                        attributed
                                      </span>
                                    ) : null}
                                  </>
                                ) : null}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-xs font-medium text-gray-500">
                              {segment.label}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">
                              {segment.value.deliveredRecipients.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">
                              {segment.value.opens.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">
                              {segment.value.qualifiedReads.toLocaleString()}
                            </td>
                            <td className="px-6 py-3 text-right font-semibold text-gray-900">
                              {segment.value.qualifiedReadConversionRate.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-6 py-8 text-center text-sm text-gray-500">
              Publication delivery data will appear after the feature is enabled and new work is published.
            </p>
          )}
        </section>
      ) : null}

      {/* Top posts table */}
      {(publishedPosts ?? []).length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              Top Posts by Reads
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {(publishedPosts ?? []).slice(0, 10).map((post) => (
              <div key={post.id} className="flex items-center gap-4 px-6 py-3">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/post/${post.slug}`}
                    className="text-sm font-medium text-gray-900 hover:text-emerald-brand transition-colors truncate block"
                  >
                    {post.title}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(post.published_at ?? post.created_at)}
                  </p>
                </div>
                <Badge
                  type={post.type}
                  content_kind={(post as { content_kind?: string | null }).content_kind}
                  article_format={(post as { article_format?: string | null }).article_format}
                />
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {((post as { read_count?: number | null }).read_count ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">reads</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-8">
          <p className="text-gray-400 text-sm">
            No published posts yet.{" "}
            <Link href="/write" className="text-emerald-brand font-medium hover:underline">
              Publish your first contribution →
            </Link>
          </p>
        </div>
      )}

      {/* Points breakdown card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Points &amp; Tier
        </h2>
        <div className="flex items-center gap-4 mb-4">
          <PointsTierBadge points={profile.points} showProgress={false} />
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {profile.points.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400">total points</p>
          </div>
        </div>
        {nextTier ? (
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>
                {tier.name} ({tier.min}+ pts)
              </span>
              <span>
                {nextTier.name} ({nextTier.min}+ pts)
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {nextTier.min - profile.points} more points to reach{" "}
              {nextTier.name}
            </p>
          </div>
        ) : (
          <p className="text-sm text-amber-600 font-medium">
            You&apos;ve reached the highest tier!
          </p>
        )}
      </div>
    </div>
  );
}
