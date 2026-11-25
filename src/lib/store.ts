import { createInitialData } from "../data/sampleData";
import type { Assignment, HubData, PageCapture, SyncStatus } from "../types";
import { parseCaptures, sanitizeAnnouncementContent } from "./extraction";

const HUB_KEY = "studentHubData";
const CAPTURES_KEY = "studentHubCaptures";
const SYNC_KEY = "studentHubSync";

interface ChromeLike {
  storage?: {
    local: {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  runtime?: {
    sendMessage(message: unknown): Promise<unknown>;
  };
}

function extensionChrome(): ChromeLike | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome;
}

async function getValues(keys: string[]): Promise<Record<string, unknown>> {
  const chromeApi = extensionChrome();
  if (chromeApi?.storage?.local) return chromeApi.storage.local.get(keys);
  const values: Record<string, unknown> = {};
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value) values[key] = JSON.parse(value);
  }
  return values;
}

async function setValues(values: Record<string, unknown>): Promise<void> {
  const chromeApi = extensionChrome();
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set(values);
    return;
  }
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
}

export async function loadHubData(): Promise<HubData> {
  const saved = await getValues([HUB_KEY, CAPTURES_KEY, SYNC_KEY]);
  const initial = createInitialData();
  const stored = saved[HUB_KEY] as Partial<HubData> | undefined;
  const captures = (saved[CAPTURES_KEY] as PageCapture[] | undefined) ?? [];
  const syncStatus = (saved[SYNC_KEY] as SyncStatus | undefined) ?? null;
  const parsed = parseCaptures(captures);
  const manual = stored ?? {};
  return {
    ...initial,
    ...manual,
    theme: manual.themePreferenceSet ? manual.theme ?? initial.theme : "dark",
    themePreferenceSet: manual.themePreferenceSet ?? false,
    captures,
    syncStatus,
    assignments: mergeAssignments(
      excludeSampleRecords(manual.assignments ?? initial.assignments),
      parsed.assignments,
    ),
    messages: mergeById(
      excludeSampleRecords(manual.messages ?? initial.messages)
        .filter((message) => message.origin !== "synced"),
      parsed.messages,
    ),
    announcements: mergeById(
      excludeSampleRecords(manual.announcements ?? initial.announcements),
      parsed.announcements,
    )
      .map((announcement) => announcement.origin === "synced"
        ? { ...announcement, content: sanitizeAnnouncementContent(announcement.content) }
        : announcement)
      .filter((announcement) => announcement.title.trim())
      .filter((announcement) => !isReadMoreSummary(announcement)),
  };
}

export function excludeReadMoreSummaries<T extends { origin: string; content: string }>(items: T[]): T[] {
  return items.filter((item) => !isReadMoreSummary(item));
}

function isReadMoreSummary(item: { origin: string; content: string }): boolean {
  return item.origin === "synced" && /\bRead More\b/i.test(item.content);
}

export function excludeSampleRecords<T extends { origin: string }>(items: T[]): T[] {
  return items.filter((item) => item.origin !== "sample");
}

export async function saveHubData(data: HubData): Promise<void> {
  await setValues({ [HUB_KEY]: data });
}

export async function requestSync(): Promise<void> {
  const chromeApi = extensionChrome();
  if (!chromeApi?.runtime?.sendMessage) {
    throw new Error("School Canvas sync is available from the installed browser extension.");
  }
  const result = await chromeApi.runtime.sendMessage({ type: "STUDENT_HUB_START_SYNC" }) as { ok?: boolean; error?: string };
  if (result?.ok === false) throw new Error(result.error ?? "Could not start sync.");
}

export async function setSyncInterval(hours: number): Promise<void> {
  const chromeApi = extensionChrome();
  if (!chromeApi?.runtime?.sendMessage) return;
  const result = await chromeApi.runtime.sendMessage({
    type: "STUDENT_HUB_SET_INTERVAL",
    hours,
  }) as { ok?: boolean; error?: string };
  if (result?.ok === false) throw new Error(result.error ?? "Could not update sync interval.");
}

export function mergeById<T extends { id: string }>(base: T[], incoming: T[]): T[] {
  const result = new Map(base.map((item) => [item.id, item]));
  for (const item of incoming) result.set(item.id, item);
  return [...result.values()];
}

export function mergeAssignments(base: Assignment[], incoming: Assignment[]): Assignment[] {
  const result = new Map(base.map((item) => [item.id, item]));
  for (const synced of incoming) {
    const saved = result.get(synced.id);
    result.set(synced.id, saved ? {
      ...synced,
      status: saved.status,
      reminderAt: saved.reminderAt,
      ...(saved.studentEdited ? {
        subject: saved.subject,
        title: saved.title,
        description: saved.description,
        dueDate: saved.dueDate,
        teacher: saved.teacher,
        materials: saved.materials,
        instructions: saved.instructions,
        originalUrl: saved.originalUrl,
        attachments: saved.attachments,
        studentEdited: true,
      } : {}),
    } : synced);
  }
  return [...result.values()];
}

export function getStorageMode(): "extension" | "browser" {
  return extensionChrome()?.storage?.local ? "extension" : "browser";
}
