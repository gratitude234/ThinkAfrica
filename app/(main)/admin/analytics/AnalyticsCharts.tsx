"use client";

import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface Props {
  signupsByDay: { date: string; count: number }[];
  postsByType: { type: string; count: number }[];
  topUniversities: { university: string; count: number }[];
}

const TYPE_COLORS: Record<string, string> = {
  blog: "#10B981",
  essay: "#F59E0B",
  research: "#7C3AED",
  policy_brief: "#3B82F6",
};

export default function AnalyticsCharts({ signupsByDay, postsByType, topUniversities }: Props) {
  return (
    <div className="space-y-8">
      {/* Signups over time */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">New Signups — Last 30 Days</h3>
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
              stroke="#10B981"
              strokeWidth={2}
              dot={false}
              name="Signups"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Posts by content type */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Posts by Content Type</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={postsByType} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="type" tick={{ fontSize: 11, fill: "#9CA3AF" }}
                tickFormatter={(v) => v === "policy_brief" ? "Policy" : v.charAt(0).toUpperCase() + v.slice(1)} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" name="Posts" radius={[4, 4, 0, 0]}>
                {postsByType.map((entry) => (
                  <Cell key={entry.type} fill={TYPE_COLORS[entry.type] ?? "#9CA3AF"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top universities */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Top 10 Universities</h3>
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
                tickFormatter={(v: string) => v.length > 15 ? v.slice(0, 15) + "…" : v}
              />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" fill="#10B981" name="Contributors" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
