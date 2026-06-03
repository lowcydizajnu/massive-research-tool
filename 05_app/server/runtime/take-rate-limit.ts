import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { rateLimit } from "@/server/adapters/ratelimit";

/**
 * Rate limits for the public, unauthenticated `/take/*` Server Actions
 * (participant-runtime security review #9; ADR-0016). Keys live in the hosted
 * limiter (Upstash) so the cap holds across serverless instances + regions.
 *
 * The coarse-IP bucket is a one-way SHA-256 hash of the first three IPv4 octets
 * (or the whole IPv6 address) + UPSTASH_IP_BUCKET_SALT. It is used ONLY as a
 * limiter key and is NEVER written to Postgres — the ADR-0014 "no participant
 * PII at rest" boundary holds (a salted, truncated, /24-coarse hash isn't
 * stored anywhere durable).
 */
async function coarseIpBucket(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip = ((xff ? xff.split(",")[0] : h.get("x-real-ip")) ?? "").trim();
  const salt = process.env.UPSTASH_IP_BUCKET_SALT ?? "dev-ip-salt";
  // First three octets for IPv4 (a /24 bucket); the whole address otherwise.
  const coarse = ip.includes(".") ? ip.split(".").slice(0, 3).join(".") : ip;
  return createHash("sha256").update(`${salt}:${coarse}`).digest("hex").slice(0, 16);
}

/** 3 starts/min per (recruitment session × coarse-IP) — one IP can't spam a recruitment link. */
export async function allowBegin(recruitmentSessionId: string): Promise<boolean> {
  const bucket = await coarseIpBucket();
  const { allowed } = await rateLimit.limit(`take:begin:${recruitmentSessionId}:${bucket}`, {
    max: 3,
    windowSeconds: 60,
  });
  return allowed;
}

/** 30 answers/min per response — generous for a real participant, caps a fuzzing loop. */
export async function allowAnswer(responseId: string): Promise<boolean> {
  const { allowed } = await rateLimit.limit(`take:answer:${responseId}`, {
    max: 30,
    windowSeconds: 60,
  });
  return allowed;
}
