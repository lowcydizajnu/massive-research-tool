import { AmendmentHistory } from "@/components/feature/study-record/amendment-history";
import { ClaimChip } from "@/components/feature/study-record/claim-chip";
import { HypothesisChips } from "@/components/feature/study-record/hypothesis-chips";
import { PublicDataTable } from "@/components/feature/study-record/public-data-table";
import { RecordMarkdown } from "@/components/feature/study-record/record-markdown";
import { licenseInfo } from "@/lib/licenses";
import { sectionType } from "@/lib/study-record/sections";
import type { PublicStudyDetail } from "@/server/trpc/routers/studies";

/**
 * Renders a Study Record's body sections from a `PublicStudyDetail` (ADR-0056).
 * Shared by the public read page (`/browse/[studyId]`) AND the composer Preview,
 * so "preview === published" by construction (ADR-0056 C). Composed layout when a
 * record is published; otherwise the default bound composition. Markdown +
 * hypotheses + data table render via client islands; this wrapper is server-safe.
 */
export function RecordSections({ detail }: { detail: PublicStudyDetail }) {
  return (
    <>
      {detail.record ? <ComposedRecord detail={detail} /> : <DefaultRecord detail={detail} />}
      <LicenseFooter license={detail.license} />
    </>
  );
}

/** Reuse-terms footer (ADR-0100 — LOS "reusable"). Renders the study license as a
 *  labelled link (or plain label for all-rights-reserved). */
function LicenseFooter({ license }: { license: string }) {
  const info = licenseInfo(license);
  return (
    <section className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border-subtle)] pt-4 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
      <span>License:</span>
      {info.url ? (
        <a href={info.url} target="_blank" rel="noreferrer" className="font-medium text-[var(--color-primary)] hover:opacity-90">
          {info.label}
        </a>
      ) : (
        <span className="text-[var(--color-text-secondary)]">{info.label}</span>
      )}
    </section>
  );
}

/** Default bound composition (Slice 1) — shown until the owner publishes a composed record. */
function DefaultRecord({ detail }: { detail: PublicStudyDetail }) {
  return (
    <>
      {detail.overview.abstract ? (
        <Section title="Abstract">
          <p className="whitespace-pre-wrap text-[length:var(--text-body)] text-[var(--color-text-primary)]">{detail.overview.abstract}</p>
        </Section>
      ) : null}
      <MethodSection detail={detail} />
      {/* ADR-0102 D4: gate on "has ≥1 preregistered version", not on the latest
          frozen version being one — a published study's plan must still show. */}
      {detail.preregistrations.length > 0 ? (
        <Section title="Preregistration">
          <PreregistrationBody detail={detail} />
        </Section>
      ) : null}
      <ProtocolSection detail={detail} />
    </>
  );
}

/** The preregistration note + OSF identifiers row (registration DOI + link back to
 *  OSF) — the LOS "connect the record" anchor. Shared by the composed + default
 *  compositions so the plan↔record link resolves either way (insight
 *  los-alignment-and-templates). */
function PreregistrationBody({ detail }: { detail: PublicStudyDetail }) {
  // ADR-0102: the operative plan is the NEWEST preregistration — not
  // `latestVersionNumber`, which is the latest *frozen* version and is the
  // published one for any finished study.
  const newest = detail.preregistrations.at(-1);
  const n = newest?.versionNumber ?? detail.latestVersionNumber;
  return (
    <>
      {detail.registrationWithdrawn ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          This study&rsquo;s preregistration (v{n}) was <strong>withdrawn</strong> — its plan is no longer frozen on the registry.
        </p>
      ) : (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          This study was preregistered (v{n}) — its plan was frozen before data collection.
        </p>
      )}
      <OsfIdentifiers detail={detail} />
      <AmendmentHistory plans={detail.preregistrations} />
    </>
  );
}

/** Registration DOI + "View registration on OSF" link, when the registry has
 *  minted/returned them (null until OSF approval). */
function OsfIdentifiers({ detail }: { detail: PublicStudyDetail }) {
  const href = detail.registrationUrl || (detail.registrationDoi ? `https://doi.org/${detail.registrationDoi}` : null);
  if (!href && !detail.registrationDoi) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-small)]">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="font-medium text-[var(--color-primary)] hover:opacity-90">
          View registration on OSF →
        </a>
      ) : null}
      {detail.registrationDoi ? (
        <span className="text-[var(--color-text-secondary)]">
          DOI: <span className="font-mono text-[length:var(--text-mono)]">{detail.registrationDoi}</span>
        </span>
      ) : null}
    </p>
  );
}

/** Composed render (ADR-0056) — sections in the owner's saved order; Markdown
 *  authored content, editable titles, hypotheses, article-in-abstract. */
function ComposedRecord({ detail }: { detail: PublicStudyDetail }) {
  const rec = detail.record!;
  const visible = rec.layout.filter((s) => !s.hidden);
  const heading = (s: (typeof visible)[number]) => s.title?.trim() || sectionType(s.type)?.label || s.type;
  return (
    <>
      {visible.map((s, i) => {
        const key = `${s.type}-${i}`;
        const title = heading(s);
        switch (s.type) {
          case "abstract": {
            const text = rec.abstract || detail.overview.abstract;
            if (!text && !rec.articleUrl && !rec.articleDoi) return null;
            return (
              <Section key={key} title={title}>
                {text ? <RecordMarkdown md={text} /> : null}
                {rec.articleUrl || rec.articleDoi ? (
                  <p className="text-[length:var(--text-small)]">
                    {rec.articleUrl ? <a href={rec.articleUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:opacity-90">{rec.articleUrl}</a> : null}
                    {rec.articleDoi ? <span className="ml-2 text-[var(--color-text-secondary)]">DOI: {rec.articleDoi}</span> : null}
                  </p>
                ) : null}
              </Section>
            );
          }
          case "hypotheses":
            return (
              <Section key={key} title={title}>
                {/* ADR-0102 — the claim's status and its referent. This is the only
                    place the record says "Preregistered", and it says it because
                    the binding resolves, never because anyone typed it. Hypotheses
                    exist solely as an authored section, so DefaultRecord has no
                    counterpart to keep in step. */}
                <ClaimChip claim={s.claim} plans={detail.preregistrations} />
                <HypothesisChips fields={s.fields ?? {}} />
                {s.content ? <RecordMarkdown md={s.content} /> : null}
              </Section>
            );
          case "method":
            return <MethodSection key={key} detail={detail} title={title} override={s.content} />;
          case "preregistration":
            // ADR-0102 D4 — see DefaultRecord.
            return detail.preregistrations.length > 0 ? (
              <Section key={key} title={title}>
                <PreregistrationBody detail={detail} />
              </Section>
            ) : null;
          case "replications":
            return (
              <Section key={key} title={title}>
                {s.content ? <RecordMarkdown md={s.content} /> : null}
                <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  {detail.replicationCount > 0
                    ? `${detail.replicationCount} replication${detail.replicationCount === 1 ? "" : "s"} so far.`
                    : "No replications yet."}
                </p>
              </Section>
            );
          case "results":
            return (
              <Section key={key} title={title}>
                {s.content ? <RecordMarkdown md={s.content} /> : null}
                <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  Aggregate results are shared with replicators; raw participant data stays private (ADR-0014).
                </p>
              </Section>
            );
          case "data":
            return (
              <Section key={key} title={title}>
                {s.content ? <RecordMarkdown md={s.content} /> : null}
                {rec.dataTable ? (
                  <PublicDataTable headers={rec.dataTable.headers} rows={rec.dataTable.rows} title={detail.title} />
                ) : (
                  <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    Aggregate results are shared with replicators; the response dataset isn’t published for this study.
                  </p>
                )}
              </Section>
            );
          case "materials":
            return s.content || detail.materials.length > 0 ? (
              <Section key={key} title={title}>
                {s.content ? <RecordMarkdown md={s.content} /> : null}
                {detail.materials.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {detail.materials.map((m) => (
                      <a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="flex flex-col gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:opacity-90">
                        {m.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt={m.label} className="h-24 w-24 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] object-cover" />
                        ) : (
                          <span className="flex h-24 w-24 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">{m.kind}</span>
                        )}
                        <span className="w-24 truncate">{m.label}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </Section>
            ) : null;
          // narrative / custom / article-link (legacy) — authored Markdown.
          default:
            return s.content || (s.type === "article-link" && (rec.articleUrl || rec.articleDoi)) ? (
              <Section key={key} title={title}>
                {s.content ? <RecordMarkdown md={s.content} /> : null}
                {s.type === "article-link" && (rec.articleUrl || rec.articleDoi) ? (
                  <p className="text-[length:var(--text-small)]">
                    {rec.articleUrl ? <a href={rec.articleUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:opacity-90">{rec.articleUrl}</a> : null}
                    {rec.articleDoi ? <span className="ml-2 text-[var(--color-text-secondary)]">DOI: {rec.articleDoi}</span> : null}
                  </p>
                ) : null}
              </Section>
            ) : null;
        }
      })}
    </>
  );
}

/** Bound Method section — overview narrative + conditions (the comparable
 *  skeleton), with an optional editable title + authored override note (ADR-0056). */
function MethodSection({ detail, title = "Method", override }: { detail: PublicStudyDetail; title?: string; override?: string }) {
  if (!override && detail.overview.sections.length === 0 && detail.conditions.length === 0) return null;
  return (
    <Section title={title}>
      {override ? <RecordMarkdown md={override} /> : null}
      <div className="flex flex-col gap-3">
        {detail.overview.sections.map((s, i) => (
          <div key={i} className="flex flex-col gap-1">
            <h3 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{s.heading}</h3>
            <p className="whitespace-pre-wrap text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{s.contentMd}</p>
          </div>
        ))}
        {detail.conditions.length > 0 ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">Conditions ({detail.conditions.length})</h3>
            <ul className="flex flex-wrap gap-2">
              {detail.conditions.map((c, i) => (
                <li key={i} className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/** Bound Protocol section — the version's blocks (names + refs). */
function ProtocolSection({ detail }: { detail: PublicStudyDetail }) {
  return (
    <Section title="Protocol">
      {detail.blocks.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">This version has no blocks.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {detail.blocks.map((b) => (
            <li key={b.instanceId} className="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
              <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">{b.name}</span>
              <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">{b.ref}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-4 first:border-t-0 first:pt-0">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">{title}</h2>
      {children}
    </section>
  );
}
