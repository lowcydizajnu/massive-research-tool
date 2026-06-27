# User flow — Provide product feedback

- **Job-to-be-done:** [Get set up](../jobs-to-be-done/get-set-up.md)
- **Primary persona:** [Hanna Kowalczyk — postdoc operator](../personas/postdoc-operator.md)
- **Secondary personas (if any):** …
- **Grounding insights:** …
- **Status:** draft

## Goal

> One sentence: what the user is trying to accomplish.

A researcher who hits a bug, has an idea, or is confused can report it in seconds from wherever they are in the app, optionally attaching a screenshot of what they were looking at.

## Preconditions

> What must be true before the flow begins. (Signed in, has at least one project, etc.)

- Signed in (the feedback affordance lives only in the authenticated app shell, never in the participant runtime `/take/*` — ADR-0014).
- A cookie-consent choice has been recorded (drives whether screenshot capture defaults on).

## Postconditions

> What is true after the flow completes successfully.

- A `feedback` row exists, tagged to the user + (if applicable) the workspace and study they were in, with the page URL and route pattern.
- If a screenshot was included, the PNG is stored in R2 at `ws/<workspace>/feedback/<feedback_id>.png` and linked from the row.
- The researcher sees a confirmation and returns exactly where they were.

## Happy path

> Each step names the system response and the next decision point.

1. Researcher clicks the floating feedback button (bottom-right of the app shell). (Trigger: stuck, annoyed, or inspired.) → The feedback modal opens.
2. They pick a kind (Bug / Idea / Question / Other; defaults to Bug) and type a message.
3. They decide whether to include a screenshot of the current page and whether to include browser context (URL / coarse country / hashed user-agent / workspace + study ids), both shown as a preview.
4. They click **Send feedback**. → If a screenshot was requested, the modal hides, the page is rendered to a PNG, and the modal returns showing progress.
5. The row is written; the screenshot (if any) is uploaded to a signed R2 URL and confirmed back to the row. → A success toast appears and the modal closes.

## Branches and decision points

> For each non-trivial branch.

- **Decision:** include a screenshot?
  - **Path A (yes):** capture + upload happens on submit (step 4–5).
  - **Path B (no):** the row is written immediately with no `screenshot_r2_key` (step 5).
- **Decision:** cookie consent is "necessary only".
  - The screenshot checkbox defaults **off** with helper copy; the researcher can still opt in deliberately.

## Failure modes

> For each plausible failure.

- **Trigger:** empty message. **System response:** Send is disabled / inline validation. **Recovery:** type something.
- **Trigger:** screenshot capture or upload fails. **System response:** the text feedback is still saved (capture is best-effort); a toast notes the screenshot didn't attach. **Recovery:** none needed — the report is recorded.
- **Trigger:** network error on submit. **System response:** error toast, modal stays open with the text intact. **Recovery:** retry.

## Out of scope

> What this flow deliberately does not cover, and which other flow does.

- Triage / status management of submitted feedback — that is the admin queue ([Admin feedback queue wireframe](../../03_design/wireframes/admin-feedback-queue.md)), owner-only.
- In-app announcements / "what's new" (PF4, separate flow).
- Participant-facing feedback inside a study run (explicitly excluded by ADR-0014).

## Open questions

> Anything we are unsure about. Tag the person who should answer.

- Should researchers see the status of their own past feedback? Deferred — owner to decide when the Admin destination lands.

## Diagram

> Embed or link the flow diagram.

Linear: button → modal (compose + options) → submit → [capture+upload if opted in] → toast. No branching beyond the screenshot opt-in.
