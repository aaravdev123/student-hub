export type RecordOrigin = "sample" | "manual" | "synced";

export type AssignmentStatus = "pending" | "completed";

export type MessageCategory =
  | "Homework"
  | "Exam"
  | "Project"
  | "Study material"
  | "Announcement"
  | "Schedule change"
  | "General";

export interface Assignment {
  id: string;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  teacher?: string;
  materials: string[];
  instructions: string;
  status: AssignmentStatus;
  origin: RecordOrigin;
  originalUrl?: string;
  attachments?: AssignmentAttachment[];
  reminderAt?: string;
  studentEdited?: boolean;
}

export interface TeacherMessage {
  id: string;
  sender?: string;
  teacher?: string;
  subject?: string;
  content: string;
  postedAt?: string;
  category: MessageCategory;
  origin: RecordOrigin;
  originalUrl?: string;
  readState?: "read" | "unread";
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  postedAt?: string;
  origin: RecordOrigin;
  originalUrl?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  category: "Homework" | "Project" | "Exam" | "Announcement" | "Personal";
}

export interface PageCapture {
  url: string;
  title: string;
  capturedAt: string;
  text: string;
  links: Array<{ text: string; href: string; ariaLabel: string }>;
  homeworkItems?: Array<{
    subject: string;
    description: string;
    postedDate?: string;
    dueDate?: string;
    attachments: Array<{ url: string; label: string }>;
  }>;
  messageItems?: Array<{
    sender?: string;
    teacher?: string;
    subject?: string;
    content: string;
    postedAt?: string;
  }>;
  messageThreadRefs?: Array<{
    staffId: string;
    teacher: string;
    subject?: string;
  }>;
  announcementItems?: Array<{
    title: string;
    content: string;
    postedAt?: string;
  }>;
  noticeDiagnostics?: {
    sectionCount: number;
    headingCount: number;
    extractedCount: number;
  };
}

export interface AssignmentAttachment {
  url: string;
  label: string;
}

export interface SyncStatus {
  running: boolean;
  status?: string;
  error?: string | null;
  startedAt?: string;
  completedAt?: string;
}

export interface HubData {
  assignments: Assignment[];
  messages: TeacherMessage[];
  announcements: Announcement[];
  events: CalendarEvent[];
  captures: PageCapture[];
  syncStatus: SyncStatus | null;
  theme: "light" | "dark";
  themePreferenceSet?: boolean;
  syncIntervalHours: number;
}
