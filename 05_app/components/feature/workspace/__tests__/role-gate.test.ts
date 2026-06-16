import { describe, expect, it } from "vitest";

import { canWriteRole } from "@/components/feature/workspace/role-gate";

/**
 * The client write-gate mirrors writeProcedure (T3.5): only `viewer` is
 * read-only; everyone above can write. Undefined (role still loading) is
 * optimistic so editors don't see controls flash disabled.
 */
describe("canWriteRole", () => {
  it("blocks viewers, allows editor/admin/owner", () => {
    expect(canWriteRole("viewer")).toBe(false);
    expect(canWriteRole("editor")).toBe(true);
    expect(canWriteRole("admin")).toBe(true);
    expect(canWriteRole("owner")).toBe(true);
  });

  it("is optimistic while the role is unknown (loading)", () => {
    expect(canWriteRole(undefined)).toBe(true);
  });
});
