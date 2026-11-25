import type { TeacherMessage } from "../types";

export interface MessageThread {
  key: string;
  teacher: string;
  messages: TeacherMessage[];
}

export function groupMessagesByTeacher(messages: TeacherMessage[]): MessageThread[] {
  const threads = new Map<string, MessageThread>();
  for (const message of messages) {
    const teacher = message.teacher?.trim() || "Student messages";
    const key = message.teacher?.trim()
      ? `teacher:${teacher.toLocaleLowerCase()}`
      : "student-messages";
    const thread = threads.get(key) ?? { key, teacher, messages: [] };
    thread.messages.push(message);
    threads.set(key, thread);
  }

  return [...threads.values()]
    .map((thread) => ({
      ...thread,
      messages: thread.messages.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")),
    }))
    .sort((a, b) =>
      (b.messages[0]?.postedAt ?? "").localeCompare(a.messages[0]?.postedAt ?? ""),
    );
}
