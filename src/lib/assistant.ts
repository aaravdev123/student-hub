import type { Assignment, TeacherMessage } from "../types";

export function answerQuestion(
  question: string,
  assignments: Assignment[],
  messages: TeacherMessage[],
): string {
  const q = question.toLowerCase();
  const today = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  let matches = assignments.filter((item) => item.status !== "completed");
  let intro = "";

  if (/unread/.test(q)) {
    const unread = messages.filter((message) => message.readState === "unread");
    if (!unread.length && messages.some((message) => message.readState === undefined)) {
      return "School Canvas read state is not reliably available in the synchronized data, so I can't identify unread messages yet.";
    }
    return unread.length
      ? `Unread teacher messages: ${unread.slice(0, 5).map((item) => `${item.subject ?? "General"} - ${item.content}`).join(" | ")}`
      : "There are no unread teacher messages in the available data.";
  }

  if (/(important|instruction)/.test(q)) {
    const important = messages.filter((message) =>
      /\b(please|kindly|must|remember|submit|deadline|due date|important|instructions?)\b/i.test(message.content),
    );
    return important.length
      ? `Messages with instructions or important wording: ${important.slice(0, 5).map((item) => `${item.subject ?? "General"} - ${item.content}`).join(" | ")}`
      : "I couldn't find messages with clear instruction or importance wording in the available data.";
  }

  if (/tomorrow/.test(q)) {
    matches = matches.filter((item) => item.dueDate === iso(tomorrow));
    intro = "Due tomorrow";
  } else if (/(overdue|late)/.test(q)) {
    matches = matches.filter((item) => item.dueDate < iso(today));
    intro = "Overdue";
  } else if (/(today|due today)/.test(q)) {
    matches = matches.filter((item) => item.dueDate === iso(today));
    intro = "Due today";
  } else if (/project/.test(q)) {
    matches = matches.filter((item) => /project|activity|study/i.test(`${item.title} ${item.description}`));
    intro = "Project-related homework";
    if (!matches.length) {
      const projects = messages.filter((message) => message.category === "Project");
      return projects.length
        ? `Project messages: ${projects.map((item) => `${item.subject ?? "General"} - ${item.content}`).join(" | ")}`
        : "I couldn't find project assignments in the available Student Hub data.";
    }
  } else if (/(test|exam|examination)/.test(q)) {
    matches = [];
    const exams = messages.filter((message) => message.category === "Exam");
    return exams.length
      ? `Exam messages: ${exams.map((item) => `${item.subject ?? "General"} - ${item.content}`).join(" | ")}`
      : "I couldn't find exam information in the available Student Hub data.";
  } else {
    const subject = ["mathematics", "geography", "science", "english", "kannada", "computer science"]
      .find((name) => q.includes(name));
    if (subject) {
      matches = matches.filter((item) => item.subject.toLowerCase() === subject);
      intro = `${subject} homework`;
    }
  }

  if (/message/.test(q)) {
    const unread = messages.filter((message) => message.readState === "unread");
    const relevant = unread.length ? unread : messages;
    return relevant.length
      ? `I found ${relevant.length} ${unread.length ? "unread " : ""}message(s): ${relevant.slice(0, 3).map((item) => `${item.subject ?? "General"} - ${item.content}`).join(" | ")}`
      : "There are no messages in the available Student Hub data.";
  }

  if (!matches.length) {
    return `I couldn't find matching assignments in the available Student Hub data${assignments.some((item) => item.origin === "sample") ? " (which currently includes sample data)" : ""}.`;
  }
  const sourceNotice = matches.some((item) => item.origin === "sample") ? " Note: some records are sample data." : "";
  return `${intro || "Matching homework"}: ${matches.map((item) => `${item.subject}: ${item.title} (due ${item.dueDate})`).join("; ")}.${sourceNotice}`;
}
