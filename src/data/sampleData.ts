import type { HubData } from "../types";

export function createInitialData(): HubData {
  return {
    assignments: [],
    messages: [],
    announcements: [],
    events: [],
    captures: [],
    syncStatus: null,
    theme: "dark",
    themePreferenceSet: false,
    syncIntervalHours: 6,
  };
}
