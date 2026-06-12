"use client";

import {
  ArrowLeftRight,
  ArrowUpDown,
  Boxes,
  Calendar,
  Contact,
  Gauge,
  Globe,
  Hash,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  LayoutList,
  Link2,
  ListChecks,
  ListFilter,
  MapPin,
  Mail,
  MessageSquare,
  Mic,
  MoveHorizontal,
  Phone,
  Puzzle,
  Ruler,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Timer,
  ToggleLeft,
  Trash2,
  Type,
  Users,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Block library modal (block-library-modal.md — supersedes the 360px picker
 * popover): category rail · card grid with icon tiles · details pane. Blocks
 * may live in several categories (tag-derived); "Your blocks" lists the
 * workspace's saved custom modules (ADR-0029).
 */
type Category =
  | "All"
  | "Scales & ratings"
  | "Choice & ranking"
  | "Open text"
  | "Form fields"
  | "Demographics"
  | "Media & stimuli"
  | "Social"
  | "Research tools"
  | "Your blocks";

const CATEGORIES: Category[] = [
  "All",
  "Scales & ratings",
  "Choice & ranking",
  "Open text",
  "Form fields",
  "Demographics",
  "Media & stimuli",
  "Social",
  "Research tools",
  "Your blocks",
];

/** tag → categories (a block belongs to every category any of its tags maps to). */
const TAG_TO_CAT: Record<string, Category[]> = {
  rating: ["Scales & ratings"],
  scale: ["Scales & ratings"],
  matrix: ["Scales & ratings"],
  choice: ["Choice & ranking"],
  ranking: ["Choice & ranking"],
  "open-ended": ["Open text"],
  form: ["Form fields"],
  contact: ["Form fields"],
  custom: ["Form fields"],
  demographics: ["Demographics"],
  content: ["Media & stimuli"],
  stimulus: ["Media & stimuli"],
  media: ["Media & stimuli"],
  instructions: ["Media & stimuli"],
  social: ["Social"],
  misinformation: ["Social"],
  behavioral: ["Research tools"],
  "manipulation-check": ["Research tools"],
  "attention-check": ["Research tools"],
  quality: ["Research tools"],
};

function categoriesOf(tags: string[]): Category[] {
  const cats = new Set<Category>();
  for (const t of tags) for (const c of TAG_TO_CAT[t] ?? []) cats.add(c);
  if (cats.size === 0) cats.add("Research tools");
  return [...cats];
}

const BLOCK_ICON: Record<string, LucideIcon> = {
  "likert-7": Ruler,
  slider: SlidersHorizontal,
  "multiple-choice": ListChecks,
  "free-text": Type,
  ranking: ArrowUpDown,
  "attention-check": ShieldCheck,
  demographics: Users,
  text: Type,
  image: ImageIcon,
  video: Video,
  link: Link2,
  email: Mail,
  url: Globe,
  number: Hash,
  date: Calendar,
  "yes-no": ToggleLeft,
  dropdown: ListFilter,
  phone: Phone,
  address: MapPin,
  "field-group": LayoutList,
  contact: Contact,
  "picture-choice": Images,
  nps: Gauge,
  "rating-stars": Star,
  vas: MoveHorizontal,
  "matrix-grid": LayoutGrid,
  "semantic-differential": ArrowLeftRight,
  "reaction-time": Timer,
  maxdiff: Scale,
  "audio-record": Mic,
  "social-post": MessageSquare,
};

/** Category-tinted tile colors — token pairs only (design-rules). */
const CAT_TILE: Record<Category, string> = {
  All: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
  "Scales & ratings": "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]",
  "Choice & ranking": "bg-[var(--color-accent-subtle)] text-[var(--color-accent-text-on-subtle)]",
  "Open text": "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]",
  "Form fields": "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
  Demographics: "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]",
  "Media & stimuli": "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]",
  Social: "bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]",
  "Research tools": "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]",
  "Your blocks": "bg-[var(--color-accent-subtle)] text-[var(--color-accent-text-on-subtle)]",
};

const RECENT_KEY = "mrt-recent-blocks";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function pushRecent(key: string) {
  try {
    const next = [key, ...readRecent().filter((k) => k !== key)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

type CustomModule = { id: string; name: string; blockCount: number };

export function BlockLibraryModal({
  onInsert,
  onClose,
  pending,
  customModules = [],
  onInsertCustomModule,
  onRemoveCustomModule,
  insertingModule = false,
}: {
  onInsert: (m: { source: string; key: string; version: string }) => void;
  onClose: () => void;
  pending: boolean;
  customModules?: CustomModule[];
  onInsertCustomModule?: (id: string) => void;
  onRemoveCustomModule?: (id: string) => void;
  insertingModule?: boolean;
}) {
  const { data: modules, isLoading } = api.modules.list.useQuery(undefined, {
    refetchOnMount: "always",
    staleTime: 0,
  });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category>("All");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(readRecent());
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refOf = (m: { source: string; key: string; version: string }) =>
    `${m.source}/${m.key}@${m.version}`;

  const all = useMemo(
    () => (modules ?? []).map((m) => ({ ...m, cats: categoriesOf(m.categoryTags) })),
    [modules],
  );

  const counts = useMemo(() => {
    const c = new Map<Category, number>([["All", all.length], ["Your blocks", customModules.length]]);
    for (const m of all) for (const k of m.cats) c.set(k, (c.get(k) ?? 0) + 1);
    return c;
  }, [all, customModules.length]);

  const ql = q.trim().toLowerCase();
  const matches = (text: string) => !ql || text.toLowerCase().includes(ql);
  const filtered = all.filter(
    (m) => (cat === "All" || m.cats.includes(cat)) && matches(`${m.name} ${m.description} ${m.key}`),
  );
  const filteredCustom =
    cat === "All" || cat === "Your blocks"
      ? customModules.filter((m) => matches(m.name))
      : [];

  const selected = all.find((m) => refOf(m) === selectedRef) ?? null;
  const selectedCustom = customModules.find((m) => `custom:${m.id}` === selectedRef) ?? null;

  const recentBlocks =
    cat === "All" && !ql
      ? recent.map((k) => all.find((m) => m.key === k)).filter((m): m is (typeof all)[number] => !!m)
      : [];

  const insert = (m: { source: string; key: string; version: string }) => {
    pushRecent(m.key);
    setRecent(readRecent());
    onInsert(m);
  };

  const tileFor = (cats: Category[]) => CAT_TILE[cats[0] ?? "All"];

  const Card = ({
    id,
    icon: Icon,
    tile,
    title,
    desc,
    badge,
    onPick,
    onAdd,
  }: {
    id: string;
    icon: LucideIcon;
    tile: string;
    title: string;
    desc: string;
    badge: string;
    onPick: () => void;
    onAdd: () => void;
  }) => (
    <button
      type="button"
      role="option"
      aria-selected={selectedRef === id}
      onClick={onPick}
      onDoubleClick={onAdd}
      className={cn(
        "flex flex-col gap-2 rounded-[var(--radius-md)] border p-3 text-left transition-colors",
        selectedRef === id
          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]/40"
          : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
      )}
    >
      <span className={cn("flex size-9 items-center justify-center rounded-[var(--radius-md)]", tile)}>
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="text-[length:var(--text-body-emphasis)] font-medium leading-tight text-[var(--color-text-primary)]">
        {title}
      </span>
      <span className="line-clamp-2 text-[length:var(--text-small)] leading-snug text-[var(--color-text-muted)]">
        {desc}
      </span>
      <span className="mt-auto self-start rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        {badge}
      </span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a block"
        className="flex h-[min(620px,85vh)] w-full max-w-[880px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3">
          <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Add a block</h2>
          <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5">
            <Search className="size-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search blocks…"
              aria-label="Search blocks"
              className="w-full bg-transparent text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Category rail */}
          <nav aria-label="Block categories" className="flex w-[180px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--color-border-subtle)] p-2">
            {CATEGORIES.map((c) => {
              const n = counts.get(c) ?? 0;
              if (c !== "All" && c !== "Your blocks" && n === 0) return null;
              return (
                <button
                  key={c}
                  type="button"
                  aria-current={cat === c ? "true" : undefined}
                  onClick={() => {
                    setCat(c);
                    setSelectedRef(null);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-[length:var(--text-body)]",
                    cat === c
                      ? "bg-[var(--color-primary-subtle)] font-medium text-[var(--color-primary-text-on-subtle)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                  )}
                >
                  <span className="truncate">{c}</span>
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{n}</span>
                </button>
              );
            })}
          </nav>

          {/* Card grid */}
          <div className="min-w-0 flex-1 overflow-y-auto p-3" role="listbox" aria-label="Blocks">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-32 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]" />
                ))}
              </div>
            ) : (
              <>
                {recentBlocks.length > 0 ? (
                  <>
                    <div className="px-1 pb-1 text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      Recently used
                    </div>
                    <div className="grid grid-cols-2 gap-2 pb-3 xl:grid-cols-3">
                      {recentBlocks.map((m) => (
                        <Card
                          key={`r-${refOf(m)}`}
                          id={refOf(m)}
                          icon={BLOCK_ICON[m.key] ?? Puzzle}
                          tile={tileFor(m.cats)}
                          title={m.name}
                          desc={m.description}
                          badge={m.collectsResponse ? "Records data" : "Stimulus"}
                          onPick={() => setSelectedRef(refOf(m))}
                          onAdd={() => insert(m)}
                        />
                      ))}
                    </div>
                    <div className="px-1 pb-1 text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      All blocks
                    </div>
                  </>
                ) : null}
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                  {filtered.map((m) => (
                    <Card
                      key={refOf(m)}
                      id={refOf(m)}
                      icon={BLOCK_ICON[m.key] ?? Puzzle}
                      tile={tileFor(m.cats)}
                      title={m.name}
                      desc={m.description}
                      badge={m.collectsResponse ? "Records data" : "Stimulus"}
                      onPick={() => setSelectedRef(refOf(m))}
                      onAdd={() => insert(m)}
                    />
                  ))}
                  {filteredCustom.map((m) => (
                    <Card
                      key={`custom:${m.id}`}
                      id={`custom:${m.id}`}
                      icon={Boxes}
                      tile={CAT_TILE["Your blocks"]}
                      title={m.name}
                      desc={`Your saved module · ${m.blockCount} block${m.blockCount === 1 ? "" : "s"} (copied on insert)`}
                      badge="Your blocks"
                      onPick={() => setSelectedRef(`custom:${m.id}`)}
                      onAdd={() => onInsertCustomModule?.(m.id)}
                    />
                  ))}
                </div>
                {filtered.length === 0 && filteredCustom.length === 0 ? (
                  <p className="p-6 text-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {cat === "Your blocks" && !ql
                      ? "Nothing saved yet — use “Save as reusable block” on a block, or “Save as module” on a group."
                      : "No blocks match — try another word or category."}
                  </p>
                ) : null}
              </>
            )}
          </div>

          {/* Details pane */}
          {selected || selectedCustom ? (
            <aside className="flex w-[240px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-[var(--color-border-subtle)] p-4">
              {selected ? (
                <>
                  <span className={cn("flex size-12 items-center justify-center rounded-[var(--radius-md)]", tileFor(selected.cats))}>
                    {(() => {
                      const Icon = BLOCK_ICON[selected.key] ?? Puzzle;
                      return <Icon className="size-6" aria-hidden />;
                    })()}
                  </span>
                  <div>
                    <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                      {selected.name}
                    </h3>
                    <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">v{selected.version}</p>
                  </div>
                  <p className="text-[length:var(--text-small)] leading-snug text-[var(--color-text-secondary)]">
                    {selected.description}
                  </p>
                  <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                    {selected.collectsResponse
                      ? "Records a participant answer — it appears in Results and the data export."
                      : "Stimulus only — shown to participants, records nothing."}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selected.cats.map((c) => (
                      <span key={c} className={cn("rounded-full px-2 py-0.5 text-[length:var(--text-small)]", CAT_TILE[c])}>
                        {c}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => insert(selected)}
                    className="mt-auto rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {pending ? "Adding…" : "+ Add to study"}
                  </button>
                </>
              ) : selectedCustom ? (
                <>
                  <span className={cn("flex size-12 items-center justify-center rounded-[var(--radius-md)]", CAT_TILE["Your blocks"])}>
                    <Boxes className="size-6" aria-hidden />
                  </span>
                  <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                    {selectedCustom.name}
                  </h3>
                  <p className="text-[length:var(--text-small)] leading-snug text-[var(--color-text-secondary)]">
                    Your saved module with {selectedCustom.blockCount} block
                    {selectedCustom.blockCount === 1 ? "" : "s"}. Inserting copies it into this study — later edits
                    here never change the saved module.
                  </p>
                  <button
                    type="button"
                    disabled={insertingModule}
                    onClick={() => onInsertCustomModule?.(selectedCustom.id)}
                    className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {insertingModule ? "Adding…" : "+ Add to study"}
                  </button>
                  {onRemoveCustomModule ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedCustom.id)}
                      className="flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-danger-text-on-subtle)] hover:bg-[var(--color-danger-subtle)]"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Delete module
                    </button>
                  ) : null}
                </>
              ) : null}
            </aside>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this saved module?"
        body="It disappears from the library for everyone in the workspace. Studies that already use it keep their copies."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          if (confirmDeleteId) onRemoveCustomModule?.(confirmDeleteId);
          setConfirmDeleteId(null);
          setSelectedRef(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
