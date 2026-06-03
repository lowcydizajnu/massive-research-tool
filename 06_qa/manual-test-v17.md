# Manual test guide — V1.7 (the review network)

> Not an audit record — a click-through checklist for exercising V1.7 locally before the formal closeout audit. Dev server: `cd 05_app && npm run dev` → http://localhost:3000 (already running). Sign in with your Clerk account; you'll land in your workspace.

## What needs how many accounts

- **Solo (one account)** verifies that the surfaces render + the same-workspace paths work: tags, forkability, **Replicate your own study → Replications diff**, Frameworks + follow, the Activity destination shell.
- **The network loops need a second account.** Notifications (`Yours`) deliberately exclude *your own* actions, and the `Follows` feed excludes your own events — so a teammate is required to see a comment/mention/review-request land, and to see a replication appear. To get one: open **Team** (or your workspace settings) and invite a second `+clerk_test` email, accept it in a second browser/incognito as that user. (If invites aren't wired in your build, use any second real account that you add as a workspace member.)

---

## 1 · Solo checks (one account)

### Study-level tags (ADR-0017)
1. Open any study → **Build** → right panel **Details** (deselect any block).
2. Under **Tags**, type `Misinformation Research!` → **Add**. It should normalize to a `#misinformation-research` chip. Add `source cues` → `#source-cues`.
3. Each chip shows a **+ Follow** affordance and an **×** to remove. Click **×** to remove one.

### Forkability + Replicate (ADR-0018) — same-workspace
4. In **Details**, find the **Replication** row. As the owner you see a **Private** toggle → click it to **Public-replicable** (and back).
5. Click **Replicate this study**. You should be routed to a **new study's Build page** — its title matches, blocks are copied, and the top badge reads *replicating an upstream study*.
6. Go back to the **original** study → Build → right-panel **Replications** tab. You should see **Replications · 1** with a divergence summary like **`=N unchanged`** (same workspace ⇒ the diff is visible, not withheld).
7. In the **fork**, edit a block's config, then reopen the original's Replications tab → the child now shows **`~1 changed`** (or `+/−` if you add/remove a block).
8. Open the **fork's** Replications tab → it shows **Replicating {original} · {you}** at the top (the parent).

### Frameworks destination + framework follow (PR-3)
9. Left rail → **Frameworks** (now active). You should see the Misinformation Research Framework card with a **+ Follow**.
10. Click **+ Follow** → it flips to **Following**. Click again → back to **+ Follow**.

### Activity destination shell (PR-2/3)
11. Left rail → **Activity**. Two tabs: **Yours** (default) and **Follows**.
12. With nothing yet, **Yours** shows "You're all caught up"; **Follows** shows rows only if your follows have matching events (likely empty solo — see §2).

---

## 2 · Network checks (needs a teammate — call them "Maya")

Set up: you = **Hanna** (owner); **Maya** = a second active member of your workspace.

### Comments + @mention + Activity · Yours (PR-1b/PR-2)
1. **As Maya:** open one of Hanna's studies → **Share** stage. Select "Whole study" (or a block). In the composer, type `@`, pick **Hanna** from the autocomplete, finish the comment ("looks solid"), **Comment**.
2. **As Hanna:** left rail **Activity** → **Yours**. You should see **"Maya commented on …"** and **"Maya mentioned you …"**, and the **Activity rail item shows an unread badge**. Opening Activity clears the badge (the rows keep a "new" accent this visit).
3. Click a row → it links to the study's **Share** stage.

### Save & request review → review_request (PR-4)
4. **As Hanna:** Build → **Save** (top of the work surface) → choose **Save & request review** → label it, pick **Maya** as the reviewer → **Save & request review**.
5. **As Maya:** **Activity → Yours** shows **"Hanna requested your review on …"**.

### Follows feed (PR-3)
6. **As Maya:** open one of Hanna's studies → Build → **Details** → next to **Owner: Hanna**, click **+ Follow** (author follow). (You can also follow a tag chip.)
7. **As Hanna:** make a change that emits a Follows event — e.g. **Preregister** the study (Run stage → Preregister), or **Save as named version**.
8. **As Maya:** **Activity → Follows** → you should see **"Hanna preregistered …"** / **"Hanna saved a new version of …"** with a **"Following Hanna"** marker.

### Cross-workspace replication (needs a third account, "Sofia", in her own workspace)
9. **As Hanna:** make the study **Public-replicable** (Details → Replication toggle).
10. **As Sofia** (different workspace): V1.7 has **no cross-workspace browse UI yet** (documented gap, ADR-0018). To exercise it, the gated e2e drives `studies.fork` directly. Manually, the realistic check is the **same-workspace Replicate** in §1; the cross-workspace path is covered by `e2e/hanna-network.spec.ts` once you run it against live Clerk with three users.
11. **As Hanna:** after a replication exists, the **Replications** tab shows it; a private cross-workspace fork shows **"divergence hidden"** (the diff is withheld); a same-workspace or public fork shows the divergence.

---

## 3 · Notes / known gaps (by design in V1.7)

- **No notification bell** — Activity is the read surface; the rail badge is the unread signal.
- **Email digest** — events are emitted but the handler is a stub (V1.8).
- **Cross-workspace discovery** — no "explore others' public studies" UI yet; you reach a study to replicate by being a member or (future) a share link.
- **Follows tag/framework content** — only appears once a *public* study with that tag/framework emits an event from *someone you don't act as*.
- **Background jobs** — notification fan-out runs inline in dev when Inngest isn't reachable (no `inngest-cli dev` needed locally).

## 4 · Gated e2e (optional, needs live Clerk + test users)

```
cd 05_app
RUN_AUTH_E2E=1 \
E2E_CLERK_IDENTIFIER=… E2E_CLERK_PASSWORD=… \
E2E_CLERK_MAYA_IDENTIFIER=… E2E_CLERK_MAYA_PASSWORD=… \
E2E_CLERK_SOFIA_IDENTIFIER=… E2E_CLERK_SOFIA_PASSWORD=… \
npm run test:e2e:auth
```

Runs `hanna-network.spec.ts` (the full loop) + `hanna-publish-and-run.spec.ts` + the existing hanna loops. Selectors are UNVERIFIED against a live instance — adjust if your Clerk sign-in differs.
