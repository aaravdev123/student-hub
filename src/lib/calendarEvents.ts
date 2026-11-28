import type { Announcement, Assignment, CalendarEvent, TeacherMessage } from "../types";

export type CalendarEventType = "Homework" | "Project" | "Exam" | "Announcement" | "Personal";

export interface DerivedCalendarEvent {
  id: string;
  title: string;
  date: string;
  type: CalendarEventType;
  subject?: string;
  details?: string;
  source: "assignment" | "message" | "announcement" | "personal";
  sourceLabel: string;
  postedAt?: string;
  assignmentId?: string;
  completed?: boolean;
  updatedFromPrevious?: boolean;
}

const SUBJECTS = [
  "Computer Science",
  "Social Science",
  "Mathematics",
  "Geography",
  "Kannada",
  "Science",
  "English",
  "Hindi",
  "French",
  "Physics",
  "Chemistry",
  "Biology",
  "History",
  "Sanskrit",
];

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "class",
  "classes",
  "date",
  "dear",
  "due",
  "for",
  "from",
  "has",
  "have",
  "held",
  "in",
  "instructions",
  "is",
  "it",
  "kindly",
  "note",
  "notice",
  "of",
  "on",
  "or",
  "parents",
  "please",
  "postponed",
  "reminder",
  "rescheduled",
  "revised",
  "scheduled",
  "school",
  "students",
  "submission",
  "submit",
  "that",
  "the",
  "this",
  "till",
  "to",
  "tomorrow",
  "today",
  "until",
  "updated",
  "will",
  "with",
]);

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

function formatYmd(year: number, month: number, day: number): string | undefined {
  return isValidYmd(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : undefined;
}

function addDaysToIso(isoDate: string, offsetDays: number): string | undefined {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function inferYear(month: number, referenceIso?: string): number {
  const refMatch = referenceIso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const baseYear = refMatch ? Number(refMatch[1]) : new Date().getFullYear();
  const refMonth = refMatch ? Number(refMatch[2]) : new Date().getMonth() + 1;
  if (refMonth >= 10 && month <= 2) return baseYear + 1;
  if (refMonth <= 2 && month >= 11) return baseYear - 1;
  return baseYear;
}

function detectSubject(text: string): string | undefined {
  return SUBJECTS.find((subject) =>
    new RegExp(`\\b${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text),
  );
}

function detectEventType(text: string, fallback: CalendarEventType): CalendarEventType {
  if (/\b(test|exam|examination|assessment|quiz|periodic test|unit test|half yearly|pre[- ]?board)\b/i.test(text)) {
    return "Exam";
  }
  if (/\b(project|exhibition|ebsb|comparative study|presentation)\b/i.test(text)) {
    return "Project";
  }
  if (/\b(homework|home work|assignment|worksheet|complete exercise|due date|submission|submit\b.*\bby)\b/i.test(text)) {
    return "Homework";
  }
  return fallback;
}

function stripRescheduleSourceDates(text: string): string {
  return text
    .replace(
      /\b(?:postponed|rescheduled|moved|shifted|extended|preponed|changed|revised)\b[^.\n]*?\bfrom\s+(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?[a-z]+(?:\s+\d{4})?|[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)\s+(?:to|till|until)\b/gi,
      " rescheduled to ",
    )
    .replace(
      /\b(?:circular|notice|letter|message)\s+dated\s+(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?[a-z]+(?:\s+\d{4})?|[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)/gi,
      " notice ",
    );
}

export function extractDatesFromText(rawText: string, referenceIso?: string): string[] {
  const text = stripRescheduleSourceDates(rawText);
  const found: Array<{ index: number; iso: string }> = [];

  const numericPattern = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g;
  for (const match of text.matchAll(numericPattern)) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const shortYear = Number(match[3]);
    const year = shortYear < 100 ? 2000 + shortYear : shortYear;
    const isMonthFirst = second > 12 && first <= 12;
    const day = isMonthFirst ? second : first;
    const month = isMonthFirst ? first : second;
    const iso = formatYmd(year, month, day);
    if (iso) found.push({ index: match.index ?? 0, iso });
  }

  const monthNames = Object.keys(MONTH_MAP).join("|");
  const dayFirstPattern = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})(?:[,\\s]+(\\d{4}))?\\b`,
    "gi",
  );
  for (const match of text.matchAll(dayFirstPattern)) {
    const day = Number(match[1]);
    const month = MONTH_MAP[match[2].toLowerCase()];
    const year = match[3] ? Number(match[3]) : inferYear(month, referenceIso);
    const iso = formatYmd(year, month, day);
    if (iso) found.push({ index: match.index ?? 0, iso });
  }

  const monthFirstPattern = new RegExp(
    `\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?\\b`,
    "gi",
  );
  for (const match of text.matchAll(monthFirstPattern)) {
    const month = MONTH_MAP[match[1].toLowerCase()];
    const day = Number(match[2]);
    const year = match[3] ? Number(match[3]) : inferYear(month, referenceIso);
    const iso = formatYmd(year, month, day);
    if (iso) found.push({ index: match.index ?? 0, iso });
  }

  if (found.length) {
    found.sort((a, b) => a.index - b.index);
    return [...new Set(found.map((entry) => entry.iso))];
  }

  if (referenceIso) {
    if (/\bday after tomorrow\b/i.test(text)) {
      const iso = addDaysToIso(referenceIso, 2);
      if (iso) return [iso];
    }
    if (/\btomorrow\b/i.test(text)) {
      const iso = addDaysToIso(referenceIso, 1);
      if (iso) return [iso];
    }
    if (/\btoday\b/i.test(text)) {
      const iso = addDaysToIso(referenceIso, 0);
      if (iso) return [iso];
    }
  }

  return [];
}

function summarizeTitle(subject: string | undefined, rawText: string, type: CalendarEventType): string {
  const firstLine = rawText
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find((line) => line && !/^(?:dear\s+(?:students|parents)|regards|thank\s+you)/i.test(line))
    ?? rawText.replace(/\s+/g, " ").trim();
  const cleaned = firstLine
    .replace(/^(?:\s|-|:|•)+/, "")
    .replace(/^(?:reminder|update|updated|reiteration)\s*[:|-]\s*/i, "")
    .trim();
  const short = cleaned.length > 72 ? `${cleaned.slice(0, 69)}...` : cleaned;
  if (subject && !short.toLowerCase().includes(subject.toLowerCase())) {
    return `${subject}: ${short || type}`;
  }
  return short || (subject ? `${subject} ${type}` : type);
}

function topicTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^\d{4}$/.test(token));
}

function identifierTokens(value: string): string[] {
  return value
    .toLowerCase()
    .match(/\b(?:exercise|ex|chapter|ch|unit|lesson|test|pt|paper|set|q)\s*[0-9]+[a-z]?\b|\b[0-9]+[a-z]\b/g)
    ?? [];
}

function hasUpdateKeyword(text: string): boolean {
  return /\b(postponed|rescheduled|extended|moved|shifted|preponed|revised|updated|reiterate|reiterating|reminder|new date)\b/i.test(
    text,
  );
}

function hasConflictingIdentifiers(aText: string, bText: string): boolean {
  const aIds = identifierTokens(aText);
  const bIds = identifierTokens(bText);
  if (!aIds.length || !bIds.length) return false;
  return !aIds.some((token) => bIds.includes(token));
}

function eventsRepresentSameItem(existing: DerivedCalendarEvent, incoming: DerivedCalendarEvent): boolean {
  if (existing.source === "personal" || incoming.source === "personal") return false;
  if (existing.type !== incoming.type) return false;

  const existingSubject = existing.subject?.toLowerCase();
  const incomingSubject = incoming.subject?.toLowerCase();
  if (existingSubject && incomingSubject && existingSubject !== incomingSubject) return false;

  const existingText = `${existing.title} ${existing.details ?? ""}`;
  const incomingText = `${incoming.title} ${incoming.details ?? ""}`;
  if (hasConflictingIdentifiers(existingText, incomingText)) return false;

  const existingTokens = new Set(topicTokens(existingText));
  const incomingTokens = topicTokens(incomingText);
  const sharedTokens = incomingTokens.filter((token) => existingTokens.has(token));

  if (existing.date === incoming.date) {
    if (existingSubject && incomingSubject) return true;
    return sharedTokens.length >= 1;
  }

  // Different dates: update only when the topic clearly matches or an update/reiteration is signaled.
  const strongSubjectMatch = Boolean(existingSubject && incomingSubject && existingSubject === incomingSubject);
  const enoughTokenOverlap = sharedTokens.length >= 2 || (strongSubjectMatch && sharedTokens.length >= 1);
  if (!enoughTokenOverlap) return false;

  const newerIsPostedLater = Boolean(
    incoming.postedAt &&
    (!existing.postedAt || incoming.postedAt > existing.postedAt),
  );
  return newerIsPostedLater || hasUpdateKeyword(incomingText);
}

function extractLineEntries(
  titleOrHeader: string,
  body: string,
  postedAt: string | undefined,
  defaultSubject: string | undefined,
  defaultType: CalendarEventType,
): Array<{ title: string; date: string; type: CalendarEventType; subject?: string; details: string }> {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const datedLines = lines
    .map((line) => ({ line, dates: extractDatesFromText(line, postedAt), subject: detectSubject(line) }))
    .filter((entry) => entry.dates.length > 0);
  const distinctLineSubjects = new Set(datedLines.map((entry) => entry.subject).filter(Boolean));

  if (datedLines.length >= 2 && distinctLineSubjects.size >= 2 && !hasUpdateKeyword(body)) {
    return datedLines.map(({ line, dates, subject: lineSubject }) => {
      const subject = lineSubject ?? defaultSubject;
      const type = detectEventType(`${titleOrHeader} ${line}`, defaultType);
      return {
        title: summarizeTitle(subject, line, type),
        date: dates[0],
        type,
        subject,
        details: line,
      };
    });
  }

  const combined = [titleOrHeader, body].filter(Boolean).join("\n");
  const dates = extractDatesFromText(combined, postedAt);
  if (!dates.length) return [];
  const subject = defaultSubject ?? detectSubject(combined);
  const type = detectEventType(combined, defaultType);
  return [{
    title: summarizeTitle(subject, titleOrHeader || body, type),
    date: dates[dates.length - 1],
    type,
    subject,
    details: body || titleOrHeader,
  }];
}

function isTeacherOrStandaloneMessage(message: TeacherMessage): boolean {
  if (!message.teacher) return Boolean(message.subject);
  if (!message.sender) return true;
  return message.sender.toLocaleLowerCase() === message.teacher.toLocaleLowerCase();
}

export function buildCalendarEvents({
  assignments,
  messages,
  announcements,
  events,
}: {
  assignments: Assignment[];
  messages: TeacherMessage[];
  announcements: Announcement[];
  events: CalendarEvent[];
}): DerivedCalendarEvent[] {
  const baseItems: DerivedCalendarEvent[] = assignments.map((item) => ({
    id: `assignment:${item.id}`,
    title: item.subject ? `${item.subject}: ${item.title}` : item.title,
    date: item.dueDate,
    type: /project|activity|exhibition|ebsb/i.test(`${item.title} ${item.description}`) ? "Project" : "Homework",
    subject: item.subject,
    details: item.description,
    source: "assignment",
    sourceLabel: item.teacher ? `Homework · ${item.teacher}` : "Homework",
    assignmentId: item.id,
    completed: item.status === "completed",
  }));

  const datedCommunications: DerivedCalendarEvent[] = [];

  for (const message of messages) {
    if (!isTeacherOrStandaloneMessage(message)) continue;
    const defaultType: CalendarEventType =
      message.category === "Exam"
        ? "Exam"
        : message.category === "Project"
          ? "Project"
          : message.category === "Homework"
            ? "Homework"
            : "Announcement";
    const entries = extractLineEntries(
      "",
      message.content,
      message.postedAt,
      message.subject,
      defaultType,
    );
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const shouldInclude =
        entry.type === "Exam" ||
        entry.type === "Homework" ||
        entry.type === "Project" ||
        message.category === "Schedule change" ||
        Boolean(message.subject);
      if (!shouldInclude) continue;
      datedCommunications.push({
        id: `message:${message.id}:${index}`,
        title: entry.title,
        date: entry.date,
        type: entry.type,
        subject: entry.subject,
        details: entry.details,
        source: "message",
        sourceLabel: message.teacher ? `Message · ${message.teacher}` : "Teacher message",
        postedAt: message.postedAt,
      });
    }
  }

  for (const announcement of announcements) {
    const entries = extractLineEntries(
      announcement.title,
      announcement.content,
      announcement.postedAt,
      undefined,
      "Announcement",
    );
    if (entries.length) {
      entries.forEach((entry, index) => {
        datedCommunications.push({
          id: `announcement:${announcement.id}:${index}`,
          title: entry.title,
          date: entry.date,
          type: entry.type,
          subject: entry.subject,
          details: entry.details,
          source: "announcement",
          sourceLabel: "Notice / Announcement",
          postedAt: announcement.postedAt,
        });
      });
    } else if (announcement.postedAt) {
      const fallbackType = detectEventType(`${announcement.title}\n${announcement.content}`, "Announcement");
      const fallbackSubject = detectSubject(`${announcement.title}\n${announcement.content}`);
      datedCommunications.push({
        id: `announcement:${announcement.id}:posted`,
        title: announcement.title,
        date: announcement.postedAt.slice(0, 10),
        type: fallbackType,
        subject: fallbackSubject,
        details: announcement.content,
        source: "announcement",
        sourceLabel: "Notice / Announcement",
        postedAt: announcement.postedAt,
      });
    }
  }

  // Process chronologically from oldest to newest so newer messages/notices update or merge earlier ones.
  datedCommunications.sort((a, b) => (a.postedAt ?? "").localeCompare(b.postedAt ?? ""));

  const merged: DerivedCalendarEvent[] = [...baseItems];

  for (const incoming of datedCommunications) {
    const matchIndex = merged.findIndex((existing) => eventsRepresentSameItem(existing, incoming));
    if (matchIndex < 0) {
      merged.push(incoming);
      continue;
    }

    const existing = merged[matchIndex];
    const dateChanged = existing.date !== incoming.date;
    const isIncomingNewer = !existing.postedAt || (incoming.postedAt ?? "") >= existing.postedAt;
    if (!isIncomingNewer && !dateChanged) continue;

    merged[matchIndex] = {
      ...existing,
      date: incoming.date,
      title: existing.source === "assignment" ? existing.title : incoming.title,
      details: incoming.details || existing.details,
      postedAt: incoming.postedAt ?? existing.postedAt,
      sourceLabel:
        existing.source === "assignment"
          ? `${existing.sourceLabel} · Updated via ${incoming.source === "message" ? "message" : "notice"}`
          : incoming.sourceLabel,
      updatedFromPrevious: existing.updatedFromPrevious || dateChanged,
    };
  }

  for (const item of events) {
    merged.push({
      id: `personal:${item.id}`,
      title: item.title,
      date: item.date,
      type: item.category,
      source: "personal",
      sourceLabel: "Personal event",
    });
  }

  const typePriority: Record<CalendarEventType, number> = {
    Exam: 0,
    Homework: 1,
    Project: 2,
    Announcement: 3,
    Personal: 4,
  };

  return merged
    .filter((item) => Boolean(item.date))
    .sort((a, b) => a.date.localeCompare(b.date) || typePriority[a.type] - typePriority[b.type]);
}
