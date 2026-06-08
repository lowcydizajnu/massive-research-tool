import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/** Data the study PDF renders — gathered server-side from our own tables. */
export type StudyPdfData = {
  title: string;
  author: { name: string; affiliation: string | null; orcid: string | null };
  status: string;
  versionLabel: string;
  abstract: string;
  hypotheses: string[];
  sections: { heading: string; contentMd: string }[];
  blocks: { name: string; ref: string; prompt?: string }[];
  prereg: { doi: string | null; url: string | null } | null;
  year: number;
};

// Literal print colours — @react-pdf can't read CSS variables; the design-token
// rule is for web surfaces (ADR-0027). Warm-neutral to echo the app's parchment.
const ink = "#1c1a17";
const muted = "#6b6457";
const rule = "#e0d9cc";

const s = StyleSheet.create({
  page: { paddingTop: 64, paddingBottom: 56, paddingHorizontal: 64, fontSize: 11, color: ink, fontFamily: "Helvetica", lineHeight: 1.5 },
  brand: { fontSize: 9, color: muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 24 },
  title: { fontSize: 24, fontFamily: "Times-Roman", marginBottom: 8 },
  meta: { fontSize: 10, color: muted, marginBottom: 2 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 22, marginBottom: 6 },
  para: { marginBottom: 8 },
  hyp: { flexDirection: "row", marginBottom: 6 },
  hypNum: { width: 28, fontFamily: "Helvetica-Bold" },
  blockItem: { marginBottom: 10 },
  blockName: { fontFamily: "Helvetica-Bold" },
  blockRef: { fontSize: 9, color: muted, fontFamily: "Courier" },
  divider: { borderBottomWidth: 1, borderBottomColor: rule, marginVertical: 14 },
  footer: { position: "absolute", bottom: 28, left: 64, right: 64, fontSize: 8, color: muted, borderTopWidth: 1, borderTopColor: rule, paddingTop: 6 },
});

function paragraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

/** The study export document (V1.12 B2, ADR-0027). */
export function StudyPdfDocument({ data }: { data: StudyPdfData }) {
  const cite =
    `${data.author.name || "Anonymous"} (${data.year}). ${data.title}. Massive Research Lab.` +
    (data.prereg?.doi ? ` ${data.prereg.doi}` : "");

  return (
    <Document title={data.title} author={data.author.name || undefined}>
      <Page size="A4" style={s.page}>
        <Text style={s.brand} fixed>
          Massive Research Lab — study document
        </Text>

        <Text style={s.title}>{data.title}</Text>
        {data.author.name ? <Text style={s.meta}>{data.author.name}</Text> : null}
        {data.author.affiliation ? <Text style={s.meta}>{data.author.affiliation}</Text> : null}
        {data.author.orcid ? <Text style={s.meta}>ORCID: {data.author.orcid}</Text> : null}
        <Text style={s.meta}>
          {data.status} · {data.versionLabel}
        </Text>

        <View style={s.divider} />

        {data.abstract ? (
          <View>
            <Text style={s.h2}>Abstract</Text>
            {paragraphs(data.abstract).map((p, i) => (
              <Text key={i} style={s.para}>
                {p}
              </Text>
            ))}
          </View>
        ) : null}

        {data.hypotheses.length > 0 ? (
          <View>
            <Text style={s.h2}>Hypotheses</Text>
            {data.hypotheses.map((h, i) => (
              <View key={i} style={s.hyp}>
                <Text style={s.hypNum}>H{i + 1}</Text>
                <Text style={{ flex: 1 }}>{h}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.sections.map((sec, i) => (
          <View key={i} wrap={false}>
            <Text style={s.h2}>{sec.heading || "Section"}</Text>
            {paragraphs(sec.contentMd).map((p, j) => (
              <Text key={j} style={s.para}>
                {p}
              </Text>
            ))}
          </View>
        ))}

        <View style={s.divider} />
        <Text style={s.h2}>Instrument — {data.blocks.length} block(s)</Text>
        {data.blocks.map((b, i) => (
          <View key={i} style={s.blockItem} wrap={false}>
            <Text>
              <Text style={s.blockName}>
                {i + 1}. {b.name}
              </Text>{" "}
              <Text style={s.blockRef}>{b.ref}</Text>
            </Text>
            {b.prompt ? <Text style={{ color: muted }}>{b.prompt}</Text> : null}
          </View>
        ))}

        {data.prereg?.url || data.prereg?.doi ? (
          <View>
            <View style={s.divider} />
            <Text style={s.h2}>Preregistration</Text>
            {data.prereg.doi ? <Text style={s.para}>DOI: {data.prereg.doi}</Text> : null}
            {data.prereg.url ? <Text style={s.para}>{data.prereg.url}</Text> : null}
          </View>
        ) : null}

        <View>
          <View style={s.divider} />
          <Text style={s.h2}>To cite this study</Text>
          <Text style={s.para}>{cite}</Text>
        </View>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${data.title} · page ${pageNumber} of ${totalPages} · generated by Massive Research Lab`
          }
        />
      </Page>
    </Document>
  );
}
