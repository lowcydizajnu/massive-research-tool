"use client";

import Link from "next/link";
import type { Route } from "next";
import { useContext } from "react";

import { NewStudyContext } from "@/components/feature/new-study/context";
import type { ExploreScenario } from "@/content/explore/scenarios";

/**
 * Explore use-case card (EE1.2, ADR-0076; explore-use-case-card.md). Curated
 * scenario → a single concrete starting point. "build" opens the New Study modal
 * (authed); on the public variant (EE1.3) every CTA routes through sign-up, so we
 * read the New-Study context defensively (it's absent outside NewStudyProvider).
 */
const CARD =
  "flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]";
const CTA =
  "inline-flex items-center self-start rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80";

export function ExploreScenarioCard({
  scenario,
  isPublic = false,
}: {
  scenario: ExploreScenario;
  isPublic?: boolean;
}) {
  const newStudy = useContext(NewStudyContext); // undefined on the public route
  const { cta, ctaLabel } = scenario;

  function renderCta() {
    // Public route: no workspace yet → every action routes through sign-up.
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
    // "build" (and "template" until EE1.3 wires the fork) → open New Study.
    return (
      <button type="button" className={CTA} onClick={() => newStudy?.open()} disabled={!newStudy}>
        {ctaLabel}
      </button>
    );
  }

  return (
    <article className={CARD}>
      {/* Cover — neutral placeholder until a cover image is set (no broken image). */}
      <div
        aria-hidden
        className="aspect-[16/9] w-full bg-[var(--color-surface-subtle)]"
      />
      <div className="flex flex-col gap-2 p-4">
        <h3 className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">
          {scenario.title}
        </h3>
        <p className="line-clamp-3 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          {scenario.body}
        </p>
        <div className="mt-1">{renderCta()}</div>
      </div>
    </article>
  );
}
