import { execSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/** True iff git would ignore `path` (exit 0 from check-ignore), relative to cwd. */
function gitIgnored(path: string): boolean {
  try {
    execSync(`git check-ignore -q ${path}`, { cwd: process.cwd(), stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe(".env.production secret hygiene (ADR-0016 deploy bootstrap)", () => {
  it("ignores the real .env.production — API keys must never be committed", () => {
    expect(gitIgnored(".env.production")).toBe(true);
  });

  it("tracks the .env.production.example shape (committed, no secrets)", () => {
    expect(gitIgnored(".env.production.example")).toBe(false);
  });
});
