import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/** Data the acceptances receipt renders — gathered server-side from our tables. */
export type AcceptancesPdfData = {
  email: string;
  displayName: string;
  generatedOn: string;
  rows: { title: string; version: number; acceptedOn: string; inForce: boolean }[];
};

// Literal print colours — @react-pdf can't read CSS variables (ADR-0027).
const ink = "#1c1a17";
const muted = "#6b6457";
const rule = "#e0d9cc";

const s = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 56, paddingHorizontal: 56, fontSize: 11, color: ink, fontFamily: "Helvetica" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  sub: { fontSize: 10, color: muted, marginBottom: 2 },
  spacer: { height: 20 },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: ink, paddingBottom: 4, marginBottom: 4 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: rule, paddingVertical: 6 },
  cDoc: { width: "44%" },
  cVer: { width: "14%" },
  cDate: { width: "26%" },
  cStatus: { width: "16%", color: muted },
  th: { fontSize: 9, color: muted, textTransform: "uppercase" },
  footer: { position: "absolute", bottom: 32, left: 56, right: 56, fontSize: 8, color: muted, borderTopWidth: 1, borderTopColor: rule, paddingTop: 6 },
});

/** Acceptance receipt PDF (legal-baseline LG4). */
export function AcceptancesPdfDocument({ data }: { data: AcceptancesPdfData }) {
  return (
    <Document title={`Legal acceptances — ${data.email}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Record of legal acceptances</Text>
        <Text style={s.sub}>My Research Lab</Text>
        <Text style={s.sub}>
          {data.displayName} ({data.email})
        </Text>
        <Text style={s.sub}>Generated {data.generatedOn}</Text>

        <View style={s.spacer} />

        <View style={s.thead}>
          <Text style={[s.cDoc, s.th]}>Document</Text>
          <Text style={[s.cVer, s.th]}>Version</Text>
          <Text style={[s.cDate, s.th]}>Accepted</Text>
          <Text style={[s.cStatus, s.th]}>Status</Text>
        </View>

        {data.rows.map((r, i) => (
          <View key={i} style={s.row}>
            <Text style={s.cDoc}>{r.title}</Text>
            <Text style={s.cVer}>v{r.version}</Text>
            <Text style={s.cDate}>{r.acceptedOn}</Text>
            <Text style={s.cStatus}>{r.inForce ? "In force" : "Superseded"}</Text>
          </View>
        ))}

        <Text style={s.footer} fixed>
          This document is an automatically generated record of the legal documents accepted under this account. For the
          full text of any version, see myresearchlab.app/legal.
        </Text>
      </Page>
    </Document>
  );
}
