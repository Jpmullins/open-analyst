import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import CatchAllRoute from "~/routes/_catchall";

describe("catch-all route", () => {
  it("renders a not-found message for unmatched paths", () => {
    const html = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ["/definitely-missing-page"] },
        createElement(CatchAllRoute)
      )
    );

    expect(html).toContain("Page not found");
    expect(html).toContain("/definitely-missing-page");
  });
});
