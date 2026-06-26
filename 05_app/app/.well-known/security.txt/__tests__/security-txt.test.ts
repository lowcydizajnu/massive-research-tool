import { describe, expect, it } from "vitest";

import { GET } from "../route";

describe("security.txt (ADR-0072 PF1.3)", () => {
  it("serves RFC 9116 plaintext with the required fields", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    expect(body).toMatch(/^Contact: mailto:security@myresearchlab\.app$/m);
    expect(body).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
    expect(body).toMatch(/^Canonical: https:\/\/myresearchlab\.app\/\.well-known\/security\.txt$/m);
    expect(body).toMatch(/^Policy: https:\/\/myresearchlab\.app\/security$/m);
  });
});
