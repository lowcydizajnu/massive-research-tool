import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/ui/empty-state";

// vitest `include` is **/*.test.ts, so no JSX here — use createElement.
describe("EmptyState (PF3.2)", () => {
  it("renders the title and body", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, { title: "No studies yet.", body: "Start your first study." }),
    );
    expect(html).toContain("No studies yet.");
    expect(html).toContain("Start your first study.");
  });

  it("renders the CTA when provided, and omits the wrapper when not", () => {
    const withCta = renderToStaticMarkup(
      createElement(EmptyState, {
        title: "No studies yet.",
        action: createElement("button", { type: "button" }, "New study"),
      }),
    );
    expect(withCta).toContain("New study");

    const withoutCta = renderToStaticMarkup(
      createElement(EmptyState, { title: "Nothing matches this filter." }),
    );
    expect(withoutCta).toContain("Nothing matches this filter.");
    expect(withoutCta).not.toContain("<button");
  });
});
