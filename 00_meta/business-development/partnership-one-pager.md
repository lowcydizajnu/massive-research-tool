# Massive Research Tool — propozycja partnerstwa / partnership proposal

> **Jak używać / How to use:** dwujęzyczny szablon. Wybierz wersję językową adekwatną do odbiorcy, podmień placeholders w nawiasach kwadratowych — szczególnie sekcję *Co MRT robi dobrze dla Państwa lab* / *Where MRT is uniquely strong for your lab*, która jest najważniejszym elementem pitchu i powinna być personalizowana per odbiorca (1-2 zdania nawiązujące do ich publikacji). Wysyłaj jako PDF (eksport z Marked / Typora / pandoc) lub wklej do treści emaila. Długość intencjonalna: jedna strona A4 po wydruku.

---

# 🇵🇱 Wersja polska

**Massive Research Tool — propozycja partnerstwa naukowo-rozwojowego**

Szanowna/y [Pani Profesor / Panie Profesorze NAZWISKO],

Piszę z propozycją partnerstwa rozwojowego dla zespołu z [INSTYTUCJA / Katedra / Lab]. Jestem niezależnym programistą i twórcą **Massive Research Tool** ([myresearchlab.app](https://myresearchlab.app)) — platformy do projektowania, preregistracji, prowadzenia i analizy eksperymentów psychologicznych online.

## Czym jest MRT

Nowoczesna alternatywa dla Qualtrics / SurveyMonkey, zaprojektowana wokół trzech problemów współczesnych badań w psychologii: (1) **kryzys replikacji** — wbudowana integracja z OSF na preregistrację + jednym kliknięciem replikuje czyjeś opublikowane badanie; (2) **nowoczesne typy stymulacji** — bloki audio-record, voice-conversation z AI (Hume EVI), analiza emocji głosu/tekstu (Anthropic Claude, Hume), warianty A/B/factorial; (3) **pełna kontrola nad danymi** — model BYO-AI (Państwa lab płaci dostawcom bezpośrednio), ścisła kontrola PII, GDPR-compliant.

Wdrożone produkcyjnie od 2026 r. Stack: Next.js 15 + tRPC + PostgreSQL (Neon) + Clerk; deploy na Vercel; rate-limiting (Upstash), background jobs (Inngest), object storage (Cloudflare R2). Architektura adapter-based — każdy zewnętrzny vendor (OSF, Prolific, Anthropic, Hume) jest wymienialny.

## Dlaczego akurat Państwa lab

[**SLOT DO PERSONALIZACJI** — 1-2 zdania nawiązujące do konkretnych publikacji odbiorcy. Przykład: "Państwa praca nad asymetrią reakcji emocjonalnych na dezinformację (Kowalski & Nowak, 2024) jest dokładnie tym typem badania, do którego MRT został zaprojektowany — voice-response + emotion-scoring w jednym workflow, z preregistracją i replikowalnością wbudowanymi w platformę."]

## Co proponuję

12-18 miesięczne partnerstwo. Państwa lab finansuje dedykowany rozwój platformy pod Państwa metodologię. W zamian otrzymują Państwo:

- **Dedykowaną instancję MRT** dostosowaną do potrzeb lab (dodatkowe typy bloków, integracje, workflow)
- **Bezpośredni dostęp do programisty** (mnie) z priorytetową obsługą i szybkim wdrażaniem zmian
- **Bezterminową bezpłatną licencję** dla Państwa lab po zakończeniu partnerstwa
- **5 lat bezpłatnej licencji instytucjonalnej** gdy MRT przejdzie na model subskrypcyjny (wartość: ~750 tys. PLN przy planowanej cenie)
- **Współautorstwo case study** + logo w sekcji "Zaufali nam"
- **Współudział w decyzjach produktowych** — Państwo wyznaczają priorytety roadmapy na 12 miesięcy

## Co ja otrzymuję

Stabilne finansowanie pozwalające na pełnoetatową pracę nad MRT; walidację rynkową przed szerszą komercjalizacją; pierwszego referencyjnego klienta instytucjonalnego; realny feedback z prawdziwych badań.

## Ramowy budżet

**200-400 tys. PLN/rok** w zależności od zakresu wymaganej customizacji. Faktura kwartalna ze sp. z o.o. Możliwe wspólne aplikowanie do NCBR / Horyzont Europa (do 80% kosztów współfinansowanych — chętnie wspieram w przygotowaniu wniosku).

## Warunki własności intelektualnej

100% IP pozostaje przy mnie / mojej spółce. Państwo otrzymują bezterminową bezpłatną licencję na użytek własny + opisane wyżej korzyści. Brak udziału w przyszłych przychodach z subskrypcji. To standardowe podejście w branży SaaS, które chroni obie strony przed komplikacjami przy przyszłym fundraisingu i pozwala mi zbudować zrównoważoną firmę.

## O mnie

**Paweł Rosner** — niezależny developer-przedsiębiorca. MRT to mój główny projekt; w trakcie partnerstwa nie obsługuję innych klientów. Operuję jako sp. z o.o. (faktury VAT). Email: [adres], LinkedIn: [link], demo na żywo: [myresearchlab.app](https://myresearchlab.app).

## Następny krok

**15-minutowa rozmowa**, na której pokażę platformę na żywo + porozmawiamy o Państwa potrzebach metodologicznych. Termin: [link do kalendarza] lub odpowiedź na ten email z trzema propozycjami.

Z wyrazami szacunku,
Paweł Rosner

---

---

# 🇬🇧 English version

**Massive Research Tool — Research Partnership Proposal**

Dear [Prof. NAME],

I'm writing to propose a development partnership with your team at [INSTITUTION / Department / Lab]. I'm an independent developer and the creator of **Massive Research Tool** ([myresearchlab.app](https://myresearchlab.app)) — a platform for designing, preregistering, running, and analyzing online psychological experiments.

## What MRT is

A modern alternative to Qualtrics / SurveyMonkey, built around three problems facing contemporary psychology research: (1) **the replication crisis** — built-in OSF integration for preregistration + one-click replication of published studies; (2) **modern stimulus types** — audio-record blocks, voice-conversation with AI (Hume EVI), voice/text emotion analysis (Anthropic Claude, Hume), A/B/factorial design variants; (3) **full data control** — BYO-AI model (your lab pays vendors directly), strict PII handling, GDPR-compliant.

Production-deployed since 2026. Stack: Next.js 15 + tRPC + PostgreSQL (Neon) + Clerk; hosted on Vercel; rate-limiting (Upstash), background jobs (Inngest), object storage (Cloudflare R2). Adapter-based architecture — every external vendor (OSF, Prolific, Anthropic, Hume) is swappable.

## Why your lab specifically

[**PERSONALIZATION SLOT** — 1-2 sentences referencing the recipient's specific publications. Example: "Your work on asymmetric emotional reactions to misinformation (Smith & Jones, 2024) is exactly the type of research MRT was designed for — voice-response + emotion-scoring in one workflow, with preregistration and replicability built into the platform."]

## What I'm proposing

A 12-18 month partnership. Your lab funds dedicated platform development tailored to your methodology. In exchange, you receive:

- **Dedicated MRT instance** customized to your lab's needs (additional block types, integrations, workflows)
- **Direct developer access** (me) with priority support and rapid iteration
- **Perpetual free license** for your lab after the partnership ends
- **5-year free institutional license** once MRT moves to a subscription model (value: ~$200k at planned pricing)
- **Co-authorship on case study** + your logo in the "Trusted by" section
- **Co-decision on roadmap** — you set priorities for 12 months

## What I receive

Stable funding enabling full-time work on MRT; market validation before broader commercialization; first institutional reference customer; real feedback from actual research.

## Indicative budget

**$50-100k / €45-90k per year** depending on customization scope. Quarterly invoicing via Polish limited liability company (full VAT invoicing for EU institutions). Open to joint application to **Horizon Europe / ERC infrastructure grants / NCBR-equivalent national programs** (up to 80% co-funding — happy to support grant writing).

## IP terms

100% IP stays with me / my company. You receive a perpetual free license for internal use + the benefits listed above. No revenue share on future subscriptions. This is the standard SaaS-industry approach; it protects both sides from complications during future fundraising and lets me build a sustainable business.

## About me

**Paweł Rosner** — independent developer-entrepreneur. MRT is my primary project; I do not take on other clients during a partnership engagement. Operating as a Polish limited liability company (full VAT invoicing). Email: [address], LinkedIn: [link], live demo at [myresearchlab.app](https://myresearchlab.app).

## Next step

**A 15-minute call** where I'll demo the platform live and we discuss your methodological needs. Schedule at [calendar link] or reply to this email with three proposed times.

Best regards,
Paweł Rosner

---

## Customization checklist (delete this section before sending)

- [ ] Replaced `[Pani Profesor / Panie Profesorze NAZWISKO]` / `[Prof. NAME]` with actual addressee
- [ ] Replaced `[INSTYTUCJA / Katedra / Lab]` / `[INSTITUTION / Department / Lab]` with actual institutional affiliation
- [ ] Filled `SLOT DO PERSONALIZACJI` / `PERSONALIZATION SLOT` with 1-2 sentences linking MRT capabilities to recipient's specific published work — this is the most important sentence in the whole pitch
- [ ] Updated `[adres]` / `[address]` with current email
- [ ] Updated `[link]` for LinkedIn
- [ ] Added `[link do kalendarza]` / `[calendar link]` (Cal.com, SavvyCal, Calendly, etc.)
- [ ] Verified pricing numbers match what you're actually willing to take
- [ ] Read aloud once — sounds like you, not like a template?
- [ ] Removed this checklist section before sending
- [ ] Exported to PDF or pasted into email body (PDF for formal first outreach; email body for warm intros via mutual connections)

## Outreach tips

1. **Warm intros beat cold emails 10×.** Before sending cold, ask 2-3 mutual contacts (other PIs, your supervisor's network, conference contacts) if they'd forward this. Subject line for warm intro: "[Name] suggested I reach out — psychology research tool partnership"
2. **First email is short.** The one-pager above is the *attached* document. The email body itself should be ~3 sentences: who you are, what you built, would they take a 15-min call.
3. **Follow up once after 7 days, then drop it.** PIs are busy; silence usually means "no, but not worth saying so." A second polite ping with a fresh angle is fine; a third one isn't.
4. **The personalization slot is non-negotiable.** Don't send the template with that field empty — they'll see it. If you can't find an angle that genuinely connects MRT to the recipient's work, they're not the right partner; skip and find another PI.
5. **Track outreach.** Simple spreadsheet: name, institution, date sent, date followed-up, response. After 20 cold sends with 0 responses, the pitch needs work — come back to me to iterate.
