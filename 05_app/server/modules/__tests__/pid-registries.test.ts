import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchFunders, searchRor } from "@/server/modules/pid-registries";

/**
 * Parsing + degradation for the PID registry lookups (ADR-0108, LOS item ⑩).
 * `fetch` is stubbed — the shapes below are the ones the real ROR v2 /
 * Crossref Funder APIs return, so a shape change is what should break this.
 */
function stubFetch(payload: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => payload }) as unknown as Response);
}

describe("pid-registries — ROR (ADR-0108)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("maps the ror_display name + id + country", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        items: [
          {
            id: "https://ror.org/04dkp9463",
            names: [
              { value: "U Amsterdam legal", types: ["ror_display", "label"] },
              { value: "UvA", types: ["acronym"] },
            ],
            locations: [{ geonames_details: { country_name: "Netherlands" } }],
          },
        ],
      }),
    );
    const hits = await searchRor("amsterdam");
    expect(hits).toEqual([
      { id: "https://ror.org/04dkp9463", name: "U Amsterdam legal", country: "Netherlands" },
    ]);
  });

  it("short-circuits queries under 2 chars without calling fetch", async () => {
    const f = stubFetch({ items: [] });
    vi.stubGlobal("fetch", f);
    expect(await searchRor("a")).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("degrades to [] on a non-ok response", async () => {
    vi.stubGlobal("fetch", stubFetch({}, false));
    expect(await searchRor("oxford")).toEqual([]);
  });

  it("degrades to [] when fetch throws (timeout/network)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("aborted");
      }),
    );
    expect(await searchRor("oxford")).toEqual([]);
  });

  it("skips hits missing an id or any name", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({ items: [{ names: [{ value: "no id" }] }, { id: "https://ror.org/x", names: [] }] }),
    );
    expect(await searchRor("broken")).toEqual([]);
  });
});

describe("pid-registries — Crossref funders (ADR-0108)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("normalises the dx.doi.org uri to https://doi.org/…", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        message: {
          items: [
            { id: "501100000923", name: "Australian Research Council", uri: "http://dx.doi.org/10.13039/501100000923", location: "Australia" },
          ],
        },
      }),
    );
    const hits = await searchFunders("australian research");
    expect(hits).toEqual([
      {
        id: "501100000923",
        name: "Australian Research Council",
        uri: "https://doi.org/10.13039/501100000923",
        country: "Australia",
      },
    ]);
  });

  it("synthesises the DOI from the id when uri is absent", async () => {
    vi.stubGlobal("fetch", stubFetch({ message: { items: [{ id: "100000001", name: "NSF" }] } }));
    const [hit] = await searchFunders("national science");
    expect(hit.uri).toBe("https://doi.org/10.13039/100000001");
  });

  it("degrades to [] on failure", async () => {
    vi.stubGlobal("fetch", stubFetch({}, false));
    expect(await searchFunders("nih")).toEqual([]);
  });
});
