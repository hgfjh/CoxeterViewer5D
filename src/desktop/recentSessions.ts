import type { ProjectSessionRecentFile } from "../app/projectSession";

const recentSessionsStorageKey = "coxeter-viewer:recent-sessions:v1";

/**
 * Reads browser fallback recents. Native recents live in desktop settings when
 * Tauri is available, but this keeps the web build useful.
 */
export function readStoredRecentSessions(
  storage: Storage | undefined = window.localStorage,
): ProjectSessionRecentFile[] {
  if (!storage) {
    return [];
  }
  const raw = storage.getItem(recentSessionsStorageKey);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isRecentSessionRecord);
  } catch {
    return [];
  }
}

/**
 * Stores only validated session records so stale localStorage data is ignored.
 */
export function writeStoredRecentSessions(
  sessions: readonly ProjectSessionRecentFile[],
  storage: Storage | undefined = window.localStorage,
): void {
  if (!storage) {
    return;
  }
  storage.setItem(
    recentSessionsStorageKey,
    JSON.stringify(sessions.filter(isRecentSessionRecord)),
  );
}

function isRecentSessionRecord(
  value: unknown,
): value is ProjectSessionRecentFile {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    record.kind === "session" &&
    (record.label === undefined || typeof record.label === "string") &&
    (record.path === undefined || typeof record.path === "string") &&
    (record.lastOpenedAt === undefined ||
      typeof record.lastOpenedAt === "string")
  );
}
