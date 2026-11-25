import type {
  Announcement,
  Assignment,
  PageCapture,
  TeacherMessage,
} from "../types";
import { classifyMessage, hasAssignmentAndDeadline } from "./classify";

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
const KNOWN_TEACHERS = [
  "Mamata H Barki",
  "Pooja Sahni",
  "Anu S Nair",
  "Shabnam Sharma",
  "Niranjani S",
];

const DATE_PATTERN = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/;

function stableId(prefix: string, value: string): string {
  let hash = 0;
  for (const char of value.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `${prefix}-${Math.abs(hash)}`;
}

function toIsoDate(match: RegExpMatchArray): string {
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const shortYear = Number(match[3]);
  const year = String(shortYear < 100 ? 2000 + shortYear : shortYear);
  return `${year}-${month}-${day}`;
}

function toIsoTime(value?: string): string {
  if (!value) return "00:00:00";
  const match = value.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return "00:00:00";
  let hour = Number(match[1]) % 12;
  if (match[4].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}:${match[3]}`;
}

function messageDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return undefined;
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  let hour = Number(match[4]) % 12;
  if (match[7].toUpperCase() === "PM") hour += 12;
  return `${match[3]}-${month}-${day}T${String(hour).padStart(2, "0")}:${match[5]}:${match[6]}`;
}

function noticeDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(
    /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM))?/i,
  );
  if (!match) return undefined;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  if (!match[4]) return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  let hour = Number(match[4]) % 12;
  if (match[7].toUpperCase() === "PM") hour += 12;
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}T${String(hour).padStart(2, "0")}:${match[5]}:${match[6]}`;
}

export function sanitizeAnnouncementContent(value: string): string {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const safeLines: string[] = [];
  let inStudentDetails = false;
  const portalNavigation = /^(?:Notice Board|Fees|Transport|Report Card|E-Content|Messaging|More|Logout)$/i;
  for (const line of lines) {
    if (/^Student Details$/i.test(line)) {
      inStudentDetails = true;
      continue;
    }
    if (inStudentDetails && /^(?:Notice Details|Posted On\s*:)/i.test(line)) {
      inStudentDetails = false;
    }
    if (!inStudentDetails && !portalNavigation.test(line)) safeLines.push(line);
  }
  const noticeHeading = safeLines.findIndex((line) => /^Notice Details$/i.test(line));
  const noticeLines = noticeHeading >= 0 ? safeLines.slice(noticeHeading + 1) : safeLines;
  const postedIndex = noticeLines.findIndex((line) => /^Posted On\s*:/i.test(line));
  return noticeLines.slice(0, postedIndex >= 0 ? postedIndex : undefined).join("\n").trim();
}

function noticeContentOnly(value: string): string {
  return sanitizeAnnouncementContent(value);
}

function canonicalTeacherName(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (/^pooja\s+sahini\b/i.test(cleaned)) return "Pooja Sahni";
  return KNOWN_TEACHERS.find((teacher) => cleaned.toLowerCase().startsWith(teacher.toLowerCase())) ?? cleaned;
}

function canonicalPersonName(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (/^pooja\s+sahini$/i.test(cleaned)) return "Pooja Sahni";
  return KNOWN_TEACHERS.find((teacher) => teacher.toLowerCase() === cleaned.toLowerCase()) ?? cleaned;
}

function parseMessageIdentity(
  nameOrHeader?: string,
  explicitSubject?: string,
): { sender?: string; teacher?: string; subject?: string } {
  const header = nameOrHeader?.replace(/\s+/g, " ").trim() ?? "";
  const subject = SUBJECTS.find((candidate) =>
    explicitSubject?.toLowerCase() === candidate.toLowerCase(),
  ) ?? SUBJECTS.find((candidate) =>
    new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i").test(header),
  );
  const personName = subject && !explicitSubject
    ? header.slice(0, header.length - subject.length).replace(/[\s:|,-]+$/, "")
    : header;
  const sender = personName ? canonicalPersonName(personName) : undefined;
  if (!subject) return { sender };
  return {
    sender,
    teacher: personName ? canonicalTeacherName(personName) : undefined,
    subject,
  };
}

function findMaterials(text: string): string[] {
  const patterns = [
    /\bhalf[- ]chart paper\b/i,
    /\b(?:math|exercise|science|class|rough) notebook\b/i,
    /\btextbook(?:\s+\d+)?\b/i,
    /\bchart paper\b/i,
  ];
  const found = [...new Set(patterns.flatMap((pattern) => text.match(pattern) ?? []).map((item) => item.trim()))];
  return found.some((item) => /half[- ]chart paper/i.test(item))
    ? found.filter((item) => !/^chart paper$/i.test(item))
    : found;
}

function findSubjectAndTitle(block: string): { subject: string; title: string } | null {
  const lines = block.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const subject = SUBJECTS.find((candidate) =>
    lines.some((line) => new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line)),
  );
  if (!subject) return null;
  const subjectLine = lines.find((line) => line.toLowerCase().includes(subject.toLowerCase())) ?? "";
  const inlineTitle = subjectLine
    .slice(subjectLine.toLowerCase().indexOf(subject.toLowerCase()) + subject.length)
    .replace(/^[\s:|.-]+/, "")
    .trim();
  const strongAssignmentLine = lines.find((line) =>
    /^(?:(?:complete|do)\s+)?(?:ebsb\s+)?(?:exercise|activity|project|assignment|comparative study|questions?\s*\d|chapter|worksheet)\b/i.test(line),
  );
  const assignmentLine = strongAssignmentLine ?? lines.find((line) =>
    /\b(exercise|activity|project|assignment|comparative study|questions?\s*\d|chapter|worksheet)\b/i.test(line),
  );
  const titleLine = assignmentLine ?? inlineTitle;
  if (!titleLine) return null;
  const title = titleLine
    .replace(new RegExp(`^${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:|-]?\\s*`, "i"), "")
    .replace(/\s*(?:topic|instructions)\s*:.*/i, "")
    .replace(/\s*\|\s*due\s*date.*$/i, "")
    .replace(/[\s|:.-]+$/, "")
    .trim();
  return title ? { subject, title } : null;
}

function findTitle(subject: string, description: string): string {
  const lines = description.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const candidates = lines.map((line) =>
    line.replace(new RegExp(`^${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:|-]?\\s*`, "i"), "").trim(),
  );
  const assignmentLine = candidates.find((line) =>
    /^(?:(?:complete|do)\s+)?(?:ebsb\s+)?(?:exercise|activity|project|assignment|comparative study|questions?\s*\d|chapter|worksheet)\b/i.test(line),
  ) ?? candidates.find((line) =>
    /\b(exercise|activity|project|assignment|comparative study|worksheet)\b/i.test(line),
  );
  const title = (assignmentLine ?? candidates[0] ?? subject)
    .replace(/\s*(?:topic|instructions)\s*:.*/i, "")
    .replace(/[\s|:.-]+$/, "")
    .trim();
  return title.length > 120 ? `${title.slice(0, 117)}...` : title;
}

function extractStructuredAssignments(capture: PageCapture): Assignment[] {
  return (capture.homeworkItems ?? [])
    .filter((item) => item.subject && item.description && item.dueDate)
    .map((item) => {
      const dateMatch = item.dueDate?.match(DATE_PATTERN);
      if (!dateMatch) return null;
      const dueDate = toIsoDate(dateMatch);
      const description = item.description.trim();
      const materials = findMaterials(description);
      const instructionLines = description
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => /\b(do it|submit|present|presentation|notebook|chart paper|include|prepare|materials to be brought)\b/i.test(line));
      const sourceStatus = description.match(/\bstatus\s*:\s*(completed|submitted|pending|incomplete)\b/i)?.[1]?.toLowerCase();
      const teacher = description.match(/(?:teacher|assigned by)\s*:\s*([^\n|]+)/i)?.[1]?.trim();
      const title = findTitle(item.subject, description);
      return {
        id: stableId("sync-assignment", `${item.subject}|${title}|${dueDate}`),
        subject: item.subject,
        title,
        description,
        dueDate,
        teacher: teacher || undefined,
        materials,
        instructions: instructionLines.join(" ") || description,
        status: sourceStatus === "completed" || sourceStatus === "submitted" ? "completed" as const : "pending" as const,
        origin: "synced" as const,
        originalUrl: capture.url,
        attachments: item.attachments,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function extractAssignments(capture: PageCapture): Assignment[] {
  if (capture.homeworkItems?.length) return extractStructuredAssignments(capture);
  const url = new URL(capture.url);
  const likelyHomework = /homework|assignment|diary/i.test(`${capture.title} ${url.pathname}`) ||
    (/\bdue\s*date\s*[:|-]/i.test(capture.text) && !/message|notice|announcement/i.test(url.pathname));
  if (!likelyHomework) return [];
  const duePattern = /due\s*date\s*[:|-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|due\s+on\s*[:|-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi;
  const markers = [...capture.text.matchAll(duePattern)];
  const results: Assignment[] = [];

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const start = index === 0 ? 0 : (markers[index - 1].index ?? 0) + markers[index - 1][0].length;
    const dueStart = marker.index ?? 0;
    const nextStart = index + 1 < markers.length ? markers[index + 1].index ?? capture.text.length : capture.text.length;
    const beforeDate = capture.text.slice(start, dueStart).trim();
    let afterDate = capture.text.slice(dueStart + marker[0].length, nextStart).trim();
    const nextSubjectLine = afterDate.search(new RegExp(
      `(?:^|\\n)\\s*(?:${SUBJECTS.map((subject) => subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*[:|]`,
      "i",
    ));
    if (nextSubjectLine >= 0) afterDate = afterDate.slice(0, nextSubjectLine).trim();
    const block = [beforeDate, afterDate].filter(Boolean).join("\n");
    const dateText = marker[1] ?? marker[2];
    if (!dateText) continue;
    const parsed = findSubjectAndTitle(block);
    if (!parsed) continue;

    const description = block.replace(/\s+/g, " ").trim();
    const instructionParts = block
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => /\b(do it|submit|present|presentation|notebook|chart paper|include|prepare)\b/i.test(line));
    const teacher = block.match(/(?:teacher|assigned by)\s*:\s*([^\n|]+)/i)?.[1]?.trim();
    const sourceStatus = block.match(/\bstatus\s*:\s*(completed|submitted|pending|incomplete)\b/i)?.[1]?.toLowerCase();
    results.push({
      id: stableId("sync-assignment", `${parsed.subject}|${parsed.title}|${toIsoDate(dateText.match(DATE_PATTERN)!)}`),
      subject: parsed.subject,
      title: parsed.title,
      description,
      dueDate: toIsoDate(dateText.match(DATE_PATTERN)!),
      teacher: teacher || undefined,
      materials: findMaterials(block),
      instructions: instructionParts.join(" ") || description,
      status: sourceStatus === "completed" || sourceStatus === "submitted" ? "completed" : "pending",
      origin: "synced",
      originalUrl: capture.url,
    });
  }
  return results;
}

function extractMessages(capture: PageCapture): TeacherMessage[] {
  if (capture.messageItems?.length) {
    return capture.messageItems
      .filter((item) => item.content.trim())
      .map((item) => {
        const postedAt = messageDateTime(item.postedAt);
        const identity = parseMessageIdentity(item.sender ?? item.teacher, item.subject);
        return {
          id: stableId("sync-message", `${identity.sender ?? identity.teacher ?? "student"}|${identity.subject ?? ""}|${postedAt ?? ""}|${item.content}`),
          ...identity,
          content: item.content.trim(),
          postedAt,
          category: classifyMessage(item.content),
          origin: "synced" as const,
          originalUrl: capture.url,
        };
      });
  }
  if (!/twcmessages|twcmessagedetails|messaging/i.test(`${capture.title} ${capture.url}`)) return [];
  const datePattern = /Posted On\s*:\s*\d{1,2}\/\d{1,2}\/\d{4}\s*(?:\d{1,2}:\d{2}:\d{2}\s*[AP]M)?/gi;
  const markers = [...capture.text.matchAll(datePattern)];
  const blocks = markers.map((marker, index) => {
    const start = index === 0 ? 0 : (markers[index - 1].index ?? 0) + markers[index - 1][0].length;
    const end = (marker.index ?? 0) + marker[0].length;
    return capture.text.slice(start, end).trim();
  }).filter(Boolean);
  return blocks.flatMap((block) => {
    const dateMatch = block.match(/Posted On\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*(\d{1,2}:\d{2}:\d{2}\s*[AP]M)?/i);
    if (!dateMatch) return [];
    const date = dateMatch[1].match(DATE_PATTERN);
    if (!date) return [];
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const headerIndex = lines.findIndex((line) => SUBJECTS.some((candidate) =>
      new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i").test(line),
    ));
    const header = lines[headerIndex >= 0 ? headerIndex : 0] ?? "";
    const identity = parseMessageIdentity(header);
    const content = lines
      .slice(headerIndex >= 0 ? headerIndex + 1 : 1)
      .filter((line) => !/^Posted On\s*:/i.test(line))
      .join(" ")
      .trim();
    if (!content) return [];
    return [{
      id: stableId("sync-message", `${identity.sender ?? identity.teacher ?? "student"}|${identity.subject ?? ""}|${dateMatch[1]}|${content}`),
      ...identity,
      content,
      postedAt: `${toIsoDate(date)}T${toIsoTime(dateMatch[2])}`,
      category: classifyMessage(content),
      origin: "synced" as const,
      originalUrl: capture.url,
    }];
  });
}

function extractAnnouncements(capture: PageCapture): Announcement[] {
  const noticeId = (() => {
    try {
      const url = new URL(capture.url);
      return /\/user\/student\/noticedetails\/?$/i.test(url.pathname)
        ? url.searchParams.get("NoticeId")
        : null;
    } catch {
      return null;
    }
  })();
  if (capture.announcementItems?.length) {
    return capture.announcementItems
      .filter((item) => item.title.trim())
      .map((item) => {
        return {
          id: stableId("sync-notice", noticeId || `${item.title}|${item.content}`),
          title: item.title.trim(),
          content: noticeContentOnly(item.content),
          postedAt: noticeDateTime(item.postedAt),
          origin: "synced" as const,
          originalUrl: capture.url,
        };
      });
  }
  if (!/notice|announcement/i.test(`${capture.title} ${capture.url}`)) return [];
  const boundedText = noticeContentOnly(capture.text);
  if (/\bRead More\b/i.test(boundedText)) return [];
  const rawLines = capture.text.split("\n").map((line) => line.trim()).filter(Boolean);
  const noticeHeadingIndex = rawLines.findIndex((line) => /^Notice Details$/i.test(line));
  const postedIndex = rawLines.findIndex((line) => /^Posted On\s*:/i.test(line));
  const title = noticeHeadingIndex >= 0
    ? rawLines.slice(noticeHeadingIndex + 1).find((line) =>
        line &&
        !/^Student Details$/i.test(line) &&
        !/^(?:Attendance|Announcement|Notice Board|Fees|Transport|Report Card|E-Content|Messaging|More|Logout)$/i.test(line),
      )
    : postedIndex > 0
      ? rawLines[postedIndex - 1]
      : boundedText.split("\n").map((line) => line.trim()).find(Boolean);
  const postedMatch = capture.text.match(/Posted On\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+\d{1,2}:\d{2}:\d{2}\s*[AP]M)?)/i);
  if (!title) return [];
  const content = boundedText
    .split("\n")
    .filter((line) => line.trim() !== title)
    .join("\n")
    .trim();
  return [{
    id: stableId("sync-notice", noticeId || `${title}|${content}`),
    title,
    content,
    postedAt: noticeDateTime(postedMatch?.[1]),
    origin: "synced",
    originalUrl: capture.url,
  }];
}

export function parseCaptures(captures: PageCapture[]): {
  assignments: Assignment[];
  messages: TeacherMessage[];
  announcements: Announcement[];
  taskSuggestions: Array<{ message: TeacherMessage; suggested: boolean }>;
} {
  const assignments = new Map<string, Assignment>();
  const messages = new Map<string, TeacherMessage>();
  const announcements = new Map<string, Announcement>();
  const taskSuggestions: Array<{ message: TeacherMessage; suggested: boolean }> = [];
  const rawMessages = captures.map((capture) => ({
    capture,
    messages: extractMessages(capture),
  }));
  const teacherByName = new Map<string, { teacher: string; subjects: Set<string> }>();
  const teacherByStaffId = new Map<string, { teacher: string; subject?: string }>();

  for (const { capture, messages: capturedMessages } of rawMessages) {
    for (const message of capturedMessages) {
      if (!message.teacher || !message.subject) continue;
      const key = canonicalPersonName(message.teacher).toLocaleLowerCase();
      const existing = teacherByName.get(key) ?? { teacher: canonicalTeacherName(message.teacher), subjects: new Set<string>() };
      existing.subjects.add(message.subject);
      teacherByName.set(key, existing);
    }
    for (const ref of capture.messageThreadRefs ?? []) {
      teacherByStaffId.set(ref.staffId, {
        teacher: canonicalTeacherName(ref.teacher),
        subject: ref.subject,
      });
    }
  }

  for (const { capture, messages: capturedMessages } of rawMessages) {
    let staffId: string | undefined;
    try {
      staffId = new URL(capture.url).searchParams.get("StaffId") ?? undefined;
    } catch {
      staffId = undefined;
    }
    const thread = staffId ? teacherByStaffId.get(staffId) : undefined;
    for (const item of capturedMessages) {
      const senderKey = item.sender?.toLocaleLowerCase();
      const knownTeacher = senderKey ? teacherByName.get(senderKey) : undefined;
      const threadTeacher = item.teacher ??
        knownTeacher?.teacher ??
        thread?.teacher;
      const subject = item.subject ??
        (knownTeacher?.subjects.size === 1 ? [...knownTeacher.subjects][0] : undefined) ??
        thread?.subject;
      const message = {
        ...item,
        teacher: threadTeacher,
        subject,
      };
      messages.set(message.id, message);
      taskSuggestions.push({ message, suggested: hasAssignmentAndDeadline(message.content) });
    }
  }

  for (const capture of captures) {
    for (const item of extractAssignments(capture)) assignments.set(item.id, item);
    for (const item of extractAnnouncements(capture)) announcements.set(item.id, item);
  }
  return {
    assignments: [...assignments.values()],
    messages: [...messages.values()],
    announcements: [...announcements.values()],
    taskSuggestions,
  };
}
