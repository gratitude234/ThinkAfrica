"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  signupsByDay: { date: string; count: number }[];
  postsByKind: { kind: string; count: number }[];
  topUniversities: { university: string; count: number }[];
  activationFunnel: { stage: string; count: number }[];
  retentionByDay: { date: string; activeUsers: number }[];
}

// Two kinds, two colours. The four-valued map this replaces was keyed on the
// legacy `posts.type`, which is why the chart had a Policy slice and a
// Research slice for a product that has neither.
const KIND_COLORS: Record<string, string> = {
  post: "#073929",
  article: "#CE932B",
};

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-canvas text-sm text-gray-400">
      {label}
    </div>
  );
}

export default function AnalyticsCharts({
  signupsByDay,
  postsByKind,
  topUniversities,
  activationFunnel,
  retentionByDay,
}: Props) {
  const hasFunnelData = activationFunnel.some((stage) => stage.count > 0);
  const hasRetentionData = retentionByDay.some((day) => day.activeUsers > 0);

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">
          New Signups - Last 30 Days
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={signupsByDay} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#9CA3AF" }}
              tickFormatter={(v) => v.slice(5)}
            />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              labelFormatter={(v) => `Date: ${v}`}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#073929"
              strokeWidth={2}
              dot={false}
              name="Signups"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            Legacy Activation Signals
          </h3>
          {hasFunnelData ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={activationFunnel} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="stage"
                  interval={0}
                  tick={{ fontSize: 10, fill: "#6B7280" }}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" name="Users" fill="#073929" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No activation events yet" />
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            Legacy Event Activity
          </h3>
          {hasRetentionData ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={retentionByDay} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelFormatter={(v) => `Date: ${v}`}
                />
                <Line
                  type="monotone"
                  dataKey="activeUsers"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                  name="Active users"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No returning activity yet" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Posts and Articles</h3>
          {postsByKind.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={postsByKind} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="kind"
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  tickFormatter={(v) => (v === "article" ? "Articles" : "Posts")}
                />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" name="Published" radius={[4, 4, 0, 0]}>
                  {postsByKind.map((entry) => (
                    <Cell key={entry.kind} fill={KIND_COLORS[entry.kind] ?? "#9CA3AF"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No published posts yet" />
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Top 10 Universities</h3>
          {topUniversities.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={topUniversities}
                layout="vertical"
                margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#9CA3AF" }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="university"
                  tick={{ fontSize: 9, fill: "#6B7280" }}
                  width={90}
                  tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 15)}...` : v)}
                />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" fill="#073929" name="Contributors" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No university data yet" />
          )}
        </div>
      </div>
    </div>
  );
}
