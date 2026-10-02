"use client";

import { useState } from "react";

/** Values remain available by touch and keyboard; zero months have no filled bar. */
export default function ProfileActivityChart({
  activity,
}: {
  activity: Array<{ month: string; count: number }>;
}) {
  const [active, setActive] = useState<string | null>(null);
  const maximum = Math.max(0, ...activity.map((point) => point.count));
  const chosen = activity.find((point) => point.month === active);
  const monthLabel = (month: string) =>
    new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${month}-01T00:00:00Z`));
  if (!maximum)
    return (
      <p className="profile-activity-empty">
        This record will grow as new Posts and Articles are published.
      </p>
    );
  return (
    <>
      <ol
        className="profile-activity-chart"
        aria-label="Published works by month"
      >
        {activity.map((point) => (
          <li key={point.month}>
            <button
              type="button"
              className="focus-ring profile-activity-point"
              aria-pressed={active === point.month}
              aria-label={`${monthLabel(point.month)}: ${point.count.toLocaleString()} published work${point.count === 1 ? "" : "s"}`}
              onFocus={() => setActive(point.month)}
              onClick={() => setActive(point.month)}
              onMouseEnter={() => setActive(point.month)}
            >
              <span
                aria-hidden="true"
                className="profile-activity-bar"
                style={{
                  height: `${point.count === 0 ? 0 : Math.max(2, Math.round((point.count / maximum) * 52))}px`,
                }}
              />
              <span aria-hidden="true" className="profile-activity-label">
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(`${point.month}-01T00:00:00Z`))}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="profile-activity-value" role="status" aria-live="polite">
        {chosen
          ? `${monthLabel(chosen.month)} · ${chosen.count.toLocaleString()} published work${chosen.count === 1 ? "" : "s"}`
          : "Select a month to see its publications"}
      </p>
    </>
  );
}
