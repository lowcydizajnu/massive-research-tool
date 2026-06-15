/**
 * Curated catalog of data sources a custom dashboard widget can display
 * (ADR-0045 amendment). PURE data — shared by the `dashboard.customData`
 * endpoint and the edit-mode config UI. Sources are vetted, workspace/owner-
 * scoped reads; arbitrary SQL/URLs are out of scope by design.
 */

export type DashboardKind = "user" | "workspace";
export type CustomSourceType = "metric" | "list";

export type CustomSource = {
  key: string;
  label: string;
  type: CustomSourceType;
  /** Which dashboard kinds this source is offered on. */
  dashboards: DashboardKind[];
  supportsDateRange?: boolean;
  supportsItemCount?: boolean;
};

export const CUSTOM_SOURCES: CustomSource[] = [
  // metric (single number)
  {
    key: "responses",
    label: "Responses collected",
    type: "metric",
    dashboards: ["user", "workspace"],
    supportsDateRange: true,
  },
  { key: "studies", label: "Studies", type: "metric", dashboards: ["user", "workspace"] },
  { key: "running", label: "Running studies", type: "metric", dashboards: ["user", "workspace"] },
  // list (short list)
  {
    key: "recent-studies",
    label: "Recent studies",
    type: "list",
    dashboards: ["user", "workspace"],
    supportsItemCount: true,
  },
  {
    key: "recent-activity",
    label: "Recent activity",
    type: "list",
    dashboards: ["workspace"],
    supportsItemCount: true,
  },
];

export type DateRange = "7d" | "30d" | "90d" | "all";
export const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export const DEFAULT_CUSTOM_SOURCE = "responses";

export function customSource(key: string): CustomSource | undefined {
  return CUSTOM_SOURCES.find((s) => s.key === key);
}

export function customSourcesFor(kind: DashboardKind): CustomSource[] {
  return CUSTOM_SOURCES.filter((s) => s.dashboards.includes(kind));
}

/** A layout entry is a custom widget iff its key carries the `custom:` prefix. */
export const CUSTOM_KEY_PREFIX = "custom:";
export function isCustomKey(key: string): boolean {
  return key.startsWith(CUSTOM_KEY_PREFIX);
}

/** Days back for a date range, or null for "all time". */
export function dateRangeDays(range: DateRange | undefined): number | null {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    default:
      return null;
  }
}
