"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle, Plus, Trash2, X } from "lucide-react";

import { api } from "@/lib/trpc/react";
import { cellCount, type VariantBinding, type VariantFactor } from "@/lib/variants/factorial";
import { getModuleDef } from "@/server/modules/registry";
import type { StudyDetail } from "@/server/trpc/routers/studies";
import { PendingButton } from "@/components/ui/pending-button";
import { READ_ONLY_TITLE } from "@/components/feature/workspace/role-gate";

/**
 * Factorial variants editor (ADR-0058). Define factors × levels and bind block
 * fields to a factor (the field takes a value per level). Shared content stays in
 * Blocks; here you only set what *varies*. Saves through `studies.setVariants`.
 */
const genId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
const coerce = (s: string): unknown => {
  const t = s.trim();
  return t !== "" && !Number.isNaN(Number(t)) ? Number(t) : s;
};

/** Config keys never offered as varying fields regardless of block — system-managed
 *  objects, not researcher-set content. */
const GLOBAL_NON_VARYING = new Set(["emotionAnalysis"]);

/** Bindable field keys from a block's config — top-level keys, plus one level of
 *  nesting as dot-paths (so `metrics.likes` is selectable). Arrays/objects of
 *  arrays are offered as a whole key. Skips DERIVED keys (e.g. audio-stimulus
 *  `audioUrl`/`audioHash`, set by generation — varying them by hand is nonsensical)
 *  and system-managed objects. */
function configFieldKeys(config: Record<string, unknown> | undefined, derived: readonly string[] = []): string[] {
  const skip = new Set<string>([...derived, ...GLOBAL_NON_VARYING]);
  const out: string[] = [];
  for (const [k, v] of Object.entries(config ?? {})) {
    if (skip.has(k)) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const children = Object.keys(v as Record<string, unknown>);
      if (children.length) for (const ck of children) out.push(`${k}.${ck}`);
      else out.push(k);
    } else {
      out.push(k);
    }
  }
  return out;
}

export function VariantsSection({ study, canEdit }: { study: StudyDetail; canEdit: boolean }) {
  const utils = api.useUtils();
  const save = api.studies.setVariants.useMutation({ onSuccess: () => void utils.studies.get.invalidate({ id: study.id }) });
  const [factors, setFactors] = useState<VariantFactor[]>(study.factors);
  const [bindings, setBindings] = useState<VariantBinding[]>(study.variantBindings);
  useEffect(() => {
    setFactors(study.factors);
    setBindings(study.variantBindings);
  }, [study.factors, study.variantBindings]);

  const commit = (f: VariantFactor[], b: VariantBinding[]) => {
    setFactors(f);
    setBindings(b);
    if (canEdit) save.mutate({ studyId: study.id, factors: f, variantBindings: b });
  };
  const blockName = (id: string) => {
    const blk = study.blocks.find((x) => x.instanceId === id);
    return blk ? blk.title?.trim() || blk.name : id;
  };
  const factorName = (id: string) => factors.find((f) => f.id === id)?.name ?? id;

  // --- factor / level ops (structural → commit immediately) ---
  const addFactor = () =>
    commit(
      [...factors, { id: genId(), name: `Factor ${factors.length + 1}`, levels: [{ id: genId(), name: "A" }, { id: genId(), name: "B" }] }],
      bindings,
    );
  const removeFactor = (fid: string) => commit(factors.filter((f) => f.id !== fid), bindings.filter((b) => b.factorId !== fid));
  const addLevel = (fid: string) =>
    commit(factors.map((f) => (f.id === fid ? { ...f, levels: [...f.levels, { id: genId(), name: `Level ${f.levels.length + 1}` }] } : f)), bindings);
  const removeLevel = (fid: string, lid: string) =>
    commit(factors.map((f) => (f.id === fid ? { ...f, levels: f.levels.filter((l) => l.id !== lid) } : f)), bindings);
  // --- text edits (commit on blur via the current local state) ---
  const renameFactor = (fid: string, name: string) => setFactors((fs) => fs.map((f) => (f.id === fid ? { ...f, name } : f)));
  const renameLevel = (fid: string, lid: string, name: string) =>
    setFactors((fs) => fs.map((f) => (f.id === fid ? { ...f, levels: f.levels.map((l) => (l.id === lid ? { ...l, name } : l)) } : f)));

  // --- bindings ---
  const [newBlock, setNewBlock] = useState("");
  const [newPath, setNewPath] = useState("");
  const [newFactor, setNewFactor] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  // Collapsed by default — the section gets long once factors/bindings exist.
  const [open, setOpen] = useState(false);
  const newBlk = study.blocks.find((b) => b.instanceId === newBlock);
  const newBlockFields = configFieldKeys(
    newBlk?.config,
    newBlk ? getModuleDef(newBlk.source, newBlk.key, newBlk.version)?.derivedFields ?? [] : [],
  );
  const addBinding = () => {
    if (!newBlock || !newPath.trim() || !newFactor) return;
    commit(factors, [...bindings, { instanceId: newBlock, path: newPath.trim(), factorId: newFactor, valuesByLevel: {} }]);
    setNewPath("");
  };
  const removeBinding = (i: number) => commit(factors, bindings.filter((_, j) => j !== i));
  const setBindingValue = (i: number, levelId: string, value: string) =>
    setBindings((bs) => bs.map((b, j) => (j === i ? { ...b, valuesByLevel: { ...b.valuesByLevel, [levelId]: coerce(value) } } : b)));

  // Per-variant audio (ADR-0058/0069 enhance): render each level's script to its
  // own clip and store the URLs as a system-managed `audioUrl` binding, so each
  // variant plays its own audio (runtime resolves the bound audioUrl per cell).
  const genClip = api.studies.generateAudioClip.useMutation();
  const [audioGen, setAudioGen] = useState<{ key: string; msg: string } | null>(null);
  async function generateLevelAudio(scriptBinding: VariantBinding) {
    const f = factors.find((x) => x.id === scriptBinding.factorId);
    if (!f) return;
    const blk = study.blocks.find((x) => x.instanceId === scriptBinding.instanceId);
    const sharedDesc = ((blk?.config as { description?: string } | undefined)?.description ?? "").trim();
    const descBinding = bindings.find((x) => x.instanceId === scriptBinding.instanceId && x.factorId === scriptBinding.factorId && x.path === "description");
    const key = `${scriptBinding.instanceId}-${scriptBinding.factorId}`;
    setAudioGen({ key, msg: "Generating…" });
    try {
      const values: Record<string, unknown> = {};
      for (const l of f.levels) {
        const scr = String(scriptBinding.valuesByLevel[l.id] ?? "").trim();
        if (!scr) throw new Error(`Add a script for “${l.name}” first.`);
        const desc = descBinding ? String(descBinding.valuesByLevel[l.id] ?? sharedDesc).trim() : sharedDesc;
        const { url } = await genClip.mutateAsync({ studyId: study.id, script: scr, description: desc || undefined });
        values[l.id] = url;
      }
      // Replace any existing audioUrl binding for this block × factor.
      const others = bindings.filter((x) => !(x.instanceId === scriptBinding.instanceId && x.factorId === scriptBinding.factorId && x.path === "audioUrl"));
      commit(factors, [...others, { instanceId: scriptBinding.instanceId, path: "audioUrl", factorId: scriptBinding.factorId, valuesByLevel: values }]);
      setAudioGen({ key, msg: `Generated ${f.levels.length} clip${f.levels.length === 1 ? "" : "s"} ✓` });
    } catch (e) {
      setAudioGen({ key, msg: e instanceof Error ? e.message : "Generation failed." });
    }
  }

  const cells = cellCount(factors);
  const editable = canEdit;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-left"
          >
            {open ? <ChevronDown className="size-4 text-[var(--color-text-muted)]" aria-hidden /> : <ChevronRight className="size-4 text-[var(--color-text-muted)]" aria-hidden />}
            <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Variants</h2>
          </button>
          <button
            type="button"
            aria-label="What are variants? Help"
            title="What are variants?"
            onClick={() => setHelpOpen(true)}
            className="rounded-full p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-secondary)]"
          >
            <HelpCircle className="size-4" aria-hidden />
          </button>
        </div>
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {factors.length === 0 ? "Single variant" : `${cells} combination${cells === 1 ? "" : "s"}`}
          {cells > 12 ? " — large; consider fewer levels" : ""}
        </span>
      </div>

      {open ? (
      <>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        A/B &amp; factorial designs: each participant is randomly assigned one combination. Define factors and bind the fields that vary —
        everything else stays shared (edit it in Blocks).
      </p>

      {/* Factors */}
      <div className="flex flex-col gap-2">
        {factors.map((f) => (
          <div key={f.id} className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
            <div className="flex items-center gap-2">
              <input
                value={f.name}
                disabled={!editable}
                onChange={(e) => renameFactor(f.id, e.target.value)}
                onBlur={() => commit(factors, bindings)}
                className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-primary)]"
              />
              <button type="button" aria-label="Remove factor" title="Remove factor" disabled={!editable} onClick={() => removeFactor(f.id)} className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40">
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {f.levels.map((l) => (
                <span key={l.id} className="flex items-center gap-1 rounded-full bg-[var(--color-surface-subtle)] py-0.5 pl-2 pr-1">
                  <input
                    value={l.name}
                    disabled={!editable}
                    onChange={(e) => renameLevel(f.id, l.id, e.target.value)}
                    onBlur={() => commit(factors, bindings)}
                    className="w-16 bg-transparent text-[length:var(--text-small)] text-[var(--color-text-secondary)] focus:outline-none"
                  />
                  <button type="button" aria-label="Remove level" disabled={!editable || f.levels.length <= 1} onClick={() => removeLevel(f.id, l.id)} className="rounded-full p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)] disabled:opacity-30">
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
              <button type="button" disabled={!editable} onClick={() => addLevel(f.id)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40">
                <Plus className="size-3" aria-hidden /> Level
              </button>
            </div>
          </div>
        ))}
        <button type="button" disabled={!editable} title={editable ? undefined : READ_ONLY_TITLE} onClick={addFactor} className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40">
          <Plus className="size-4" aria-hidden /> Add a variant factor (A/B, 2×2 …)
        </button>
      </div>

      {/* Bindings — the fields that vary */}
      {factors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">Varying fields</h3>
          {bindings.map((b, i) => {
            const f = factors.find((x) => x.id === b.factorId);
            const bindBlk = study.blocks.find((x) => x.instanceId === b.instanceId);
            // `audioUrl` bindings are system-managed (set by "Generate audio for each
            // level") — hide them from the editable list; they're plumbing.
            if (bindBlk?.key === "audio-stimulus" && b.path === "audioUrl") return null;
            // Audio-stimulus script/description: offer per-level voice generation so
            // each variant plays its own clip (otherwise all share the base audio).
            const isAudioScript = bindBlk?.key === "audio-stimulus" && (b.path === "script" || b.path === "description");
            const hasAudioBinding = bindings.some((x) => x.instanceId === b.instanceId && x.factorId === b.factorId && x.path === "audioUrl");
            return (
              <div key={`${b.instanceId}-${b.path}-${i}`} className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                    <span className="font-medium text-[var(--color-text-primary)]">{blockName(b.instanceId)}</span>
                    {" · "}
                    <span className="font-mono">{b.path}</span>
                    {" varies by "}
                    <span className="font-medium">{factorName(b.factorId)}</span>
                  </span>
                  <button type="button" aria-label="Remove varying field" disabled={!editable} onClick={() => removeBinding(i)} className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40">
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(f?.levels ?? []).map((l) => (
                    <label key={l.id} className="flex items-center gap-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                      <span className="w-16 truncate">{l.name}</span>
                      <input
                        defaultValue={b.valuesByLevel[l.id] != null ? String(b.valuesByLevel[l.id]) : ""}
                        disabled={!editable}
                        placeholder="value"
                        onChange={(e) => setBindingValue(i, l.id, e.target.value)}
                        onBlur={() => commit(factors, bindings)}
                        className="w-28 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[var(--color-text-primary)]"
                      />
                    </label>
                  ))}
                </div>
                {isAudioScript && b.path === "script" ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PendingButton
                        variant="secondary"
                        pending={genClip.isPending && audioGen?.key === `${b.instanceId}-${b.factorId}`}
                        idleLabel={hasAudioBinding ? "Regenerate audio for each level" : "Generate audio for each level"}
                        pendingLabel="Generating…"
                        disabled={!editable}
                        onClick={() => generateLevelAudio(b)}
                        className="px-2.5 py-1 text-[length:var(--text-small)]"
                      />
                      {audioGen?.key === `${b.instanceId}-${b.factorId}` ? (
                        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{audioGen.msg}</span>
                      ) : hasAudioBinding ? (
                        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Per-level audio generated ✓</span>
                      ) : null}
                    </div>
                    <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                      Renders each level’s script to its own clip (Hume Octave · your key). Regenerate after editing a script — until you do, all variants play the block’s base audio.
                    </p>
                  </div>
                ) : isAudioScript ? (
                  <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    Regenerate per-level audio from the script row after changing this.
                  </p>
                ) : null}
              </div>
            );
          })}

          {/* Add a binding */}
          <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] p-3">
            <label className="flex flex-col gap-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Block
              <select value={newBlock} disabled={!editable} onChange={(e) => { setNewBlock(e.target.value); setNewPath(""); }} className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[var(--color-text-primary)]">
                <option value="">Choose…</option>
                {study.blocks.map((blk) => (
                  <option key={blk.instanceId} value={blk.instanceId}>{blk.title?.trim() || blk.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Field
              <select value={newPath} disabled={!editable || !newBlock} onChange={(e) => setNewPath(e.target.value)} className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 font-mono text-[var(--color-text-primary)] disabled:opacity-50">
                <option value="">{!newBlock ? "Pick a block first" : newBlockFields.length ? "Choose…" : "No fields — configure the block"}</option>
                {newBlockFields.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Varies by
              <select value={newFactor} disabled={!editable} onChange={(e) => setNewFactor(e.target.value)} className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[var(--color-text-primary)]">
                <option value="">Choose…</option>
                {factors.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!editable || !newBlock || !newPath.trim() || !newFactor} onClick={addBinding} className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-on-primary)] hover:opacity-90 disabled:opacity-40">
              <Plus className="size-4" aria-hidden /> Add field
            </button>
          </div>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Pick the field that should differ between levels (the list comes from that block&rsquo;s settings). Numeric values are stored as numbers.
          </p>
        </div>
      ) : null}
      </>
      ) : null}

      {helpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setHelpOpen(false); }}
        >
          <div role="dialog" aria-modal="true" aria-label="About variants" className="flex max-h-[80vh] w-full max-w-[560px] flex-col gap-3 overflow-auto rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-5 text-left" style={{ boxShadow: "var(--shadow-md)" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">Variants — A/B & factorial designs</h3>
              <button type="button" aria-label="Close" onClick={() => setHelpOpen(false)} className="rounded-[var(--radius-md)] p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"><X className="size-4" aria-hidden /></button>
            </div>
            <div className="flex flex-col gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              <p>Run the <strong>same study</strong> in a few versions that differ only in some data — and have each participant randomly see one of them.</p>
              <ul className="ml-4 flex list-disc flex-col gap-1.5">
                <li><strong>Factor</strong> — the thing you vary, e.g. <em>Social influence</em>.</li>
                <li><strong>Levels</strong> — the values that factor can take, e.g. <em>low</em> and <em>high</em> (these start as <span className="font-mono">A</span>/<span className="font-mono">B</span> — rename them to whatever you&rsquo;re testing).</li>
                <li><strong>Combination</strong> — one pairing of levels. One factor with 2 levels = 2 combinations (A/B); two 2-level factors = 2×2 = <strong>4 combinations</strong>.</li>
                <li><strong>Varying field</strong> — pick a block + the field that changes (e.g. a post&rsquo;s <em>likes</em>), then give it a value per level. Everything else is <strong>shared</strong> — edit it once in Blocks and it applies to every combination.</li>
              </ul>
              <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2">
                <strong>Example.</strong> Factor &ldquo;Social influence&rdquo; with levels low/high → bind the post&rsquo;s <span className="font-mono">likes</span> field → low = 12, high = 9,800. Each participant is randomly shown the low or the high version; results + export include a <span className="font-mono">variant_combination</span> column so you can compare.</p>
              <p className="text-[var(--color-text-muted)]">Not the same as <strong>conditions</strong> (randomised arms inside a study) — conditions can still live inside a variant. Removing all factors returns a plain single-version study.</p>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setHelpOpen(false)} className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-on-primary)] hover:opacity-90">Got it</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
