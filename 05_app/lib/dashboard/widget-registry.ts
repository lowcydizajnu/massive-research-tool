/**
 * Dashboard widget registry (ADR-0045) — the single source of truth for which
 * widgets exist, their metadata, and the default layouts. PURE data (no React,
 * no DB imports) so the layout resolver, the tRPC layer, and tests can all
 * import it safely. The component/loader wiring lives in the dashboard render
 * layer (N5.2), keyed by `WidgetKey`.
 *
 * Scope: the widgets that exist today (owner decision 2026-06-15). The registry
 * is forward-compatible — adding a deferred widget here (and to a default array)
 * makes it appear for new users, and the resolver drops any stored key with no
 * entry, so removing a widget never breaks a saved layout.
 */

export type DashboardKind = "user" | "workspace";

/** Every widget that exists today. Add new keys here as widgets are built. */
export type WidgetKey =
  // user dashboard (/home)
  | "welcome"
  | "your-stats"
  | "recruiting-studies"
  | "workspaces-card"
  | "recent-studies"
  | "quick-actions"
  | "follows-feed"
  | "notifications"
  | "mentions-inbox"
  // workspace dashboard (/dashboard)
  | "workspace-header"
  | "active-recruitment"
  | "recently-edited"
  | "workspace-activity"
  | "top-tags"
  | "recent-forks";

export type WidgetCategory = "personal" | "studies" | "activity" | "team" | "osf" | "admin";
export type WidgetSize = "small" | "medium" | "large" | "full";

/** A per-widget setting tweakable in edit mode (ADR-0045, intentionally minimal). */
export type WidgetSettingSpec = {
  key: string;
  label: string;
  type: "select";
  options: { value: number; label: string }[];
  default: number;
};

export interface WidgetMeta {
  key: WidgetKey;
  name: string;
  description: string;
  category: WidgetCategory;
  size: WidgetSize;
  dashboard: DashboardKind | "both";
  /** Owners only — filtered for other viewers at resolve time. */
  ownerOnly?: boolean;
  /** Ships in the code default layout. */
  defaultInLayout?: boolean;
  /** Optional per-widget settings exposed via the edit-mode gear. */
  settings?: WidgetSettingSpec[];
}

const ITEM_COUNT = (def: number, opts: number[]): WidgetSettingSpec => ({
  key: "itemCount",
  label: "Show",
  type: "select",
  options: opts.map((n) => ({ value: n, label: String(n) })),
  default: def,
});

export const WIDGET_REGISTRY: Record<WidgetKey, WidgetMeta> = {
  // ---- user dashboard (/home) ----
  welcome: {
    key: "welcome",
    name: "Welcome",
    description: "Greeting + a one-line summary of your studies.",
    category: "personal",
    size: "full",
    dashboard: "user",
    defaultInLayout: true,
  },
  "your-stats": {
    key: "your-stats",
    name: "Your stats",
    description: "Studies, replications, followers, participants.",
    category: "personal",
    size: "full",
    dashboard: "user",
    defaultInLayout: true,
  },
  "recruiting-studies": {
    key: "recruiting-studies",
    name: "Your running studies",
    description: "Studies of yours collecting responses right now.",
    category: "studies",
    size: "medium",
    dashboard: "user",
    defaultInLayout: true,
    settings: [ITEM_COUNT(10, [5, 10, 20])],
  },
  "workspaces-card": {
    key: "workspaces-card",
    name: "Workspaces",
    description: "Every workspace you belong to, with quick switch.",
    category: "personal",
    size: "medium",
    dashboard: "user",
    defaultInLayout: true,
  },
  "recent-studies": {
    key: "recent-studies",
    name: "Your recent studies",
    description: "Studies you touched most recently, across workspaces.",
    category: "studies",
    size: "medium",
    dashboard: "user",
    defaultInLayout: true,
    settings: [ITEM_COUNT(10, [5, 10, 20])],
  },
  "quick-actions": {
    key: "quick-actions",
    name: "Quick actions",
    description: "New study + jump to Activity.",
    category: "personal",
    size: "small",
    dashboard: "user",
    defaultInLayout: true,
  },
  "follows-feed": {
    key: "follows-feed",
    name: "Following",
    description: "Updates from tags, authors, frameworks, and studies you follow.",
    category: "activity",
    size: "medium",
    dashboard: "user",
  },
  notifications: {
    key: "notifications",
    name: "Notifications",
    description: "Comments, mentions, reviews, and OSF updates addressed to you.",
    category: "activity",
    size: "medium",
    dashboard: "user",
  },
  "mentions-inbox": {
    key: "mentions-inbox",
    name: "Mentions",
    description: "Where teammates @-mentioned you.",
    category: "activity",
    size: "small",
    dashboard: "user",
  },
  // ---- workspace dashboard (/dashboard) ----
  "workspace-header": {
    key: "workspace-header",
    name: "Workspace header",
    description: "Workspace name + at-a-glance KPIs.",
    category: "team",
    size: "full",
    dashboard: "workspace",
    defaultInLayout: true,
    settings: [
      {
        key: "kpiCount",
        label: "Stats",
        type: "select",
        options: [
          { value: 0, label: "Off" },
          { value: 3, label: "3" },
          { value: 4, label: "4" },
          { value: 5, label: "5" },
        ],
        default: 3,
      },
    ],
  },
  "active-recruitment": {
    key: "active-recruitment",
    name: "Running studies",
    description: "Studies running in this workspace.",
    category: "studies",
    size: "medium",
    dashboard: "workspace",
    defaultInLayout: true,
    settings: [ITEM_COUNT(10, [5, 10, 20])],
  },
  "recently-edited": {
    key: "recently-edited",
    name: "Recently edited",
    description: "Studies in this workspace, most recent first.",
    category: "studies",
    size: "medium",
    dashboard: "workspace",
    defaultInLayout: true,
    settings: [ITEM_COUNT(10, [5, 10, 20])],
  },
  "workspace-activity": {
    key: "workspace-activity",
    name: "Recent activity",
    description: "What happened in this workspace lately.",
    category: "activity",
    size: "medium",
    dashboard: "workspace",
    defaultInLayout: true,
    settings: [ITEM_COUNT(15, [10, 15, 30])],
  },
  "top-tags": {
    key: "top-tags",
    name: "Top tags",
    description: "The most-used study tags in this workspace.",
    category: "studies",
    size: "small",
    dashboard: "workspace",
  },
  "recent-forks": {
    key: "recent-forks",
    name: "Recent replications",
    description: "Studies recently replicated (forked) from this workspace.",
    category: "studies",
    size: "medium",
    dashboard: "workspace",
    settings: [ITEM_COUNT(10, [5, 10, 20])],
  },
};

/** Default order for a brand-new user's personal dashboard. */
export const USER_DASHBOARD_DEFAULT_LAYOUT: WidgetKey[] = [
  "welcome",
  "your-stats",
  "recruiting-studies",
  "workspaces-card",
  "recent-studies",
  "quick-actions",
];

/** Default order for the per-workspace dashboard (absent an admin override). */
export const WORKSPACE_DASHBOARD_DEFAULT_LAYOUT: WidgetKey[] = [
  "workspace-header",
  "active-recruitment",
  "recently-edited",
  "workspace-activity",
];

/** The default layout keys for a dashboard kind. */
export function defaultLayoutFor(kind: DashboardKind): WidgetKey[] {
  return kind === "user" ? USER_DASHBOARD_DEFAULT_LAYOUT : WORKSPACE_DASHBOARD_DEFAULT_LAYOUT;
}

/** Type guard — is this string a known widget key? */
export function isWidgetKey(key: string): key is WidgetKey {
  return Object.prototype.hasOwnProperty.call(WIDGET_REGISTRY, key);
}

/**
 * Synthetic meta for a custom widget instance (ADR-0045 amendment). Custom
 * widgets aren't in WIDGET_REGISTRY (their keys are `custom:<ulid>`); the
 * resolver maps any `custom:`-prefixed entry to this so it renders + reorders
 * like any other widget. Both dashboards; "medium" footprint.
 */
export const CUSTOM_META: WidgetMeta = {
  key: "custom" as WidgetKey,
  name: "Custom widget",
  description: "A metric or list you choose.",
  category: "personal",
  size: "medium",
  dashboard: "both",
};
