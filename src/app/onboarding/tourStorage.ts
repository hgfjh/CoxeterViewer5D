// First-run state for the guided tour. Browser storage can be missing or
// throw (private windows, blocked site data), so every access is guarded and
// failure means "show nothing automatically": the tour is always reachable
// from the Help button, so losing this flag is harmless.

export const TOUR_STORAGE_KEY = "coxeterViewer.tour.v1";

type TourRecord = "finished" | "skipped";

export function readTourRecord(): TourRecord | null {
  try {
    const value = window.localStorage.getItem(TOUR_STORAGE_KEY);
    return value === "finished" || value === "skipped" ? value : null;
  } catch {
    return null;
  }
}

export function writeTourRecord(record: TourRecord): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, record);
  } catch {
    // Storage unavailable: the tour may reappear next visit, nothing else.
  }
}

/**
 * Decide whether the tour opens on page load.
 *
 * `?tour=1` forces it and `?tour=0` suppresses it, so links and tests can be
 * explicit. Without the parameter it opens once per browser, and never under
 * browser automation (`navigator.webdriver`), where an unexpected overlay
 * would intercept clicks in end-to-end tests and screenshot scripts.
 */
export function shouldAutoStartTour(
  search: string = window.location.search,
  webdriver: boolean = Boolean(navigator.webdriver),
  record: TourRecord | null = readTourRecord(),
): boolean {
  const param = new URLSearchParams(search).get("tour");
  if (param === "1") return true;
  if (param === "0") return false;
  if (webdriver) return false;
  return record === null;
}
