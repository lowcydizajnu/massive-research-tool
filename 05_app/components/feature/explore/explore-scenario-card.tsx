"use client";

import { FlaskConical, Newspaper, Repeat2, SplitSquareHorizontal, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ExploreScenario, ExploreScenarioIcon } from "@/content/explore/scenarios";
import { createStudyAction } from "@/server/studies/create";
import { forkTemplateAction } from "@/server/templates/fork-template";

/**
 * Explore use-case card (EE1.2/EE1.3, ADR-0076; explore-use-case-card.md).
 * Curated scenario → ONE concrete starting point with no chooser friction:
 * "build" creates a study (named after the scenario) and drops the researcher
 * straight into the Builder — the description's "start building" intent. "browse"
 * → /browse. On the public route (EE later) every CTA routes through sign-up.
 *
 * Covers are a branded gradient + a per-scenario lucide motif (no asset files).
 */
const ICONS: Record<ExploreScenarioIcon, LucideIcon> = {
  newspaper: Newspaper,
  replicate: Repeat2,
  split: SplitSquareHorizontal,
  flask: FlaskConical,
};

const CARD =
  "flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]";
const CTA =
  "inline-flex items-center self-start rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50";

export function ExploreScenarioCard({
  scenario,
  isPublic = false,
}: {
  scenario: ExploreScenario;
  isPublic?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const { cta, ctaLabel } = scenario;
  const Icon = ICONS[scenario.iconKey];

  async function startBuilding() {
    if (pending) return;
    setPending(true);
    try {
      // "template" forks the starter into the workspace; "build" creates a blank
      // study. Both land the researcher in the Builder — no chooser friction.
      const { id } =
        cta.kind === "template"
          ? await forkTemplateAction({ templateId: cta.templateId })
          : await createStudyAction({ kind: "blank", title: scenario.title });
      router.push(`/studies/${id}/build` as Route);
    } catch {
      setPending(false); // surface re-enables the button; toast handled globally
    }
  }

  function renderCta() {
    if (isPublic) {
      return (
        <Link href={"/signup" as Route} className={CTA}>
          {ctaLabel}
        </Link>
      );
    }
    if (cta.kind === "browse") {
      return (
        <Link href={"/browse" as Route} className={CTA}>
          {ctaLabel}
        </Link>
      );
    }
    // "build" → create a blank study; "template" → fork the starter template.
    return (
      <button type="button" className={CTA} onClick={startBuilding} disabled={pending}>
        {pending ? "Creating…" : ctaLabel}
      </button>
    );
  }

  return (
    <article className={CARD}>
      <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-[var(--color-primary-subtle)] to-[var(--color-surface-subtle)]">
        <Icon className="size-10 text-[var(--color-primary)]" aria-hidden />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">
          {scenario.title}
        </h3>
        <p className="line-clamp-3 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          {scenario.body}
        </p>
        <div className="mt-auto pt-1">{renderCta()}</div>
      </div>
    </article>
  );
}
