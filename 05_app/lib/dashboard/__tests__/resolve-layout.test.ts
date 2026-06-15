import { describe, expect, it } from "vitest";

import { resolveDashboardLayout } from "@/lib/dashboard/resolve-layout";
import {
  USER_DASHBOARD_DEFAULT_LAYOUT,
  WORKSPACE_DASHBOARD_DEFAULT_LAYOUT,
  type WidgetKey,
  type WidgetMeta,
} from "@/lib/dashboard/widget-registry";

/** A small fixture registry for the filtering tests — independent of the real catalog. */
const meta = (key: string, dashboard: WidgetMeta["dashboard"], ownerOnly = false): WidgetMeta => ({
  key: key as WidgetKey,
  name: key,
  description: "",
  category: "personal",
  size: "medium",
  dashboard,
  ownerOnly,
});
const FIXTURE: Record<string, WidgetMeta> = {
  a: meta("a", "user"),
  b: meta("b", "workspace"),
  both: meta("both", "both"),
  secret: meta("secret", "workspace", true),
};

describe("resolveDashboardLayout", () => {
  it("uses the code default when there's no override", () => {
    const r = resolveDashboardLayout({ kind: "user", userLayout: null, isOwner: true });
    expect(r.map((w) => w.widgetKey)).toEqual(USER_DASHBOARD_DEFAULT_LAYOUT);
  });

  it("a user override wins over everything", () => {
    const r = resolveDashboardLayout({
      kind: "workspace",
      userLayout: [{ widgetKey: "recently-edited" }, { widgetKey: "workspace-header" }],
      workspaceDefault: [{ widgetKey: "active-recruitment" }],
      isOwner: true,
    });
    expect(r.map((w) => w.widgetKey)).toEqual(["recently-edited", "workspace-header"]);
  });

  it("falls back to the workspace admin default when there's no user override (workspace kind)", () => {
    const r = resolveDashboardLayout({
      kind: "workspace",
      userLayout: null,
      workspaceDefault: [{ widgetKey: "workspace-activity" }, { widgetKey: "workspace-header" }],
      isOwner: true,
    });
    expect(r.map((w) => w.widgetKey)).toEqual(["workspace-activity", "workspace-header"]);
  });

  it("ignores the workspace default for the personal dashboard", () => {
    const r = resolveDashboardLayout({
      kind: "user",
      userLayout: null,
      workspaceDefault: [{ widgetKey: "workspace-header" }],
      isOwner: true,
    });
    expect(r.map((w) => w.widgetKey)).toEqual(USER_DASHBOARD_DEFAULT_LAYOUT);
  });

  it("drops unknown keys + wrong-dashboard widgets and dedupes", () => {
    const r = resolveDashboardLayout({
      kind: "user",
      userLayout: [
        { widgetKey: "a" },
        { widgetKey: "ghost" }, // unknown → dropped
        { widgetKey: "b" }, // workspace-only → dropped on the user dashboard
        { widgetKey: "both" },
        { widgetKey: "a" }, // duplicate → collapsed
      ],
      isOwner: true,
      registry: FIXTURE,
    });
    expect(r.map((w) => w.widgetKey)).toEqual(["a", "both"]);
  });

  it("gates ownerOnly widgets to owners", () => {
    const userLayout = [{ widgetKey: "b" }, { widgetKey: "secret" }];
    const asOwner = resolveDashboardLayout({ kind: "workspace", userLayout, isOwner: true, registry: FIXTURE });
    expect(asOwner.map((w) => w.widgetKey)).toEqual(["b", "secret"]);
    const asMember = resolveDashboardLayout({ kind: "workspace", userLayout, isOwner: false, registry: FIXTURE });
    expect(asMember.map((w) => w.widgetKey)).toEqual(["b"]);
  });

  it("carries per-widget settings through", () => {
    const r = resolveDashboardLayout({
      kind: "user",
      userLayout: [{ widgetKey: "recent-studies", settings: { itemCount: 5 } }],
      isOwner: true,
    });
    expect(r[0]).toMatchObject({ widgetKey: "recent-studies", settings: { itemCount: 5 } });
  });

  it("the real workspace default layout resolves to known workspace widgets", () => {
    const r = resolveDashboardLayout({ kind: "workspace", userLayout: null, isOwner: false });
    expect(r.map((w) => w.widgetKey)).toEqual(WORKSPACE_DASHBOARD_DEFAULT_LAYOUT);
  });
});
