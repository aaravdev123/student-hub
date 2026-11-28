import { describe, expect, it } from "vitest";
import { buildCalendarEvents, extractDatesFromText } from "./calendarEvents";
import type { Announcement, Assignment, TeacherMessage } from "../types";

describe("calendar event extraction and date updates", () => {
  it("parses numeric, named-month, relative, and rescheduled dates", () => {
    expect(extractDatesFromText("Submit by 27/11/2026")).toEqual(["2026-11-27"]);
    expect(extractDatesFromText("21st Nov - Holiday", "2026-11-20T14:21:49")).toEqual(["2026-11-21"]);
    expect(extractDatesFromText("Online class - instructions for tomorrow", "2026-11-25T17:48:28")).toEqual([
      "2026-11-26",
    ]);
    expect(
      extractDatesFromText("Mathematics Exam postponed from 25/11/2026 to 02/12/2026", "2026-11-24T10:00:00"),
    ).toEqual(["2026-12-02"]);
  });

  it("adds homeworks and exams from both teacher messages and notices/announcements", () => {
    const messages: TeacherMessage[] = [
      {
        id: "msg-hw",
        sender: "Pooja Sahni",
        teacher: "Pooja Sahni",
        subject: "Computer Science",
        content: "Homework: Complete Python functions worksheet and submit by 01/12/2026.",
        postedAt: "2026-11-27T11:00:00",
        category: "Homework",
        origin: "synced",
      },
      {
        id: "msg-exam",
        sender: "Anu S Nair",
        teacher: "Anu S Nair",
        subject: "Mathematics",
        content: "Periodic Test 2 is scheduled on 5th Dec 2026.",
        postedAt: "2026-11-26T10:00:00",
        category: "Exam",
        origin: "synced",
      },
    ];
    const announcements: Announcement[] = [
      {
        id: "notice-exam",
        title: "Science Unit Test 1",
        content: "Science Unit Test 1 will be conducted on 08/12/2026.",
        postedAt: "2026-11-25T09:00:00",
        origin: "synced",
      },
      {
        id: "notice-hw",
        title: "Holiday Homework - Social Science",
        content: "Please submit the Social Science map assignment on 10/12/2026.",
        postedAt: "2026-11-25T10:00:00",
        origin: "synced",
      },
      {
        id: "notice-holiday",
        title: "21st Nov - Holiday",
        content: "Tomorrow, Saturday, 21st November, will be a non-working day.",
        postedAt: "2026-11-20T14:21:49",
        origin: "synced",
      },
    ];

    const events = buildCalendarEvents({
      assignments: [],
      messages,
      announcements,
      events: [],
    });

    expect(events).toHaveLength(5);
    expect(events.find((item) => item.subject === "Computer Science")).toMatchObject({
      type: "Homework",
      date: "2026-12-01",
    });
    expect(events.find((item) => item.subject === "Mathematics")).toMatchObject({
      type: "Exam",
      date: "2026-12-05",
    });
    expect(events.find((item) => item.subject === "Science")).toMatchObject({
      type: "Exam",
      date: "2026-12-08",
    });
    expect(events.find((item) => item.subject === "Social Science")).toMatchObject({
      type: "Homework",
      date: "2026-12-10",
    });
    expect(events.find((item) => item.title.includes("Holiday"))).toMatchObject({
      type: "Announcement",
      date: "2026-11-21",
    });
  });

  it("extracts multi-subject exam schedules from a single notice", () => {
    const announcements: Announcement[] = [
      {
        id: "timetable",
        title: "Periodic Test 2 Timetable",
        content: "Mathematics on 02/12/2026\nScience on 04/12/2026\nEnglish on 06/12/2026",
        postedAt: "2026-11-25T09:00:00",
        origin: "synced",
      },
    ];

    const events = buildCalendarEvents({
      assignments: [],
      messages: [],
      announcements,
      events: [],
    });

    expect(events).toHaveLength(3);
    expect(events.map((item) => [item.subject, item.type, item.date])).toEqual([
      ["Mathematics", "Exam", "2026-12-02"],
      ["Science", "Exam", "2026-12-04"],
      ["English", "Exam", "2026-12-06"],
    ]);
  });

  it("updates dates and avoids duplicates when a newer message or notice reiterates or reschedules an event", () => {
    const assignments: Assignment[] = [
      {
        id: "hw-geo",
        subject: "Geography",
        title: "EBSB Activity - Comparative Study",
        description: "Prepare comparative study on half chart paper.",
        dueDate: "2026-11-27",
        materials: ["half chart paper"],
        instructions: "Submit in class",
        status: "pending",
        origin: "synced",
      },
    ];
    const messages: TeacherMessage[] = [
      {
        id: "msg-exam-old",
        sender: "Anu S Nair",
        teacher: "Anu S Nair",
        subject: "Mathematics",
        content: "Mathematics Periodic Test 2 will be held on 25/11/2026.",
        postedAt: "2026-11-15T10:00:00",
        category: "Exam",
        origin: "synced",
      },
      {
        id: "msg-hw-extended",
        sender: "Mamata H Barki",
        teacher: "Mamata H Barki",
        subject: "Geography",
        content: "Geography EBSB Activity submission extended to 30/11/2026.",
        postedAt: "2026-11-26T15:00:00",
        category: "Schedule change",
        origin: "synced",
      },
    ];
    const announcements: Announcement[] = [
      {
        id: "notice-exam-new",
        title: "Updated Date: Mathematics Periodic Test 2",
        content: "Mathematics Periodic Test 2 has been rescheduled to 02/12/2026.",
        postedAt: "2026-11-22T12:00:00",
        origin: "synced",
      },
      {
        id: "notice-holiday-1",
        title: "21st Nov - Holiday",
        content: "School will remain closed on 21st November.",
        postedAt: "2026-11-19T10:00:00",
        origin: "synced",
      },
      {
        id: "notice-holiday-2",
        title: "Reminder: Holiday on 21st Nov",
        content: "Reiterating that school is closed tomorrow, 21st November.",
        postedAt: "2026-11-20T18:00:00",
        origin: "synced",
      },
    ];

    const events = buildCalendarEvents({
      assignments,
      messages,
      announcements,
      events: [],
    });

    expect(events).toHaveLength(3);
    expect(events.find((item) => item.subject === "Geography")).toMatchObject({
      date: "2026-11-30",
      updatedFromPrevious: true,
    });
    expect(events.find((item) => item.subject === "Mathematics")).toMatchObject({
      type: "Exam",
      date: "2026-12-02",
      updatedFromPrevious: true,
    });
    expect(events.filter((item) => item.date === "2026-11-21")).toHaveLength(1);
  });

  it("keeps distinct exercises in the same subject separate", () => {
    const assignments: Assignment[] = [
      {
        id: "hw-1",
        subject: "Mathematics",
        title: "Complete exercise 2A",
        description: "Exercise 2A",
        dueDate: "2026-11-25",
        materials: [],
        instructions: "",
        status: "pending",
        origin: "synced",
      },
    ];
    const messages: TeacherMessage[] = [
      {
        id: "msg-2",
        sender: "Anu S Nair",
        teacher: "Anu S Nair",
        subject: "Mathematics",
        content: "Complete exercise 3B and submit by 30/11/2026.",
        postedAt: "2026-11-26T10:00:00",
        category: "Homework",
        origin: "synced",
      },
    ];

    const events = buildCalendarEvents({
      assignments,
      messages,
      announcements: [],
      events: [],
    });

    expect(events).toHaveLength(2);
    expect(events.map((item) => item.date)).toEqual(["2026-11-25", "2026-11-30"]);
  });
});
