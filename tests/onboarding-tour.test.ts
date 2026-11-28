import { describe, expect, it } from "vitest";
import { shouldAutoStartTour } from "../src/app/onboarding/tourStorage";

describe("guided tour first-run rule", () => {
  it("opens once for a new human visitor", () => {
    expect(shouldAutoStartTour("", false, null)).toBe(true);
    expect(shouldAutoStartTour("", false, "finished")).toBe(false);
    expect(shouldAutoStartTour("", false, "skipped")).toBe(false);
  });

  it("stays closed under browser automation unless asked for", () => {
    // Existing end-to-end tests click the sidebar on load; an overlay there
    // would intercept those clicks.
    expect(shouldAutoStartTour("", true, null)).toBe(false);
    expect(shouldAutoStartTour("?tour=1", true, null)).toBe(true);
  });

  it("lets the URL override the stored record", () => {
    expect(shouldAutoStartTour("?tour=1", false, "finished")).toBe(true);
    expect(shouldAutoStartTour("?tour=0", false, null)).toBe(false);
    expect(shouldAutoStartTour("?example=A3&tour=1", false, "skipped")).toBe(
      true,
    );
  });
});
