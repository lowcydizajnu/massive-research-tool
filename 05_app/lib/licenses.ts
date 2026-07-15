/**
 * Study license controlled list (ADR-0100 — the LOS "reusable" metadata gap).
 * Small, curated set of SPDX-style identifiers with human labels + canonical
 * URLs. `experiment.license` stores the id; the record renders label + URL, and
 * the id maps to schema.org `license` (JSON-LD) + the OSF summary text. Keep the
 * list short and identifier-based so it stays machine-mappable (DataCite/OSF).
 */
export type LicenseId =
  | "CC-BY-4.0"
  | "CC-BY-SA-4.0"
  | "CC-BY-NC-4.0"
  | "CC0-1.0"
  | "MIT"
  | "Apache-2.0"
  | "all-rights-reserved";

export type LicenseInfo = { id: LicenseId; label: string; url: string | null };

/** Ordered for the selector — open-science defaults first. */
export const LICENSES: LicenseInfo[] = [
  { id: "CC-BY-4.0", label: "CC BY 4.0 — reuse with attribution", url: "https://creativecommons.org/licenses/by/4.0/" },
  { id: "CC-BY-SA-4.0", label: "CC BY-SA 4.0 — attribution, share-alike", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  { id: "CC-BY-NC-4.0", label: "CC BY-NC 4.0 — attribution, non-commercial", url: "https://creativecommons.org/licenses/by-nc/4.0/" },
  { id: "CC0-1.0", label: "CC0 1.0 — public domain (no rights reserved)", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  { id: "MIT", label: "MIT — permissive (code/materials)", url: "https://opensource.org/license/mit" },
  { id: "Apache-2.0", label: "Apache 2.0 — permissive with patent grant", url: "https://www.apache.org/licenses/LICENSE-2.0" },
  { id: "all-rights-reserved", label: "All rights reserved", url: null },
];

/** The owner-chosen default (ADR-0100) — the open-science norm. */
export const DEFAULT_LICENSE: LicenseId = "CC-BY-4.0";

/** Non-empty tuple of ids for `z.enum(...)` validation on the write path. */
export const LICENSE_IDS = LICENSES.map((l) => l.id) as [LicenseId, ...LicenseId[]];

const BY_ID = new Map(LICENSES.map((l) => [l.id, l] as const));

export function isLicenseId(v: unknown): v is LicenseId {
  return typeof v === "string" && BY_ID.has(v as LicenseId);
}

/** Resolve to display info; unknown/legacy ids render as their raw string with no URL. */
export function licenseInfo(id: string | null | undefined): LicenseInfo {
  if (id && BY_ID.has(id as LicenseId)) return BY_ID.get(id as LicenseId)!;
  return { id: (id as LicenseId) ?? DEFAULT_LICENSE, label: id || DEFAULT_LICENSE, url: null };
}
