/**
 * Canonical public origin + URL builders (ADR-0055 am.1 — crawlable records).
 * Single source for the value otherwise duplicated across the OSF push, email
 * templates, and security.txt. NEXT_PUBLIC_* is baked at build time — a new
 * value needs a fresh HEAD build (memory: vercel-env-needs-fresh-head-build).
 */
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://myresearchlab.app";

export const recordUrl = (studyId: string): string => `${SITE_URL}/browse/${studyId}`;
export const profileUrl = (handle: string): string => `${SITE_URL}/u/${handle}`;
