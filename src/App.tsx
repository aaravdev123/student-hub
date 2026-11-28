import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  ArrowLeft,
  ArrowDownUp,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Cloud,
  FileText,
  Filter,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Sun,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { answerQuestion } from "./lib/assistant";
import { buildCalendarEvents, type CalendarEventType, type DerivedCalendarEvent } from "./lib/calendarEvents";
import { hasAssignmentAndDeadline } from "./lib/classify";
import { groupMessagesByTeacher } from "./lib/messageThreads";
import { getStorageMode, loadHubData, requestSync, saveHubData, setSyncInterval } from "./lib/store";
import type {
  Assignment,
  CalendarEvent,
  HubData,
  MessageCategory,
  TeacherMessage,
} from "./types";

type View =
  | "Dashboard"
  | "Homework"
  | "Calendar"
  | "Messages"
  | "Announcements"
  | "Study Materials"
  | "Attendance"
  | "Report Cards"
  | "AI Assistant"
  | "Settings";

const navigation: Array<{ label: View; icon: LucideIcon }> = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Homework", icon: ClipboardList },
  { label: "Calendar", icon: CalendarDays },
  { label: "Messages", icon: MessageSquareText },
  { label: "Announcements", icon: FileText },
  { label: "Study Materials", icon: BookOpen },
  { label: "Attendance", icon: CheckCircle2 },
  { label: "Report Cards", icon: GraduationCap },
  { label: "AI Assistant", icon: Sparkles },
  { label: "Settings", icon: Settings },
];

const categories: MessageCategory[] = [
  "Homework",
  "Exam",
  "Project",
  "Study material",
  "Announcement",
  "Schedule change",
  "General",
];

const todayISO = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const formatDate = (value?: string) => {
  if (!value) return "Date not provided";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
};

const formatDateTime = (value?: string) => {
  if (!value) return "Date not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? formatDate(value)
    : new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
};

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function priority(assignment: Assignment) {
  if (assignment.status === "completed") return "completed";
  if (assignment.dueDate < todayISO()) return "overdue";
  if (assignment.dueDate === todayISO()) return "today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  return assignment.dueDate === next ? "tomorrow" : "upcoming";
}

function originLabel(origin: Assignment["origin"]) {
  return origin === "synced" ? "Synced" : origin === "sample" ? "Sample" : "Added by you";
}

function App() {
  const [data, setData] = useState<HubData | null>(null);
  const [view, setView] = useState<View>("Dashboard");
  const [loadError, setLoadError] = useState("");
  const [busySync, setBusySync] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [dismissedSyncAt, setDismissedSyncAt] = useState("");
  const [modal, setModal] = useState<"assignment" | "event" | null>(null);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("All subjects");
  const [sortOrder, setSortOrder] = useState<"Soonest first" | "Latest first">("Latest first");
  const [homeworkGroup, setHomeworkGroup] = useState("All");
  const [messageFilter, setMessageFilter] = useState("All messages");
  const [selectedMessageThread, setSelectedMessageThread] = useState<string | null>(null);
  const [calendarMode, setCalendarMode] = useState<"Month" | "Week" | "Day">("Month");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(todayISO);
  const [eventDraftDate, setEventDraftDate] = useState(todayISO);
  const [calendarTypeFilter, setCalendarTypeFilter] = useState<"All" | CalendarEventType>("All");
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<Array<{ question: string; answer: string }>>([]);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const autoSyncStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const loaded = await loadHubData();
        if (cancelled) return;
        setData(loaded);

        if (getStorageMode() !== "extension" || autoSyncStarted.current) return;
        autoSyncStarted.current = true;
        try {
          await requestSync();
          if (cancelled) return;
          setData((current) => current ? {
            ...current,
            syncStatus: {
              running: true,
              status: "loading",
              error: null,
              startedAt: new Date().toISOString(),
            },
          } : current);
        } catch (error) {
          if (!cancelled) {
            setSyncError(error instanceof Error ? error.message : "Could not start automatic sync.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load Student Hub data.");
        }
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    saveHubData(data).catch((error: unknown) =>
      setLoadError(error instanceof Error ? error.message : "Could not save your changes."),
    );
  }, [data]);

  useEffect(() => {
    if (!data?.syncStatus?.running) return;
    const timer = window.setInterval(() => {
      loadHubData().then(setData).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [data?.syncStatus?.running]);

  useEffect(() => {
    if (!data || !("Notification" in window) || Notification.permission !== "granted") return;
    const timers = new Set<number>();
    const maxTimeout = 2_147_000_000;
    const schedule = (item: Assignment, dueAt: number) => {
      const delay = Math.min(dueAt - Date.now(), maxTimeout);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (Date.now() < dueAt) {
          schedule(item, dueAt);
          return;
        }
        new Notification(`Homework reminder: ${item.subject}`, {
          body: item.title,
          tag: `student-hub-${item.id}`,
        });
      }, delay);
      timers.add(timer);
    };
    for (const item of data.assignments) {
      if (!item.reminderAt) continue;
      const dueAt = new Date(item.reminderAt).getTime();
      if (dueAt > Date.now()) schedule(item, dueAt);
    }
    return () => timers.forEach(window.clearTimeout);
  }, [data?.assignments]);

  const assignments = data?.assignments ?? [];
  const messages = data?.messages ?? [];
  const announcements = data?.announcements ?? [];
  const sortedAssignments = useMemo(() => {
    return assignments
      .filter((item) => subjectFilter === "All subjects" || item.subject === subjectFilter)
      .filter((item) => {
        if (homeworkGroup === "All") return true;
        if (homeworkGroup === "Completed") return item.status === "completed";
        return priority(item) === homeworkGroup.toLowerCase();
      })
      .filter((item) => `${item.subject} ${item.title} ${item.description}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => sortOrder === "Soonest first"
        ? a.dueDate.localeCompare(b.dueDate)
        : b.dueDate.localeCompare(a.dueDate));
  }, [assignments, subjectFilter, homeworkGroup, sortOrder, search]);
  const allMessageThreads = groupMessagesByTeacher(messages);
  const filteredMessageThreads = groupMessagesByTeacher(messages
    .filter((message) => messageFilter === "All messages" || message.category === messageFilter)
    .filter((message) => `${message.teacher ?? ""} ${message.subject ?? ""} ${message.content}`.toLowerCase().includes(search.toLowerCase())));
  const activeMessageThread = allMessageThreads.find((thread) => thread.key === selectedMessageThread);
  const calendarEvents = useMemo(
    () => buildCalendarEvents({
      assignments,
      messages,
      announcements,
      events: data?.events ?? [],
    }),
    [assignments, messages, announcements, data?.events],
  );

  if (loadError && !data) {
    return <main className="fatal-state"><CircleHelp size={32} /><h1>Student Hub could not load</h1><p>{loadError}</p><button className="button primary" onClick={() => location.reload()}>Try again</button></main>;
  }
  if (!data) return <main className="loading-state"><LoaderCircle className="spin" size={26} /> Loading Student Hub...</main>;

  const save = (update: (current: HubData) => HubData) => setData((current) => current ? update(current) : current);
  const dueToday = assignments.filter((item) => priority(item) === "today");
  const overdue = assignments.filter((item) => priority(item) === "overdue");
  const completed = assignments.filter((item) => item.status === "completed");
  const progress = assignments.length ? Math.round((completed.length / assignments.length) * 100) : 0;
  const demoMode = [...assignments, ...messages, ...announcements].some((item) => item.origin === "sample");
  const completedSyncAt = data.syncStatus?.status === "complete" ? data.syncStatus.completedAt ?? "" : "";
  const showSyncConfirmation = Boolean(completedSyncAt && completedSyncAt !== dismissedSyncAt);
  const syncedCounts = {
    assignments: assignments.filter((item) => item.origin === "synced").length,
    messages: messages.filter((item) => item.origin === "synced").length,
    announcements: announcements.filter((item) => item.origin === "synced").length,
  };
  const noticeBoardCaptures = data.captures.filter((capture) =>
    /\/user\/student\/noticeboard\/?$/i.test(capture.url),
  );
  const latestNoticeDiagnostics = [...noticeBoardCaptures]
    .reverse()
    .find((capture) => capture.noticeDiagnostics)?.noticeDiagnostics;
  const syncLabel = data.syncStatus?.running
    ? "Syncing..."
    : data.syncStatus?.status === "complete"
      ? `Synced ${formatDate(data.syncStatus.completedAt)}`
      : data.syncStatus?.status === "needs-sign-in"
        ? "Sign-in required"
        : "Not synced yet";

  async function syncNow() {
    setSyncError("");
    setDismissedSyncAt(data?.syncStatus?.completedAt ?? "");
    setBusySync(true);
    try {
      await requestSync();
      setData((current) => current ? {
        ...current,
        syncStatus: { running: true, status: "loading", error: null, startedAt: new Date().toISOString() },
      } : current);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not start sync.");
    } finally {
      setBusySync(false);
    }
  }

  function setTheme(theme: "light" | "dark") {
    save((current) => ({ ...current, theme, themePreferenceSet: true }));
    document.documentElement.dataset.theme = theme;
  }

  function toggleComplete(item: Assignment) {
    save((current) => ({
      ...current,
      assignments: current.assignments.map((task) =>
        task.id === item.id ? { ...task, status: task.status === "completed" ? "pending" : "completed" } : task),
    }));
  }

  function completeAllVisible() {
    const ids = new Set(
      sortedAssignments.filter((item) => item.status !== "completed").map((item) => item.id),
    );
    if (!ids.size) return;
    save((current) => ({
      ...current,
      assignments: current.assignments.map((task) =>
        ids.has(task.id) ? { ...task, status: "completed" } : task,
      ),
    }));
  }

  function openAssignment(item?: Assignment) {
    setEditing(item ?? null);
    setModal("assignment");
  }

  function submitAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assignment: Assignment = {
      id: editing?.id ?? id("manual-assignment"),
      subject: String(form.get("subject") ?? "").trim(),
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      dueDate: String(form.get("dueDate") ?? ""),
      teacher: String(form.get("teacher") ?? "").trim() || undefined,
      materials: String(form.get("materials") ?? "").split(",").map((part) => part.trim()).filter(Boolean),
      instructions: String(form.get("instructions") ?? "").trim(),
      status: editing?.status ?? "pending",
      origin: editing?.origin === "synced" ? "synced" : "manual",
      originalUrl: String(form.get("originalUrl") ?? "").trim() || undefined,
      attachments: editing?.attachments,
      reminderAt: String(form.get("reminderAt") ?? "").trim() || undefined,
      studentEdited: true,
    };
    save((current) => ({
      ...current,
      assignments: editing
        ? current.assignments.map((item) => item.id === editing.id ? assignment : item)
        : [assignment, ...current.assignments],
    }));
    if (assignment.reminderAt && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          setData((current) => current ? { ...current, assignments: [...current.assignments] } : current);
        }
      }).catch(() => undefined);
    }
    setModal(null);
    setEditing(null);
  }

  function openEventModal(dateIso?: string) {
    setEventDraftDate(dateIso || selectedCalendarDay || todayISO());
    setModal("event");
  }

  function submitEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item: CalendarEvent = {
      id: id("personal-event"),
      title: String(form.get("title") ?? "").trim(),
      date: String(form.get("date") ?? ""),
      category: "Personal",
    };
    save((current) => ({ ...current, events: [...current.events, item] }));
    setModal(null);
  }

  function createFromMessage(message: TeacherMessage) {
    if (assignments.some((item) =>
      item.description.trim() === message.content.trim() ||
      item.title === message.content.slice(0, 80),
    )) return;
    const dateMatch = message.content.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
    const dueDate = dateMatch
      ? `${dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`
      : "";
    setEditing(null);
    setModal("assignment");
    window.setTimeout(() => {
      const titleInput = document.querySelector<HTMLInputElement>("#assignment-title");
      const descriptionInput = document.querySelector<HTMLTextAreaElement>("#assignment-description");
      const subjectInput = document.querySelector<HTMLInputElement>("#assignment-subject");
      const dueInput = document.querySelector<HTMLInputElement>("#assignment-due");
      if (titleInput) titleInput.value = message.content.slice(0, 80);
      if (descriptionInput) descriptionInput.value = message.content;
      if (subjectInput && message.subject) subjectInput.value = message.subject;
      if (dueInput && dueDate) dueInput.value = dueDate;
    }, 20);
  }

  function askAssistant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question) return;
    setChat((current) => [...current, {
      question,
      answer: answerQuestion(question, assignments, messages.filter((message) =>
        message.subject &&
        message.teacher &&
        message.sender?.toLocaleLowerCase() === message.teacher.toLocaleLowerCase(),
      )),
    }]);
    setChatInput("");
  }

  const addExampleAction = (item: Assignment) => (
    <button className="icon-button" title="Edit assignment" onClick={() => openAssignment(item)}><MoreHorizontal size={18} /></button>
  );

  const assignmentCard = (item: Assignment) => {
    const level = priority(item);
    return (
      <article className={`assignment-card ${item.status === "completed" ? "is-complete" : ""}`} key={item.id}>
        <button className={`check-control ${item.status === "completed" ? "checked" : ""}`} aria-label={item.status === "completed" ? "Mark incomplete" : "Mark complete"} onClick={() => toggleComplete(item)}>
          {item.status === "completed" && <Check size={15} />}
        </button>
        <div className="assignment-main">
          <div className="assignment-topline">
            <span className="subject-pill">{item.subject}</span>
            <span className={`origin-tag ${item.origin}`}>{originLabel(item.origin)}</span>
            <span className={`priority-tag ${level}`}>{level === "today" ? "Due today" : level === "tomorrow" ? "Tomorrow" : level === "overdue" ? "Overdue" : level === "completed" ? "Completed" : "Upcoming"}</span>
          </div>
          <h3 className={item.status === "completed" ? "struck" : ""}>{item.title}</h3>
          <p className="assignment-description">{item.description}</p>
          {item.instructions && <p className="assignment-instruction"><span>Instructions</span> {item.instructions}</p>}
          {!!item.materials.length && <div className="chips">{item.materials.map((material) => <span className="material-chip" key={material}><BookOpen size={12} />{material}</span>)}</div>}
          {!!item.attachments?.length && <div className="chips">{item.attachments.map((attachment) => <a className="material-chip attachment-chip" key={attachment.url} href={attachment.url} target="_blank" rel="noreferrer"><FileText size={12} />{attachment.label}<ArrowUpRight size={11} /></a>)}</div>}
          <div className="assignment-meta">
            <span><CalendarDays size={14} /> Due {formatDate(item.dueDate)}</span>
            {item.teacher && <span><GraduationCap size={14} />{item.teacher}</span>}
            {item.reminderAt && <span><AlarmClock size={14} />Reminder set</span>}
          </div>
        </div>
        <div className="card-actions">
          {item.originalUrl && <a className="icon-button" href={item.originalUrl} target="_blank" rel="noreferrer" title="Open original School Canvas page"><ArrowUpRight size={17} /></a>}
          {addExampleAction(item)}
        </div>
      </article>
    );
  };

  const messageCard = (message: TeacherMessage) => {
    const canOfferTask = hasAssignmentAndDeadline(message.content);
    return (
      <article className="message-card" key={message.id}>
        <div className="avatar">{(message.teacher ?? message.subject ?? "S").slice(0, 1)}</div>
        <div className="message-body">
          <div className="message-heading">
            <div><h3 className="message-person">{message.teacher ?? "Student"}</h3>{message.subject && <span className="message-subject">{message.subject}</span>}</div>
            <span className={`category-tag ${message.category.toLowerCase().replaceAll(" ", "-")}`}>{message.category}</span>
          </div>
          <p>{message.content}</p>
          <div className="message-footer">
            <span>{formatDateTime(message.postedAt)}{message.origin === "sample" ? " · Sample" : message.origin === "manual" ? " · Added by you" : " · Synced"}</span>
            {message.readState && <span className={`read-state ${message.readState}`}>{message.readState}</span>}
            {message.originalUrl && <a href={message.originalUrl} target="_blank" rel="noreferrer">Open original <ArrowUpRight size={13} /></a>}
            {canOfferTask && <button className="text-button" onClick={() => createFromMessage(message)}>Create homework</button>}
          </div>
        </div>
      </article>
    );
  };

  const setViewAndClose = (next: View) => {
    setView(next);
    setMobileMenu(false);
  };

  const viewLabel = (label: View) => label === "Dashboard" ? "Good to see you" : label;
  const dateNow = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <div className={`app-shell ${data.theme === "dark" ? "dark-theme" : ""}`}>
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={21} /></div>
          <div><strong>student hub</strong><small>DEENS ACADEMY</small></div>
          <button className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav">
          {navigation.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-link ${view === label ? "active" : ""}`} onClick={() => setViewAndClose(label)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {label === "Homework" && overdue.length > 0 && <span className="nav-count">{overdue.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sync-mini"><span className={`status-dot ${data.syncStatus?.status === "complete" ? "online" : ""}`} /><div><strong>School Canvas</strong><small>{syncLabel}</small></div></div>
          <button className="connect-link" onClick={syncNow}><Cloud size={16} /> Sync now <ArrowUpRight size={14} /></button>
          <div className="local-note">Your Student Hub data stays in this browser.</div>
        </div>
      </aside>

      {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Close navigation" />}

      <main className="main-area">
        <header className="topbar">
          <button className="menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="breadcrumb"><span>Student Hub</span><ChevronRight size={14} /><strong>{view}</strong></div>
          <div className="topbar-actions">
            <span className="current-date">{dateNow}</span>
            <button
              className={`theme-switch ${data.theme === "dark" ? "is-dark" : ""}`}
              role="switch"
              aria-checked={data.theme === "dark"}
              aria-label={`Switch to ${data.theme === "light" ? "night" : "day"} mode`}
              onClick={() => setTheme(data.theme === "light" ? "dark" : "light")}
            >
              <span className="theme-switch-label">Day</span>
              <span className="theme-switch-track">
                <span className="theme-switch-thumb">{data.theme === "light" ? <Sun size={13} /> : <Moon size={13} />}</span>
              </span>
              <span className="theme-switch-label">Night</span>
            </button>
            <button className="button sync-button" onClick={syncNow} disabled={busySync || !!data.syncStatus?.running}>
              {busySync || data.syncStatus?.running ? <LoaderCircle className="spin" size={16} /> : <Cloud size={16} />}
              <span>{busySync || data.syncStatus?.running ? "Syncing" : "Sync"}</span>
            </button>
          </div>
        </header>

        <div className="page-content">
          {(demoMode || syncError || data.syncStatus?.error || showSyncConfirmation) && (
            <div
              className={`notice-banner ${syncError || data.syncStatus?.error ? "error-banner" : showSyncConfirmation ? "success-banner" : ""}`}
              role={showSyncConfirmation && !syncError && !data.syncStatus?.error ? "status" : "alert"}
            >
              {syncError || data.syncStatus?.error
                ? <><CircleHelp size={17} /><span>{syncError || data.syncStatus?.error}</span></>
                : showSyncConfirmation
                  ? <><CheckCircle2 size={17} /><span>School Canvas sync completed. Student Hub has {syncedCounts.assignments} homework {syncedCounts.assignments === 1 ? "assignment" : "assignments"}, {syncedCounts.messages} {syncedCounts.messages === 1 ? "message" : "messages"}, and {syncedCounts.announcements} {syncedCounts.announcements === 1 ? "notice" : "notices"}.{syncedCounts.announcements === 0 && (latestNoticeDiagnostics
                    ? ` Notice Board extraction found ${latestNoticeDiagnostics.sectionCount} .bn sections, ${latestNoticeDiagnostics.headingCount} “Notice Details” headings, and ${latestNoticeDiagnostics.extractedCount} notices.`
                    : ` ${noticeBoardCaptures.length ? "The Notice Board page was captured, but its extraction diagnostics are unavailable." : "The Notice Board page was not captured."}`)}</span></>
                  : <><Sparkles size={16} /><span>Examples are labeled <b>Sample</b>. They are not verified School Canvas records.</span></>}
              <button
                onClick={() => {
                  setSyncError("");
                  if (showSyncConfirmation) setDismissedSyncAt(completedSyncAt);
                }}
                aria-label="Dismiss"
              ><X size={15} /></button>
            </div>
          )}

          <div className="page-heading">
            <div><div className="eyebrow">{view === "Dashboard" ? dateNow : "STUDENT WORKSPACE"}</div><h1>{viewLabel(view)}{view === "Dashboard" && <span className="heading-period">, student</span>}</h1><p>{viewDescription(view)}</p></div>
            {(view === "Homework" || view === "Calendar") && <button className="button primary" onClick={() => view === "Homework" ? openAssignment() : openEventModal()}><Plus size={17} />{view === "Homework" ? "Add homework" : "Add event"}</button>}
          </div>

          {view === "Dashboard" && (
            <DashboardView
              assignments={assignments}
              messages={messages.filter((message) =>
                message.subject &&
                message.teacher &&
                message.sender?.toLocaleLowerCase() === message.teacher.toLocaleLowerCase(),
              )}
              calendarEvents={calendarEvents}
              progress={progress}
              dueToday={dueToday}
              overdue={overdue}
              openView={setViewAndClose}
              renderMessage={messageCard}
              onAdd={() => openAssignment()}
            />
          )}

          {view === "Homework" && (
            <section className="content-section">
              <div className="homework-summary">
                <MiniMetric label="Overdue" value={overdue.length} tone="red" />
                <MiniMetric label="Due today" value={dueToday.length} tone="blue" />
                <MiniMetric label="Completed" value={completed.length} tone="green" />
                <div className="summary-progress"><div className="progress-ring" style={{ "--progress": `${progress}%` } as React.CSSProperties}><span>{progress}%</span></div><div><strong>Overall progress</strong><small>{completed.length} of {assignments.length} done</small></div></div>
              </div>
              <div className="toolbar">
                <div className="segmented">
                  {["All", "Overdue", "Today", "Tomorrow", "Upcoming", "Completed"].map((item) => <button key={item} className={homeworkGroup === item ? "selected" : ""} onClick={() => setHomeworkGroup(item)}>{item}</button>)}
                </div>
                <div className="toolbar-actions">
                  <label className="select-wrap"><Filter size={14} /><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option>All subjects</option>{[...new Set(assignments.map((item) => item.subject))].sort().map((subject) => <option key={subject}>{subject}</option>)}</select><ChevronDown size={14} /></label>
                  <button className="button subtle" onClick={() => setSortOrder(sortOrder === "Soonest first" ? "Latest first" : "Soonest first")}><ArrowDownUp size={15} />{sortOrder}</button>
                  <button className="button subtle" onClick={completeAllVisible} disabled={!sortedAssignments.some((item) => item.status !== "completed")}><CheckCircle2 size={15} />Complete all</button>
                </div>
              </div>
              {sortedAssignments.length ? <div className="assignment-list">{sortedAssignments.map(assignmentCard)}</div> : <EmptyState icon={ClipboardList} title="No homework in this view" detail="Try another filter or add an assignment to get started." action="Add homework" onAction={() => openAssignment()} />}
            </section>
          )}

          {view === "Messages" && (
            <section className="content-section">
              <div className="toolbar messages-toolbar">
                <div className="search-field"><Search size={15} /><input aria-label="Search teachers and messages" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search teachers or messages" /></div>
                <label className="message-filter"><span>Type</span><select aria-label="Filter messages by type" value={messageFilter} onChange={(event) => setMessageFilter(event.target.value)}>{["All messages", ...categories].map((item) => <option key={item}>{item}</option>)}</select></label>
              </div>
              {activeMessageThread ? (
                <div className="conversation-view">
                  <header className="conversation-header">
                    <button className="button subtle" onClick={() => setSelectedMessageThread(null)}><ArrowLeft size={15} />All conversations</button>
                    <div className="conversation-teacher">
                      <span className="avatar">{activeMessageThread.teacher.slice(0, 1)}</span>
                      <div><h2>{activeMessageThread.teacher}</h2><p>{activeMessageThread.messages.length} {activeMessageThread.messages.length === 1 ? "message" : "messages"} in this conversation</p></div>
                    </div>
                  </header>
                  <div className="conversation-messages">
                    {activeMessageThread.messages.map(messageCard)}
                  </div>
                  <p className="subtle-copy">Showing messages available in the School Canvas pages captured by sync. Replies are sent in School Canvas.</p>
                </div>
              ) : (
                <>
                  <div className="conversation-list-heading"><div><h2>Conversations</h2><p>Choose a teacher to view the messages available in your synced history.</p></div><span>{filteredMessageThreads.length} {filteredMessageThreads.length === 1 ? "teacher" : "teachers"}</span></div>
                  <div className="conversation-list">{filteredMessageThreads.map((thread) => {
                    const latest = thread.messages[0];
                    return (
                      <button className="conversation-row" key={thread.key} onClick={() => setSelectedMessageThread(thread.key)}>
                        <span className="avatar">{thread.teacher.slice(0, 1)}</span>
                        <span className="conversation-row-content">
                          <span className="conversation-row-top"><strong>{thread.teacher}</strong><time>{formatDateTime(latest?.postedAt)}</time></span>
                          <span className="conversation-row-preview">{latest?.content}</span>
                          <span className="conversation-row-bottom"><span>{thread.messages.length} {thread.messages.length === 1 ? "message" : "messages"}</span><span className={`category-tag ${latest?.category.toLowerCase().replaceAll(" ", "-")}`}>{latest?.category}</span></span>
                        </span>
                        <ChevronRight className="conversation-chevron" size={17} />
                      </button>
                    );
                  })}
                    {!filteredMessageThreads.length && <EmptyState icon={MessageSquareText} title={messages.length ? "No messages match" : "No messages yet"} detail={messages.length ? "Try another category or search term." : "Messages appear here after a School Canvas sync or manual import."} />}
                  </div>
                </>
              )}
            </section>
          )}

          {view === "Calendar" && (
            <CalendarView
              date={calendarDate}
              mode={calendarMode}
              selectedDay={selectedCalendarDay}
              typeFilter={calendarTypeFilter}
              eventItems={calendarEvents}
              assignments={assignments}
              setDate={setCalendarDate}
              setMode={setCalendarMode}
              setSelectedDay={setSelectedCalendarDay}
              setTypeFilter={setCalendarTypeFilter}
              onAddEvent={openEventModal}
              onToggleAssignment={toggleComplete}
              openView={setViewAndClose}
            />
          )}

          {view === "Announcements" && (
            <section className="content-section announcement-grid">
              {[...announcements].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")).map((item) => <article className="announcement-card" key={item.id}><h2>{item.title}</h2><p>{item.content}</p><div className="announcement-meta"><span>Posted On: {formatDateTime(item.postedAt)}</span></div></article>)}
              {!announcements.length && <EmptyState icon={FileText} title="No announcements yet" detail="School notices will show here when they are synchronized." />}
            </section>
          )}

          {view === "Study Materials" && (
            <section className="content-section">
              <div className="material-list">
                {messages.filter((item) => item.subject && item.category === "Study material" && item.sender?.toLocaleLowerCase() === item.teacher?.toLocaleLowerCase()).sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")).map((item) => <article className="material-card" key={item.id}><div className="material-icon"><BookOpen size={19} /></div><div><div className="material-head"><span className="subject-pill">{item.subject}</span><span className={`origin-tag ${item.origin}`}>{originLabel(item.origin)}</span></div><h3>{item.content}</h3><p>{item.teacher ?? "Teacher not identified"} · {formatDateTime(item.postedAt)}</p></div>{item.originalUrl && <a href={item.originalUrl} target="_blank" rel="noreferrer" className="icon-button" title="Open original"><ArrowUpRight size={17} /></a>}</article>)}
                {!messages.some((item) => item.subject && item.category === "Study material" && item.sender?.toLocaleLowerCase() === item.teacher?.toLocaleLowerCase()) && <EmptyState icon={BookOpen} title="No study materials yet" detail="Material upload messages will be collected here." />}
              </div>
            </section>
          )}

          {(view === "Attendance" || view === "Report Cards") && (
            <EmptyState icon={view === "Attendance" ? CheckCircle2 : GraduationCap} title={`${view} data is not connected`} detail="This section is ready for authorized School Canvas data. No attendance or grades have been fabricated." />
          )}

          {view === "AI Assistant" && (
            <section className="assistant-layout">
              <div className="assistant-intro"><div className="assistant-orb"><Sparkles size={23} /></div><div><h2>Ask about your schoolwork</h2><p>Answers come only from the assignments and messages currently in Student Hub.</p></div></div>
              <div className="suggestion-row">{["What homework do I have tomorrow?", "Which assignments are overdue?", "Show Mathematics homework", "Summarise my unread teacher messages"].map((prompt) => <button key={prompt} onClick={() => setChatInput(prompt)}>{prompt}</button>)}</div>
              <div className="chat-log">{chat.map((item, index) => <div key={`${index}-${item.question}`} className="chat-turn"><div className="user-bubble">{item.question}</div><div className="assistant-bubble"><Sparkles size={15} />{item.answer}</div></div>)}{!chat.length && <div className="chat-empty"><Sparkles size={20} /><p>Ask a question to get started.</p></div>}</div>
              <form className="chat-form" onSubmit={askAssistant}><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about your assignments or messages..." /><button className="button primary" type="submit" disabled={!chatInput.trim()}><Send size={16} /> Ask</button></form>
              <p className="assistant-footnote">This assistant uses local rules and your Student Hub data. It does not send questions or school records to an AI service.</p>
            </section>
          )}

          {view === "Settings" && (
            <SettingsView
              data={data}
              syncLabel={syncLabel}
              setTheme={setTheme}
              onSync={syncNow}
              onExport={() => downloadJson(data)}
              onImport={(items) => save((current) => ({ ...current, assignments: [...items, ...current.assignments] }))}
              onInterval={(hours) => {
                save((current) => ({ ...current, syncIntervalHours: hours }));
                setSyncInterval(hours).catch((error: unknown) =>
                  setSyncError(error instanceof Error ? error.message : "Could not update the sync interval."),
                );
              }}
            />
          )}
        </div>
      </main>

      <nav className="mobile-bottom-nav">
        {navigation.slice(0, 5).map(({ label, icon: Icon }) => <button key={label} className={view === label ? "active" : ""} onClick={() => setViewAndClose(label)}><Icon size={18} /><span>{label === "Dashboard" ? "Home" : label === "Announcements" ? "Notices" : label}</span></button>)}
        <button onClick={() => setMobileMenu(true)}><Menu size={18} /><span>More</span></button>
      </nav>

      {modal === "assignment" && <Modal title={editing ? "Edit homework" : "Add homework"} close={() => { setModal(null); setEditing(null); }}>
        <form className="form-grid" onSubmit={submitAssignment}>
          <label>Subject<input id="assignment-subject" name="subject" required defaultValue={editing?.subject} placeholder="e.g. Mathematics" /></label>
          <label>Assignment title<input id="assignment-title" name="title" required defaultValue={editing?.title} placeholder="What needs to be done?" /></label>
          <label className="full">Description<textarea id="assignment-description" name="description" rows={3} defaultValue={editing?.description} placeholder="Full assignment details" /></label>
          <label>Due date<input id="assignment-due" name="dueDate" type="date" required defaultValue={editing?.dueDate} /></label>
          <label>Teacher (optional)<input name="teacher" defaultValue={editing?.teacher} /></label>
          <label>Materials (comma separated)<input name="materials" defaultValue={editing?.materials.join(", ")} placeholder="Notebook, chart paper" /></label>
          <label>Reminder time (optional)<input name="reminderAt" type="datetime-local" defaultValue={editing?.reminderAt} /><small>Browser notifications run while Student Hub is open.</small></label>
          <label className="full">Submission instructions<textarea name="instructions" rows={2} defaultValue={editing?.instructions} /></label>
          <label className="full">Original link (optional)<input name="originalUrl" type="url" defaultValue={editing?.originalUrl} placeholder="https://student.schoolcanvas.com/..." /></label>
          <div className="form-actions"><button type="button" className="button subtle" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="button primary">{editing ? "Save changes" : "Add homework"}</button></div>
        </form>
      </Modal>}
      {modal === "event" && <Modal title="Add calendar event" close={() => setModal(null)}><form className="form-grid" onSubmit={submitEvent}><label className="full">Event title<input name="title" required placeholder="e.g. Reading time" /></label><label className="full">Date<input name="date" type="date" required defaultValue={eventDraftDate} /></label><div className="form-actions"><button className="button subtle" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button primary" type="submit">Add event</button></div></form></Modal>}
    </div>
  );
}

function viewDescription(view: View) {
  const descriptions: Record<View, string> = {
    Dashboard: "Your schoolwork, thoughtfully organized.",
    Homework: "Keep track of every assignment and deadline.",
    Calendar: "See school deadlines and personal plans together.",
    Messages: "Teacher messages and their useful takeaways.",
    Announcements: "Important school updates in one place.",
    "Study Materials": "Find resources shared by your teachers.",
    Attendance: "Attendance records from your school portal.",
    "Report Cards": "Academic results from your school portal.",
    "AI Assistant": "A helpful view of the data you have available.",
    Settings: "Manage your data, theme, and sync preferences.",
  };
  return descriptions[view];
}

function DashboardView({
  assignments,
  messages,
  calendarEvents,
  progress,
  dueToday,
  overdue,
  openView,
  renderMessage,
  onAdd,
}: {
  assignments: Assignment[];
  messages: TeacherMessage[];
  calendarEvents: DerivedCalendarEvent[];
  progress: number;
  dueToday: Assignment[];
  overdue: Assignment[];
  openView: (view: View) => void;
  renderMessage: (item: TeacherMessage) => JSX.Element;
  onAdd: () => void;
}) {
  const next = assignments
    .filter((item) => item.status !== "completed" && item.dueDate >= todayISO())
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  const completed = assignments.filter((item) => item.status === "completed").length;

  return (
    <>
      <section className="welcome-panel">
        <div className="welcome-copy"><span className="welcome-kicker">YOUR ACADEMIC OVERVIEW</span><h2>A little progress goes a long way.</h2><p>Keep your tasks close, your plans clear, and your focus on what matters.</p><button className="button light-button" onClick={() => openView("Homework")}>View homework <ArrowUpRight size={16} /></button></div>
        <div className="welcome-art" aria-hidden="true"><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="art-book"><BookOpen size={48} /></div><Sparkles className="art-sparkle sparkle-one" size={18} /><Sparkles className="art-sparkle sparkle-two" size={13} /></div>
        <div className="progress-panel"><div className="progress-ring large" style={{ "--progress": `${progress}%` } as React.CSSProperties}><span>{progress}%</span></div><div><strong>Your progress</strong><small>{completed} of {assignments.length} tasks completed</small></div></div>
      </section>
      <section className="metric-grid">
        <MetricCard label="Due today" value={dueToday.length} note={dueToday.length ? "Keep these on your radar" : "Nothing due today"} icon={CalendarDays} tone="blue" onClick={() => openView("Homework")} />
        <MetricCard label="Overdue" value={overdue.length} note={overdue.length ? "A good place to start" : "You're all caught up"} icon={AlarmClock} tone="rose" onClick={() => openView("Homework")} />
        <MetricCard label="Open tasks" value={assignments.filter((item) => item.status === "pending").length} note="Across all subjects" icon={ClipboardList} tone="violet" onClick={() => openView("Homework")} />
        <MetricCard label="Teacher messages" value={messages.length} note="Available in your inbox" icon={MessageSquareText} tone="mint" onClick={() => openView("Messages")} />
      </section>
      <div className="dashboard-columns">
        <section className="panel upcoming-panel"><PanelHeader title="Coming up" subtitle="Your next deadlines" action="All homework" onAction={() => openView("Homework")} />{next.length ? <div className="compact-assignment-list">{next.map((item) => <div className="compact-assignment" key={item.id}><div className={`due-date-box ${priority(item)}`}><strong>{new Date(`${item.dueDate}T00:00:00`).getDate()}</strong><small>{new Date(`${item.dueDate}T00:00:00`).toLocaleDateString("en", { month: "short" })}</small></div><div className="compact-assignment-copy"><span>{item.subject}</span><strong>{item.title}</strong></div><span className={`priority-tag ${priority(item)}`}>{priority(item) === "today" ? "Today" : priority(item) === "tomorrow" ? "Tomorrow" : "Upcoming"}</span></div>)}</div> : <EmptyState icon={CalendarDays} title="No upcoming deadlines" detail="Add homework to plan your week." action="Add homework" onAction={onAdd} />}</section>
        <section className="panel week-panel"><PanelHeader title="Your week" subtitle="A quick look at your workload" /><div className="week-visual">{Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - date.getDay() + index); const isoDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); const count = calendarEvents.filter((item) => item.date === isoDate && !item.completed).length; return <div className={`week-day ${isoDate === todayISO() ? "current" : ""}`} key={isoDate}><span>{date.toLocaleDateString("en", { weekday: "short" })}</span><div className="week-bar-track"><div style={{ height: `${count ? Math.min(100, 25 + count * 30) : 5}%` }} className={count ? "has-task" : ""} /></div><strong>{date.getDate()}</strong><small>{count ? `${count} item${count > 1 ? "s" : ""}` : "Free"}</small></div>; })}</div><div className="week-legend"><span><i className="legend-dot due-dot" />Scheduled</span><span><i className="legend-dot free-dot" />Free day</span></div></section>
      </div>
      <section className="panel dashboard-message-panel"><PanelHeader title="Recent messages" subtitle="The latest from your teachers" action="Open inbox" onAction={() => openView("Messages")} />{messages.length ? <div className="message-list compact-messages">{[...messages].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")).slice(0, 2).map(renderMessage)}</div> : <EmptyState icon={MessageSquareText} title="No messages yet" detail="Teacher messages will appear here after sync." />}</section>
      <div className="quick-links"><strong>Quick access</strong>{(["Homework", "Messages", "Announcements", "Study Materials"] as View[]).map((item) => <button key={item} onClick={() => openView(item)}>{item}<ArrowUpRight size={15} /></button>)}</div>
    </>
  );
}

function MetricCard({ label, value, note, icon: Icon, tone, onClick }: { label: string; value: number; note: string; icon: LucideIcon; tone: string; onClick: () => void }) {
  return <button className="metric-card" onClick={onClick}><span className={`metric-icon ${tone}`}><Icon size={18} /></span><span className="metric-label">{label}</span><strong>{value}</strong><small>{note}</small></button>;
}

function MiniMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="mini-metric"><span className={`metric-dot ${tone}`} /><div><strong>{value}</strong><small>{label}</small></div></div>;
}

function PanelHeader({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) {
  return <div className="panel-header"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && onAction && <button className="text-button" onClick={onAction}>{action}<ArrowUpRight size={14} /></button>}</div>;
}

function EmptyState({ icon: Icon, title, detail, action, onAction }: { icon: LucideIcon; title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={21} /></div><h3>{title}</h3><p>{detail}</p>{action && onAction && <button className="button subtle" onClick={onAction}><Plus size={15} />{action}</button>}</div>;
}

function CalendarView({
  date,
  mode,
  selectedDay,
  typeFilter,
  eventItems,
  assignments,
  setDate,
  setMode,
  setSelectedDay,
  setTypeFilter,
  onAddEvent,
  onToggleAssignment,
  openView,
}: {
  date: Date;
  mode: "Month" | "Week" | "Day";
  selectedDay: string;
  typeFilter: "All" | CalendarEventType;
  eventItems: DerivedCalendarEvent[];
  assignments: Assignment[];
  setDate: (date: Date) => void;
  setMode: (mode: "Month" | "Week" | "Day") => void;
  setSelectedDay: (iso: string) => void;
  setTypeFilter: (filter: "All" | CalendarEventType) => void;
  onAddEvent: (dateIso?: string) => void;
  onToggleAssignment: (assignment: Assignment) => void;
  openView: (view: View) => void;
}) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = new Date(year, month, 1).getDay();
  const totalMonthCells = Math.ceil((monthStart + daysInMonth) / 7) * 7;
  const toISO = (value: Date) =>
    new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const move = (offset: number) => {
    const next = new Date(date);
    if (mode === "Month") next.setMonth(next.getMonth() + offset);
    else next.setDate(next.getDate() + offset * (mode === "Week" ? 7 : 1));
    setDate(next);
    if (mode === "Day") setSelectedDay(toISO(next));
  };

  const filteredEvents = typeFilter === "All"
    ? eventItems
    : eventItems.filter((item) => item.type === typeFilter);

  const calendarDays: Array<{ date: Date; outside: boolean }> = mode === "Month"
    ? Array.from({ length: totalMonthCells }, (_, index) => {
        const current = new Date(year, month, index - monthStart + 1);
        return { date: current, outside: current.getMonth() !== month };
      })
    : (() => {
        const first = new Date(date);
        if (mode === "Week") first.setDate(date.getDate() - date.getDay());
        return Array.from({ length: mode === "Week" ? 7 : 1 }, (_, index) => {
          const current = new Date(first);
          current.setDate(first.getDate() + index);
          return { date: current, outside: false };
        });
      })();

  const weekdays = mode === "Day"
    ? [date.toLocaleDateString("en", { weekday: "long" })]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const heading = mode === "Month"
    ? date.toLocaleDateString("en", { month: "long", year: "numeric" })
    : mode === "Week"
      ? `Week of ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(calendarDays[0]?.date ?? date)}`
      : date.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const selectedDayEvents = filteredEvents.filter((item) => item.date === selectedDay);
  const filterTabs: Array<"All" | CalendarEventType> = ["All", "Homework", "Exam", "Project", "Announcement", "Personal"];
  const now = new Date();
  const monthWindow = Array.from({ length: 5 }, (_, index) => {
    const offset = index - 2;
    const monthDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const count = filteredEvents.filter((item) => item.date.startsWith(monthKey)).length;
    return {
      offset,
      date: monthDate,
      monthKey,
      count,
      label: monthDate.toLocaleDateString("en", { month: "short", year: "numeric" }),
      isActive: date.getFullYear() === monthDate.getFullYear() && date.getMonth() === monthDate.getMonth(),
    };
  });

  const selectMonthFromWindow = (monthDate: Date, monthKey: string) => {
    setDate(monthDate);
    if (monthKey === todayISO().slice(0, 7)) {
      setSelectedDay(todayISO());
      return;
    }
    const firstMatch = filteredEvents.find((item) => item.date.startsWith(monthKey));
    setSelectedDay(firstMatch?.date ?? `${monthKey}-01`);
  };

  return (
    <section className="calendar-layout">
      <div className="calendar-panel panel">
        <div className="calendar-toolbar">
          <div className="calendar-title">
            <div className="calendar-switch">
              <button className="icon-button" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft size={17} /></button>
              <button className="icon-button" onClick={() => move(1)} aria-label="Next"><ChevronRight size={17} /></button>
            </div>
            <h2>{heading}</h2>
            <button className="text-button" onClick={() => { const current = new Date(); setDate(current); setSelectedDay(todayISO()); }}>Today</button>
          </div>
          <div className="calendar-toolbar-controls">
            <div className="segmented compact">
              {(["Month", "Week", "Day"] as const).map((item) =>
                <button key={item} className={mode === item ? "selected" : ""} onClick={() => setMode(item)}>{item}</button>,
              )}
            </div>
          </div>
        </div>
        <div className="calendar-month-strip" aria-label="Quick month switcher">
          {monthWindow.map((item) => (
            <button
              key={item.monthKey}
              type="button"
              className={`month-pill ${item.isActive ? "selected" : ""}`}
              onClick={() => selectMonthFromWindow(item.date, item.monthKey)}
            >
              <span>{item.label}</span>
              <small>{item.count}</small>
            </button>
          ))}
        </div>
        <div className="calendar-filter-bar">
          <div className="segmented compact">
            {filterTabs.map((tab) => {
              const count = tab === "All" ? eventItems.length : eventItems.filter((item) => item.type === tab).length;
              return (
                <button key={tab} className={typeFilter === tab ? "selected" : ""} onClick={() => setTypeFilter(tab)}>
                  {tab} ({count})
                </button>
              );
            })}
          </div>
        </div>
        <div className="calendar-grid">
          <div className={`weekday-row ${mode.toLowerCase()}`}>
            {weekdays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className={`date-grid ${mode.toLowerCase()}`}>
            {calendarDays.map(({ date: day, outside }) => {
              const iso = toISO(day);
              const matches = filteredEvents.filter((item) => item.date === iso);
              const isSelected = iso === selectedDay;
              const isToday = iso === todayISO();
              const maxVisible = mode === "Month" ? 3 : matches.length;
              return (
                <div
                  key={iso}
                  role="button"
                  tabIndex={0}
                  className={`calendar-cell ${outside ? "outside" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                  onClick={() => setSelectedDay(iso)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedDay(iso);
                    }
                  }}
                >
                  <div className="calendar-cell-top">
                    <span className="day-number">{day.getDate()}</span>
                    {matches.length > 0 && <span className="cell-count">{matches.length}</span>}
                  </div>
                  <div className="cell-events">
                    {matches.slice(0, maxVisible).map((item) => (
                      <div key={item.id} className={`calendar-event ${item.type.toLowerCase().replaceAll(" ", "-")} ${item.completed ? "is-complete" : ""}`} title={item.title}>
                        <span className="calendar-event-title">{item.title}</span>
                        {mode !== "Month" && item.details && item.details !== item.title && (
                          <small className="calendar-event-detail">{item.details}</small>
                        )}
                      </div>
                    ))}
                    {matches.length > maxVisible && <small>+{matches.length - maxVisible} more</small>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <aside className="calendar-aside panel">
        <div className="agenda-header">
          <div>
            <span className="eyebrow">SELECTED DAY</span>
            <h3>{new Date(`${selectedDay}T00:00:00`).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</h3>
          </div>
          <button className="button subtle" onClick={() => onAddEvent(selectedDay)}><Plus size={14} /> Add</button>
        </div>
        {selectedDayEvents.length ? (
          <div className="agenda-list">
            {selectedDayEvents.map((item) => {
              const linkedAssignment = item.assignmentId
                ? assignments.find((assignment) => assignment.id === item.assignmentId)
                : undefined;
              return (
                <article className="agenda-card" key={item.id}>
                  <div className="agenda-card-top">
                    <span className={`calendar-event ${item.type.toLowerCase().replaceAll(" ", "-")}`}>{item.type}</span>
                    {item.updatedFromPrevious && <span className="updated-badge">Updated date</span>}
                  </div>
                  <strong className={item.completed ? "struck" : ""}>{item.title}</strong>
                  {item.details && item.details !== item.title && <p>{item.details}</p>}
                  <div className="agenda-card-footer">
                    <span className="agenda-source">{item.sourceLabel}</span>
                    {linkedAssignment && (
                      <button className="text-button" onClick={() => onToggleAssignment(linkedAssignment)}>
                        {linkedAssignment.status === "completed" ? "Mark pending" : "Mark done"}
                      </button>
                    )}
                    {item.source === "message" && (
                      <button className="text-button" onClick={() => openView("Messages")}>View message</button>
                    )}
                    {item.source === "announcement" && (
                      <button className="text-button" onClick={() => openView("Announcements")}>View notice</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="agenda-empty">
            <p>Nothing scheduled on this date{typeFilter !== "All" ? ` under ${typeFilter}` : ""}.</p>
            <button className="button subtle" onClick={() => onAddEvent(selectedDay)}><Plus size={14} /> Add event</button>
          </div>
        )}
        <div className="calendar-aside-divider" />
        <h4>Event types</h4>
        <div className="calendar-legend">
          <span><i className="legend-dot due-dot" />Homework</span>
          <span><i className="legend-dot exam-dot" />Exams</span>
          <span><i className="legend-dot project-dot" />Projects</span>
          <span><i className="legend-dot notice-dot" />Announcements</span>
          <span><i className="legend-dot personal-dot" />Personal</span>
        </div>
        <div className="calendar-aside-note">
          <CalendarDays size={17} />
          <p>Homeworks, exams, and notices are read from Homework, teacher messages, and Notice Board. Newer notices or messages automatically update matching dates.</p>
        </div>
      </aside>
    </section>
  );
}

function SettingsView({
  data,
  syncLabel,
  setTheme,
  onSync,
  onExport,
  onImport,
  onInterval,
}: {
  data: HubData;
  syncLabel: string;
  setTheme: (theme: "light" | "dark") => void;
  onSync: () => void;
  onExport: () => void;
  onImport: (items: Assignment[]) => void;
  onInterval: (hours: number) => void;
}) {
  const [importError, setImportError] = useState("");
  function importFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of homework records.");
        const items = parsed.map((item: unknown, index: number) => {
          if (!item || typeof item !== "object" || typeof (item as Record<string, unknown>).subject !== "string" || typeof (item as Record<string, unknown>).title !== "string" || typeof (item as Record<string, unknown>).dueDate !== "string") {
            throw new Error(`Record ${index + 1} needs subject, title, and dueDate fields.`);
          }
          const record = item as Record<string, unknown>;
          return {
            id: id("imported"),
            subject: record.subject as string,
            title: record.title as string,
            description: typeof record.description === "string" ? record.description : "",
            dueDate: record.dueDate as string,
            materials: Array.isArray(record.materials) ? record.materials.filter((entry: unknown): entry is string => typeof entry === "string") : [],
            instructions: typeof record.instructions === "string" ? record.instructions : "",
            status: "pending" as const,
            origin: "manual" as const,
          };
        });
        onImport(items);
        setImportError("");
      } catch (error) {
        setImportError(error instanceof Error ? error.message : "Could not import that file.");
      }
    };
    reader.readAsText(file);
  }
  return <section className="settings-layout">
    <div className="settings-section panel"><div className="settings-heading"><div className="settings-icon"><Cloud size={18} /></div><div><h2>School Canvas connection</h2><p>Reads rendered pages from the signed-in browser session. No API key, password, cookie, or token is collected.</p></div></div><div className="setting-row"><div><strong>Sync status</strong><small>{syncLabel}{data.syncStatus?.completedAt ? ` · ${new Date(data.syncStatus.completedAt).toLocaleString()}` : ""}</small></div><button className="button primary" onClick={onSync}><Cloud size={15} /> Sync now</button></div><div className="setting-row"><div><strong>Background sync frequency</strong><small>The browser must be running; School Canvas must still have a valid session.</small></div><select value={data.syncIntervalHours} onChange={(event) => onInterval(Number(event.target.value))}><option value={1}>Every hour</option><option value={6}>Every 6 hours</option><option value={12}>Every 12 hours</option><option value={24}>Daily</option></select></div><div className="settings-callout"><CircleHelp size={16} /><span>Background sync may be limited by Safari. The current extension manifest is MV3 and must be packaged/installed for your browser.</span></div></div>
    <div className="settings-section panel"><div className="settings-heading"><div className="settings-icon"><Sun size={18} /></div><div><h2>Appearance</h2><p>Choose your preferred reading theme.</p></div></div><div className="theme-choices"><button className={data.theme === "light" ? "chosen" : ""} onClick={() => setTheme("light")}><Sun size={17} />Light</button><button className={data.theme === "dark" ? "chosen" : ""} onClick={() => setTheme("dark")}><Moon size={17} />Dark</button></div></div>
    <div className="settings-section panel"><div className="settings-heading"><div className="settings-icon"><Upload size={18} /></div><div><h2>Your data</h2><p>Everything is stored locally in this browser profile. Export a backup or import assignments from JSON.</p></div></div><div className="setting-actions"><button className="button subtle" onClick={onExport}><Upload size={15} />Export JSON</button><label className="button subtle file-button"><Plus size={15} />Import assignments<input type="file" accept="application/json,.json" onChange={(event) => importFile(event.target.files?.[0])} /></label></div>{importError && <p className="field-error">{importError}</p>}<p className="json-hint">Import format: JSON array of objects with <code>subject</code>, <code>title</code>, <code>dueDate</code>, and optional <code>description</code>, <code>materials</code>, <code>instructions</code>.</p></div>
  </section>;
}

function Modal({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></header>{children}</section></div>;
}

function downloadJson(data: HubData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "student-hub-backup.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default App;
