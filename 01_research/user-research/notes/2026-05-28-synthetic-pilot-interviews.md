# 2026-05-28 — Synthetic pilot interviews (3 personas)

> **CRITICAL FRAMING:** These are **synthetic** personas, not field data. From the source document: *"SYNTHETIC personas, not field data. Use to refine the script and rehearse probing, and as hypotheses to test with real interviewees — NOT as evidence about the market or willingness to pay."*
>
> Treat the content here as **hypotheses with interviewer-annotated craftsmanship**, not as research findings about real users. Quotes from these personas are not citable as user voice. Synthesis below promotes hypotheses to the insights folder for further validation against real PIs.

## Source

- **File:** uploaded as `Researcher_Interviews_ThreePersonas.docx` on 2026-05-28
- **Plain-text extract:** `2026-05-28-synthetic-pilot-interviews-source.txt` (same folder)
- **Author:** project owner / facilitator (not Claude)
- **Format:** Three full mock interviews following the PI interview guide (`pi-interview-guide.md`), with interviewer-annotation notes inline.

## The three synthetic personas

| Persona | Role & world | Core (felt) pain | Reads the fork wedge as… |
| --- | --- | --- | --- |
| **Dr. Hanna Kowalczyk (HK)** | Solo postdoc; social/cognitive; runs own online studies (Qualtrics+JS, Prolific, R). | Silent randomization break; "copying my design from one box to another." | A trust-is-SOCIAL dead end — adapts paradigms via colleagues, not a platform. |
| **Dr. Marek Stein (MS)** | Multi-site consortium coordinator; 63 labs, 19 countries; jsPsych, OSF, Git, R. | Version DRIFT across sites; "I am the synchronization layer… single point of failure." | An OPERATIONAL must-have — distribution + provenance; "I'd pay real money" for attestation. |
| **Dr. Sofia Marsh (SM)** | Senior postdoc; burned replicator; reproducibility-first stack post-saga. | Spec LOSS: 18-month reconstruction of a missing study; the un-winnable fidelity argument after. | Emotionally the strongest yes — but names the SUPPLY problem: easy-sharing helps only those who wanted to share. |

## Claim-check matrix

The most useful structural finding: **the same claim means different things to different segments.** The synthetic interviews stress-test the claim-check section of the guide and surface this divergence sharply.

| Claim | HK (solo) | MS (multi-site) | SM (replicator) |
| --- | --- | --- | --- |
| Switch if "genuinely modern" | Breezy yes — contradicts her own behavior (polite agreement). | Refuses premise: bar is open+portable+revalidated × 63 (very high). | Wrong axis — would switch for REPRODUCIBILITY, not modernity. |
| Look & feel affects trust | Yes: polish → inferred maintenance → trust. | Yes, operationally: ugly → fragile → 63 support tickets. | Inverse: polish → SUSPICION ("what's hidden"). |
| Richer tools → scope studies UP | Soft yes ("in principle"). | NO — richness = divergence risk; scopes down on purpose. | NO — richness = un-reproducibility risk; scoped down post-saga. |
| Build on a colleague's study if easy | Flat "sure, yeah" (polite non-answer). | Energetic, behaviorally-backed YES — core buyer. | Yes BUT gated by SUPPLY — "fix the supply first." |
| Prereg is part of every study | Hedge: "that's the goal… confirmatory, yes." | Unqualified yes — load-bearing; wants ENFORCEMENT. | Unqualified yes — as personal ARMOR. |

## What this material is useful for

1. **Validating the interview guide design** — the synthetic interviews exposed that several claim-check questions get polite-agreement answers from some segments and behavioral disagreement from others. The "modern UX" and "richer scope" claims especially need rewording or replacement before real interviews.
2. **Generating new persona candidates** — the three roles map to three plausibly distinct personas: solo postdoc-operator, multi-site coordinator, and burned replicator. They are NOT validated personas yet; they are hypothesis archetypes.
3. **Surfacing strategic risks before we waste real-user time** — particularly the supply-side incentive risk that two of three independently surfaced. This is the kind of thing that's hard to discover in a single interview but obvious when three are compared.

## What this material is NOT useful for

- Citing as user research in the persona, ADRs, product brief, or any external-facing document.
- Estimating willingness-to-pay (MS's "I'd pay real money" is a fictional artifact).
- Sizing demand or markets.
- Making any decision that depends on knowing what real researchers actually do, as opposed to what a thoughtful project owner imagined they might.

## Where findings go next

- **`01_research/insights/persona-segmentation-and-strategic-risks.md`** — synthesis insight promoting the hypotheses to a tagged-low-confidence insight that can drive interview targeting and product framing decisions.
- **Refinements to existing PI persona (Maya Okonkwo)** — small updates to evidence basis acknowledging this synthetic pilot pass.
- **New persona candidates** — draft files for the multi-site coordinator and burned replicator archetypes (separate next step).
- **Interview script refinement** — claim-check questions need rewording (deferred until before real interviews are scheduled).
