import {
  buildProfileRecordHref,
  type ProfileRecordSummary,
} from "@/lib/profileRecord";

/**
 * The one definition of the three record metrics.
 *
 * The header used to carry these sentences inline as `title` attributes, the
 * record page carried a different sentence about evidence chips, and
 * onboarding carried only the labels. Three copies of a claim about what a
 * number means is three chances to drift, and this is the claim the product
 * rests on, so it lives here and every surface reads it.
 */
export const PROFILE_RECORD_METRIC_KEYS = [
  "publications",
  "source_backed",
  "citable",
] as const;

export type ProfileRecordMetricKey = (typeof PROFILE_RECORD_METRIC_KEYS)[number];

export interface ProfileRecordMetricDefinition {
  key: ProfileRecordMetricKey;
  label: string;
  description: string;
}

export const PROFILE_RECORD_METRIC_DEFINITIONS: Record<
  ProfileRecordMetricKey,
  ProfileRecordMetricDefinition
> = {
  publications: {
    key: "publications",
    label: "Publications",
    description:
      "Original published work, plus published work with an accepted co-author credit.",
  },
  source_backed: {
    key: "source_backed",
    label: "Source-backed",
    description: "Publications carrying at least one structured source.",
  },
  citable: {
    key: "citable",
    label: "Citable",
    description: "Publications with a stable citation record.",
  },
};

export const PROFILE_RECORD_METRIC_LIST: ProfileRecordMetricDefinition[] =
  PROFILE_RECORD_METRIC_KEYS.map((key) => PROFILE_RECORD_METRIC_DEFINITIONS[key]);

/**
 * Says what these numbers are not. A count of source-backed work is a fact a
 * reader can go and check; it is not a rating, and the product has no rating.
 */
export const PROFILE_RECORD_METRIC_DISCLAIMER =
  "These are inspectable record signals. They are not popularity counts or an overall quality score.";

export interface VisibleProfileRecordMetric extends ProfileRecordMetricDefinition {
  value: number;
}

export interface LinkedProfileRecordMetric extends VisibleProfileRecordMetric {
  href: string;
}

export type ProfileRecordMetricCounts = Pick<
  ProfileRecordSummary,
  "publicationCount" | "sourceBackedCount" | "citableCount"
>;

/**
 * The metrics worth showing: the ones with something in them.
 *
 * Every metric used to render regardless, so a new author's record was three
 * zeroes set in display type, the loudest thing on their page. Citable is zero
 * for most authors however long they have been writing, so a wall of zeroes
 * was the ordinary case rather than the edge one. An empty record now falls
 * through to whichever empty state the surface already has, which says
 * something true instead.
 *
 * Onboarding uses this without hrefs, because its preview is a picture of a
 * profile rather than a profile.
 */
export function getVisibleProfileRecordMetrics(
  summary: ProfileRecordMetricCounts
): VisibleProfileRecordMetric[] {
  const values: Record<ProfileRecordMetricKey, number> = {
    publications: summary.publicationCount,
    source_backed: summary.sourceBackedCount,
    citable: summary.citableCount,
  };

  return PROFILE_RECORD_METRIC_LIST.flatMap((definition) => {
    const value = values[definition.key];
    if (!(value > 0)) return [];
    return [{ ...definition, value }];
  });
}

/** The same metrics, each pointing at the record filter that proves it. */
export function getLinkedProfileRecordMetrics(
  summary: ProfileRecordMetricCounts,
  username: string
): LinkedProfileRecordMetric[] {
  const hrefs: Record<ProfileRecordMetricKey, string> = {
    publications: buildProfileRecordHref({ username, filter: "publications" }),
    source_backed: buildProfileRecordHref({
      username,
      filter: "publications",
      quality: "source_backed",
    }),
    citable: buildProfileRecordHref({
      username,
      filter: "publications",
      quality: "citable",
    }),
  };

  return getVisibleProfileRecordMetrics(summary).map((metric) => ({
    ...metric,
    href: hrefs[metric.key],
  }));
}

/**
 * Column count for the metric row. Written out rather than computed because
 * Tailwind only ships the classes it can see in the source.
 */
export function profileRecordMetricGridClass(count: number) {
  if (count >= 3) return "grid-cols-3";
  if (count === 2) return "grid-cols-2";
  return "grid-cols-1";
}
