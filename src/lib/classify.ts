import type { MessageCategory } from "../types";

export function classifyMessage(text: string): MessageCategory {
  const content = text.toLowerCase();
  if (/\b(test|exam|examination|assessment|quiz)\b/.test(content)) return "Exam";
  if (/\b(homework|assignment|submit|due date|complete exercise)\b/.test(content)) return "Homework";
  if (/\b(project|exhibition|activity|comparative study|presentation)\b/.test(content)) return "Project";
  if (/\b(uploaded|e-cont|e-content|reference material|notes|study material)\b/.test(content)) {
    return "Study material";
  }
  if (/\b(postponed|rescheduled|schedule|timetable|changed to|deadline extended)\b/.test(content)) {
    return "Schedule change";
  }
  if (/\b(holiday|non-working day|important|school will remain|circular)\b/.test(content)) {
    return "Announcement";
  }
  return "General";
}

export function hasAssignmentAndDeadline(text: string): boolean {
  return /\b(homework|assignment|complete|submit|prepare|project)\b/i.test(text) &&
    /\b(due|deadline|submit(?:ted)? on|by)\b/i.test(text) &&
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(text);
}
