import type { HypothesisFields } from "@/lib/study-record/sections";

/** Hypothesis structured fields as token-styled stat chips — the "nice number
 *  treatment" for figures (tabular-nums), shared by the composer preview + the
 *  public record (ADR-0056). Server-safe (no client hooks). */
const ORDER: { key: keyof HypothesisFields; label: string }[] = [
  { key: "effectType", label: "Effect" },
  { key: "direction", label: "Direction" },
  { key: "statisticKind", label: "Statistic" },
  { key: "statisticValue", label: "Value" },
  { key: "analysis", label: "Analysis" },
];

export function HypothesisChips({ fields }: { fields: HypothesisFields }) {
  const chips = ORDER.map((f) => ({ label: f.label, value: fields[f.key]?.trim() })).filter((c) => c.value);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.label} className="inline-flex items-baseline gap-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)]">
          <span className="text-[var(--color-text-muted)]">{c.label}</span>
          <span className="font-medium text-[var(--color-text-primary)] [font-variant-numeric:tabular-nums]">{c.value}</span>
        </span>
      ))}
    </div>
  );
}
