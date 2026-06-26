/**
 * Legal document content + versions (ADR-0073 / legal-baseline LG1).
 *
 * Content is OWNER-AUTHORED. The V1 baseline below was drafted for the indie-solo
 * launch (controller: Paweł Rosner, Poland) tailored to the actual stack — NOT
 * lawyer-reviewed. Get a lawyer review before the first institutional contract,
 * first paid revenue, or enabling Hume voice analysis publicly (ADR-0073).
 *
 * Stored as TS modules (not runtime-read .md) for Vercel file-tracing reliability.
 * Versioning: keep every published version (audit-safe — a researcher who accepted
 * v1 can always retrieve it); `CURRENT_LEGAL_VERSION` points at the in-force one,
 * and bumping it (after adding the new version entry) triggers the re-prompt flow.
 *
 * Markdown note: no backticks in bodies (these are TS template literals).
 */
export type LegalKind = "terms" | "privacy" | "cookies";

export type LegalDoc = {
  version: number;
  effectiveDate: string; // ISO date
  summaryOfChanges: string;
  body: string; // markdown
};

export const LEGAL_TITLES: Record<LegalKind, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  cookies: "Cookie Policy",
};

/** In-force version per kind. Bump only after adding the new version entry below. */
export const CURRENT_LEGAL_VERSION: Record<LegalKind, number> = {
  terms: 1,
  privacy: 1,
  cookies: 1,
};

const TERMS_V1 = `
Massive Research Lab ("the Service", "we", "us") is operated by **Paweł Rosner**, a sole proprietor based in **Poland** ("the Operator"). By creating an account or using the Service you ("you", "the Researcher") agree to these Terms. If you do not agree, do not use the Service.

## 1. Who may use the Service

You must be at least 18 years old and able to enter into a binding agreement. If you use the Service on behalf of an institution, you confirm you are authorised to bind that institution to these Terms.

## 2. Your account

Authentication is provided by Clerk. You are responsible for activity under your account and for keeping access to your email secure. Tell us promptly at privacy@myresearchlab.app if you suspect unauthorised access.

## 3. Acceptable use

You agree not to use the Service to:

- conduct illegal research, or research that causes foreseeable harm to participants beyond accepted ethical norms;
- collect data without a lawful basis and appropriate informed consent;
- deceive participants in ways your ethics board / IRB has not approved;
- upload malware, attempt to breach security, or disrupt the Service;
- infringe others' intellectual property or privacy.

You are responsible for the ethical conduct of your research, including obtaining any required ethics-board / IRB approval and participant consent.

## 4. Your content and data

You retain ownership of the studies, materials, and response data you create ("Your Content"). You grant us a limited licence to host, store, and process Your Content solely to operate and improve the Service for you. We do not sell Your Content or participant data.

## 5. Participant data

For personal data of your study participants, **you are the data controller and we act as a processor on your behalf** (see the Privacy Policy). You are responsible for the lawful basis, consent, and information provided to your participants. The Service is designed to minimise participant identifiability (see the Privacy Policy, "Participant data").

## 6. Third-party integrations (bring-your-own keys)

The Service lets you connect third-party providers using your own credentials — including OSF (preregistration), Prolific (recruitment), Anthropic (AI text), and, where enabled, Hume AI (voice/emotion). Your use of those providers is governed by their terms, and you are responsible for your keys and any charges those providers bill you. We are not responsible for third-party services.

## 7. AI features

Some features use AI models (via your connected provider). AI output is **non-deterministic and may be inaccurate or inappropriate**; you are responsible for reviewing it before relying on or publishing it. AI output is not professional, legal, medical, or ethical advice.

## 8. Availability and changes

The Service is operated by an individual and is provided **"as is" and "as available"**, without uptime guarantees or a service-level agreement. We may modify, suspend, or discontinue features at any time. We will give reasonable notice of material adverse changes where practical.

## 9. Fees

The Service may be offered free of charge or under plans described at sign-up. If we introduce paid plans, we will give notice before charging you.

## 10. Termination

You may stop using the Service and delete your account at any time. We may suspend or terminate access if you breach these Terms or use the Service unlawfully. On termination we will handle your data as described in the Privacy Policy.

## 11. Disclaimers and limitation of liability

To the maximum extent permitted by applicable law, we disclaim all implied warranties and are not liable for indirect, incidental, or consequential damages, or for loss of data or research outcomes. Nothing in these Terms excludes liability that cannot be excluded under Polish or EU law (including for intent or gross negligence, or your statutory consumer rights). Where liability cannot be excluded, it is limited to the amount you paid us (if any) in the 12 months before the claim.

## 12. Changes to these Terms

We may update these Terms. When we materially change them we will update the version and effective date and, where required, ask you to re-accept on your next sign-in. Continued use after an update means you accept the updated Terms.

## 13. Governing law

These Terms are governed by the laws of **Poland**, without prejudice to mandatory consumer-protection rules of your country of residence. Disputes are subject to the competent courts of Poland, subject to any mandatory rules that apply to you.

## 14. Contact

Questions about these Terms: **privacy@myresearchlab.app**.
`.trim();

const PRIVACY_V1 = `
This Privacy Policy explains how **Paweł Rosner** (sole proprietor, **Poland**) — operator of Massive Research Lab ("the Service") — handles personal data. Contact: **privacy@myresearchlab.app**.

## Two roles, kept separate

- **Researcher data** (your account + how you use the Service): we are the **controller**.
- **Participant data** (people who take your studies): **you are the controller and we are your processor.** This policy describes how we, as processor, are built to protect it.

## Researcher data we collect

- **Account**: email address and display name (via our authentication provider, Clerk); optional profile fields you add (e.g. affiliation, ORCID).
- **Content**: the studies, materials, and settings you create.
- **Usage and technical**: coarse, non-identifying technical data needed to run and secure the Service (e.g. request metadata, coarse country). We do **not** store raw IP addresses for analytics.
- **Cookies**: see the Cookie Policy.

## Participant data (how we minimise it)

The Service is built to keep participant data minimal and hard to re-identify:

- participants are identified by an **opaque, anonymous token**, not by name or email;
- we do **not** store participants' raw IP addresses or raw browser user-agent strings; where a technical signal is needed (e.g. rate-limiting, consent audit) we use a **one-way hash** and/or coarse country only;
- responses belong to your workspace and are isolated from other workspaces;
- participant withdrawal is supported and propagates across the Service.

You decide what your study asks; you are responsible for the lawful basis and consent for any personal data your study itself collects.

## How we use researcher data

To provide, secure, support, and improve the Service, and to communicate with you about it. We do not sell personal data.

## Legal bases (GDPR)

- **Contract** — to provide the Service you sign up for.
- **Legitimate interests** — to secure and improve the Service (balanced against your rights).
- **Consent** — for optional cookies/analytics (see the Cookie Policy); withdrawable at any time.
- **Legal obligation** — where the law requires.

## Sub-processors

We use the following providers to run the Service. Several AI/integration providers are connected with **your own keys** and only process data when you choose to use them.

| Sub-processor | Purpose | Location | Data accessed |
|---|---|---|---|
| Clerk | Authentication | USA | Email, display name, auth tokens |
| Neon (PostgreSQL) | Database hosting | EU/USA | Researcher and participant data |
| Vercel | Application hosting | USA | Request/response data; no direct DB access |
| Cloudflare R2 | Asset storage | Global | Uploaded images/audio/video, generated audio |
| Cloudflare CDN | Delivery + DDoS protection | Global | HTTP request metadata (coarse country) |
| Upstash Redis | Rate limiting | USA | One-way-hashed coarse buckets; never raw IPs |
| Inngest | Background jobs | USA | Job metadata; study data only as a job requires |
| OSF (your key) | Preregistration | USA | Study metadata you choose to push |
| Anthropic (your key) | AI text features | USA | Prompts + content you send per study config |
| Hume AI (your key, where enabled) | Voice/emotion AI | USA | Content/audio per study config, with consent |
| Prolific (your key) | Recruitment | UK | Recruitment metadata; opaque participant IDs |

International transfers (e.g. to the USA) rely on appropriate safeguards such as the EU Standard Contractual Clauses where required.

## Security

HTTPS in transit; database encryption at rest; **third-party credentials you connect are encrypted application-side (AES-256-GCM) and never shown back to the browser**; strict workspace isolation; rate limiting against abuse.

## AI processing

When you use an AI feature, the relevant content is sent to **your connected provider** under their terms. AI output is non-deterministic and may be inaccurate. We meter usage for cost/abuse control but do not use your content to train models.

## Retention

We keep researcher and study data while your account is active and as needed to provide the Service. You can delete studies and your account; we then delete or anonymise associated data within a reasonable period, except where the law requires us to keep it.

## Your rights

Under the GDPR you may request access, rectification, erasure, restriction, portability, and may object to certain processing. Email **privacy@myresearchlab.app**. You also have the right to lodge a complaint with the Polish supervisory authority (**UODO** — Urząd Ochrony Danych Osobowych) or your local authority.

## Children

The Service is for researchers and is not directed at children. Whether your **study** may include minors is your responsibility as the controller of participant data.

## Changes

We may update this policy; material changes update the version + effective date and, where required, prompt re-acknowledgement.

## Contact

**privacy@myresearchlab.app**.
`.trim();

const COOKIES_V1 = `
This Cookie Policy explains the cookies and local storage Massive Research Lab ("the Service") uses. Operator: **Paweł Rosner**, Poland. Contact: **privacy@myresearchlab.app**. See also the Privacy Policy.

## Your choice

On your first visit we ask you to choose:

- **Accept all** — necessary cookies plus any optional ones (e.g. future product analytics).
- **Necessary only** — just what the Service needs to function.

Both choices are presented with equal prominence. You can change your mind by clearing your browser storage for this site; we also re-ask if this policy materially changes.

## Cookies we use

| Name / purpose | Type | Why |
|---|---|---|
| Authentication session (Clerk) | Necessary | Keeps you signed in |
| Theme preference | Necessary / functional | Remembers light/dark choice |
| Consent choice | Necessary | Remembers your cookie choice so we don't re-ask |
| Security tokens (if present) | Necessary | Protects against cross-site request forgery |

We currently set **no marketing or cross-site tracking cookies**.

## What "Necessary only" means

If you choose "Necessary only", we still set the cookies above (they are required for the Service to work and to remember your choice). Any **optional** analytics — none are active today; if we add product analytics in future they will be **disabled** unless you have accepted all. We will update this policy before enabling any such cookies.

## Local storage

We use your browser's local storage to remember your cookie choice and your theme preference. This stays on your device and is not sent to advertisers.

## Participant studies

The participant study experience is kept free of product analytics regardless of cookie choice. Any cookies inside a study you run are your responsibility as the study's controller.

## Changes

Material changes update the version and effective date, and we re-ask for your choice on your next visit.

## Contact

**privacy@myresearchlab.app**.
`.trim();

export const LEGAL_CONTENT: Record<LegalKind, Record<number, LegalDoc>> = {
  terms: {
    1: { version: 1, effectiveDate: "2026-06-26", summaryOfChanges: "Initial version", body: TERMS_V1 },
  },
  privacy: {
    1: { version: 1, effectiveDate: "2026-06-26", summaryOfChanges: "Initial version", body: PRIVACY_V1 },
  },
  cookies: {
    1: { version: 1, effectiveDate: "2026-06-26", summaryOfChanges: "Initial version", body: COOKIES_V1 },
  },
};

export function isLegalKind(s: string): s is LegalKind {
  return s === "terms" || s === "privacy" || s === "cookies";
}

/** Resolve a doc by kind + optional version (defaults to the in-force version). */
export function getLegalDoc(kind: LegalKind, version?: number): LegalDoc | null {
  const v = version ?? CURRENT_LEGAL_VERSION[kind];
  return LEGAL_CONTENT[kind][v] ?? null;
}
