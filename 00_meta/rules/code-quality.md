# Code quality rules

The shortest summary: write code that the next person reading it (you, in three months) can change without fear.

## Style and structure

- **TypeScript strict mode**, no implicit `any`, no `// @ts-ignore` without a comment explaining why.
- **Small files, small functions.** A file over ~250 lines or a function over ~50 lines is a candidate to split.
- **Names earn their length.** `participantId` not `pid`. `validateExperimentDefinition` not `validate`.
- **No dead code.** If it is commented out, delete it. Git remembers.
- **No premature abstraction.** Two similar pieces of code do not become a shared helper. Three do, and only after the third makes the right shape obvious.
- **Comments explain *why*, not *what*.** The code already shows what; comments add context the code can't.
- **Imports are sorted and grouped.** External, then internal, then relative. The linter enforces this; do not fight it.

## Error handling

- **Errors are values, not surprises.** Use discriminated unions or a `Result` type at boundaries — `Result<T, E>` beats throw/catch for predictable flows.
- **Throw only for programmer errors.** Network failures, validation failures, and missing data are expected; they return errors, not throw.
- **Every caught error has a logged context.** Use Sentry; include the relevant IDs (tenant, project, user, request).
- **Never `catch` without handling.** No `catch (e) {}`. No `catch (e) { console.log(e) }`. Either handle it or let it propagate.

## Validation

- **Validate at every trust boundary.** User input, third-party API responses, database reads of JSONB columns, deserialized cache values.
- **Use Zod (or equivalent).** Schemas double as TypeScript types and as runtime validators. One source of truth.
- **Fail loudly in development, gracefully in production.** Detailed errors locally, generic + logged errors live.

## Async and concurrency

- **Use `async/await`, not `.then()` chains**, except for short pipelines.
- **Cancel in-flight requests when the user navigates away.** TanStack Query handles this; do not invent your own.
- **No floating promises.** Either `await` or explicitly `void` with a justification.
- **Idempotency for anything that can retry.** Background jobs, webhooks, retried mutations.

## Components (React)

- **One component per file** for non-trivial components.
- **Props are typed.** Default values for optional props live in the component, not at every call site.
- **Side effects live in `useEffect`** and they have dependency arrays that pass the lint rules — no escape hatches.
- **Render is pure.** No mutations during render, no API calls in the render body.
- **Accessibility is non-negotiable.** Semantic HTML, labels for inputs, focus management, keyboard handlers. Use Radix primitives; do not re-implement them.

## Performance

- **Measure before optimizing.** Premature optimization is the standard answer here.
- **Pagination for any list that can exceed ~100 items.** Cursor-based for large datasets, offset for short lists.
- **N+1 queries are a bug.** Use joins, batch queries, or DataLoader-style coalescing.
- **Bundle size is monitored.** Anything that adds >20kb gzipped needs a justification in the PR.

## Comments and documentation

- Every public function in a service or module has a one-line JSDoc-style comment explaining its purpose, plus `@throws` for errors callers must handle.
- Complex logic — anything that took you more than a few minutes to design — gets a comment explaining the *intent*, not the mechanics.
- Tricky workarounds reference an issue or ADR.
