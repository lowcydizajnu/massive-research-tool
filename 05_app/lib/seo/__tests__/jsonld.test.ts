import { describe, expect, it } from "vitest";

import { dataCiteResourceType, studyRecordJsonLd } from "@/lib/seo/jsonld";
import type { PublicStudyDetail } from "@/server/trpc/routers/studies";

/**
 * Findability PIDs in the record JSON-LD (ADR-0108, LOS item ⑩): inLanguage,
 * funder@id, author.affiliation@id (ROR), and the derived DataCite type. Only
 * the fields these assertions touch matter, so the base is cast — the point is
 * the shape of the emitted schema.org, not the whole detail object.
 */
function detail(over: Partial<PublicStudyDetail> = {}): PublicStudyDetail {
  return {
    studyId: "11111111-1111-1111-1111-111111111111",
    title: "A study",
    authorId: "u1",
    authorName: "Dr Ada",
    authorOrcid: null,
    authorAffiliation: null,
    authorRor: null,
    language: null,
    funders: [],
    license: "CC-BY-4.0",
    tags: [],
    latestKind: "published",
    latestVersionNumber: 1,
    registrationWithdrawn: false,
    registrationDoi: null,
    registrationUrl: null,
    preregistrations: [],
    replicationCount: 0,
    finishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    overview: { abstract: "An abstract", sections: [] },
    conditions: [],
    blocks: [],
    materials: [],
    record: null,
    ...over,
  } as PublicStudyDetail;
}

describe("studyRecordJsonLd — findability PIDs (ADR-0108)", () => {
  it("emits inLanguage when a language is set, and omits it otherwise", () => {
    expect(studyRecordJsonLd(detail({ language: "es" })).inLanguage).toBe("es");
    expect(studyRecordJsonLd(detail()).inLanguage).toBeUndefined();
  });

  it("emits funders as Organizations carrying the Crossref DOI as @id", () => {
    const ld = studyRecordJsonLd(
      detail({
        funders: [
          { name: "NSF", id: "100000001", uri: "https://doi.org/10.13039/100000001" },
          { name: "A local charity", id: "", uri: "" },
        ],
      }),
    );
    expect(ld.funder).toEqual([
      { "@type": "Organization", name: "NSF", "@id": "https://doi.org/10.13039/100000001" },
      { "@type": "Organization", name: "A local charity" }, // free-text funder: no @id
    ]);
  });

  it("omits funder entirely when there are none", () => {
    expect(studyRecordJsonLd(detail()).funder).toBeUndefined();
  });

  it("attaches the affiliation with its ROR id as @id on the author", () => {
    const author = studyRecordJsonLd(
      detail({ authorAffiliation: "University of X", authorRor: "https://ror.org/012a3b456" }),
    ).author as Record<string, unknown>;
    expect(author.affiliation).toEqual({
      "@type": "Organization",
      name: "University of X",
      "@id": "https://ror.org/012a3b456",
    });
  });

  it("emits affiliation without @id when the ROR is unknown", () => {
    const author = studyRecordJsonLd(detail({ authorAffiliation: "Independent" })).author as Record<string, unknown>;
    expect(author.affiliation).toEqual({ "@type": "Organization", name: "Independent" });
  });
});

describe("dataCiteResourceType (ADR-0108)", () => {
  it("ranks a published dataset first", () => {
    expect(
      dataCiteResourceType(detail({ record: { abstract: null, articleUrl: null, articleDoi: null, publishedAt: null, dataTable: { headers: ["a"], rows: [["1"]] }, layout: [] } })),
    ).toBe("Dataset");
  });

  it("is Text for an article-linked record", () => {
    expect(
      dataCiteResourceType(detail({ record: { abstract: null, articleUrl: null, articleDoi: "10.1/x", publishedAt: null, dataTable: null, layout: [] } })),
    ).toBe("Text");
  });

  it("is StudyRegistration for a preregistered study", () => {
    expect(dataCiteResourceType(detail({ registrationDoi: "10.17605/OSF.IO/ABCDE" }))).toBe("StudyRegistration");
  });

  it("falls back to Text for a bare record", () => {
    expect(dataCiteResourceType(detail())).toBe("Text");
  });
});
