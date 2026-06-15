"use client";

import type { Route } from "next";
import Link from "next/link";

import {
  type DashboardKind,
  type DateRange,
  DATE_RANGES,
  DEFAULT_CUSTOM_SOURCE,
  customSource,
  customSourcesFor,
} from "@/lib/dashboard/custom-sources";
import { api } from "@/lib/trpc/react";

/**
 * A user-configured custom widget (ADR-0045 amendment). Self-fetching client
 * component: reads its `settings` ({ source, dateRange?, itemCount?, title? }),
 * pulls the chosen source via `dashboard.customData`, and renders a metric card
 * or a short list. In edit mode it shows an inline config form (source + params)
 * that writes back through `onConfig`. Add several — each instance is keyed
 * `custom:<ulid>` in the layout.
 */
export type CustomSettings = {
  source?: string;
  dateRange?: DateRange;
  itemCount?: number;
  title?: string;
};

export function CustomWidget({
  kind,
  workspaceId,
  settings,
  editing,
  onConfig,
}: {
  kind: DashboardKind;
  workspaceId?: string;
  settings: CustomSettings;
  editing: boolean;
  onConfig: (next: CustomSettings) => void;
}) {
  const source = settings.source ?? DEFAULT_CUSTOM_SOURCE;
  const def = customSource(source);
  const valid = !!def && def.dashboards.includes(kind) && (kind === "user" || !!workspaceId);

  const query = api.dashboard.customData.useQuery(
    {
      kind,
      workspaceId,
      source,
      dateRange: def?.supportsDateRange ? (settings.dateRange ?? "30d") : undefined,
      itemCount: settings.itemCount ?? 5,
    },
    { enabled: valid },
  );

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
        {settings.title?.trim() || def?.label || "Custom widget"}
      </h2>

      {editing ? <ConfigForm kind={kind} settings={settings} onConfig={onConfig} /> : null}

      {!valid ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Pick a data source{editing ? " above" : ""} to show here.
        </p>
      ) : query.isLoading ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>
      ) : query.isError || !query.data ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger)]">
          Couldn’t load this data.
        </p>
      ) : query.data.type === "metric" ? (
        <div className="flex flex-col gap-0.5">
          <span className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            {query.data.value}
          </span>
          {settings.title?.trim() ? (
            <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{query.data.label}</span>
          ) : null}
        </div>
      ) : query.data.items.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Nothing yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {query.data.items.map((it) => (
            <li key={it.id} className="truncate text-[length:var(--text-small)]">
              {it.href ? (
                <Link
                  href={it.href as Route}
                  className="text-[var(--color-text-primary)] hover:underline"
                >
                  {it.text}
                </Link>
              ) : (
                <span className="text-[var(--color-text-secondary)]">{it.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConfigForm({
  kind,
  settings,
  onConfig,
}: {
  kind: DashboardKind;
  settings: CustomSettings;
  onConfig: (next: CustomSettings) => void;
}) {
  const source = settings.source ?? DEFAULT_CUSTOM_SOURCE;
  const def = customSource(source);
  const sources = customSourcesFor(kind);
  const selectCls =
    "rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]";

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3">
      <input
        value={settings.title ?? ""}
        onChange={(e) => onConfig({ ...settings, title: e.target.value })}
        placeholder="Widget title (optional)"
        aria-label="Custom widget title"
        className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
      />
      <label className="flex items-center justify-between gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Show
        <select value={source} onChange={(e) => onConfig({ ...settings, source: e.target.value })} className={selectCls}>
          {sources.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {def?.supportsDateRange ? (
        <label className="flex items-center justify-between gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Range
          <select
            value={settings.dateRange ?? "30d"}
            onChange={(e) => onConfig({ ...settings, dateRange: e.target.value as DateRange })}
            className={selectCls}
          >
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {def?.supportsItemCount ? (
        <label className="flex items-center justify-between gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Items
          <select
            value={String(settings.itemCount ?? 5)}
            onChange={(e) => onConfig({ ...settings, itemCount: Number(e.target.value) })}
            className={selectCls}
          >
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
