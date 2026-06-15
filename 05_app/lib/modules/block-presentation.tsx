/**
 * Shared block presentation helpers (V1.13.0 Stream D enrichment): the per-block
 * icon map + the participant-preview config/skip helpers. Used by the Library
 * Modules detail panel (interactive preview) and intended for the Builder's
 * block-library-modal too.
 *
 * NOTE: block-library-modal.tsx still has a local copy of BLOCK_ICON /
 * previewConfig / NO_PREVIEW that predates this module — migrate it to import
 * from here in a follow-up (kept untouched here to avoid churning that large
 * committed component in this pass).
 */
import {
  ArrowLeftRight,
  ArrowUpDown,
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
  type LucideIcon,
  Mail,
  MapPin,
  MessageSquare,
  Mic,
  MoveHorizontal,
  Phone,
  Puzzle,
  Ruler,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Timer,
  ToggleLeft,
  Type,
  Users,
  Video,
} from "lucide-react";

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

/** The icon for a block key, or a neutral fallback. */
export function blockIcon(key: string): LucideIcon {
  return BLOCK_ICON[key] ?? Puzzle;
}

/** Sample copy so the participant preview isn't a wall of empty fields. */
export function previewConfig(key: string, defaultConfig: Record<string, unknown>): Record<string, unknown> {
  const c: Record<string, unknown> = { ...defaultConfig };
  const fill = (k: string, v: unknown) => {
    if (c[k] === "" || c[k] == null) c[k] = v;
  };
  fill("prompt", "How do you feel about this topic?");
  if (key === "social-post") {
    fill("headline", "Scientists publish surprising new finding");
    fill("body", "This is what your participants will see in the feed.");
    fill("source", "Research Daily");
    if (!c.likesCount) c.likesCount = 24;
    if (!c.commentsCount) c.commentsCount = 6;
  }
  if (key === "text") fill("body", "This is a sample instruction paragraph participants will read.");
  return c;
}

/** Blocks whose preview is meaningless without researcher-supplied media. */
export const NO_PREVIEW = new Set(["image", "video", "link", "audio-record", "reaction-time"]);
