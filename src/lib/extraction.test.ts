import { describe, expect, it } from "vitest";
import { parseCaptures, sanitizeAnnouncementContent } from "./extraction";
import type { PageCapture } from "../types";
import { excludeReadMoreSummaries, excludeSampleRecords, mergeAssignments } from "./store";
import { groupMessagesByTeacher } from "./messageThreads";

const homeworkCapture: PageCapture = {
  url: "https://student.schoolcanvas.com/User/Student/Homework",
  title: "Homework",
  capturedAt: "2026-11-24T12:00:00.000Z",
  links: [],
  text: `24/11/2026
Mathematics : Complete exercise 2A| Due Date : 25/11/2026
Do it in math notebook

23/11/2026
Geography : Dear students
As discussed in class the EBSB activity is scheduled to be submitted on 27th Nov.
EBSB Activity - Comparative Study on Harvest Festivals Topic: Harvest Festivals of Karnataka and Ladakh Instructions:
Prepare a comparative study between the harvest festivals of Karnataka and Ladakh. The work should be presented on half chart paper.
Include the names of the festivals, customs, food, attire and cultural significance.
| Due Date : 27/11/2026

Mathematics : Exercise 2A- textbook 2-| Due Date : 24/11/2026
Q4, 5 and 6
Do it in math notebook`,
};

const messagesCapture: PageCapture = {
  url: "https://student.schoolcanvas.com/User/Student/TwcMessages",
  title: "Teacher Messages",
  capturedAt: "2026-11-24T12:00:00.000Z",
  links: [],
  text: `Mamata H Barki Kaddaya Kannada
Dear Parents, Kindly find the Poem - Grammar - Kaalagalu notes.
Posted On : 11/11/2026 9:57:45 AM

Pooja Sahni Computer Science
Reference material for computer subject on the topic functions is uploaded on e-cont.
Posted On : 05/11/2026 1:53:44 PM`,
};

const noticeCapture: PageCapture = {
  url: "https://student.schoolcanvas.com/User/Student/NoticeBoard",
  title: "Notice Board",
  capturedAt: "2026-11-24T12:00:00.000Z",
  links: [],
  text: `Notice Details
21st Nov - Holiday

Dear Parents,
Please note that tomorrow, Saturday, 21st November, will be a non-working day for the school.
Thank you.
Poornima

Posted On : 20/11/2026 02:21:49 PM`,
};

const structuredHomeworkCapture: PageCapture = {
  url: "https://student.schoolcanvas.com/User/Student/HomeWork",
  title: "/User/Student/HomeWork",
  capturedAt: "2026-11-24T12:00:00.000Z",
  links: [],
  text: "",
  homeworkItems: [
    {
      subject: "Mathematics",
      description: "Mathematics : Complete exercise 2A\nDo it in math notebook",
      postedDate: "24/11/2026",
      dueDate: "25/11/2026",
      attachments: [],
    },
    {
      subject: "Geography",
      description:
        "Geography : Dear students\nEBSB Activity - Comparative Study on Harvest Festivals Topic: Harvest Festivals of Karnataka and Ladakh Instructions: Prepare a comparative study between the harvest festivals of Karnataka and Ladakh. The work should be presented on half chart paper. Include the names of festivals, customs, food, attire and cultural significance.",
      postedDate: "23/11/2026",
      dueDate: "27/11/2026",
      attachments: [{ url: "https://palarm.sgp1.digitaloceanspaces.com/sample.pdf", label: "Homework attachment" }],
    },
  ],
};

const structuredMessagesCapture: PageCapture = {
  url: "https://student.schoolcanvas.com/User/Student/TwcMessages",
  title: "/User/Student/TwcMessages",
  capturedAt: "2026-11-25T13:00:00.000Z",
  links: [],
  text: "",
  messageItems: [
    {
      teacher: "Pooja Sahni",
      subject: "Computer Science",
      content: "Dear Students Reference material for computer subject on the topic functions is uploaded on e-content.",
      postedAt: "11/5/2026 1:53:44 PM",
    },
    {
      teacher: "Anu S Nair",
      subject: "Mathematics",
      content: "There is an upcoming CBSE Exhibition.",
      postedAt: "10/31/2026 12:51:22 PM",
    },
  ],
};

const teacherHistoryCapture: PageCapture = {
  url: "https://student.schoolcanvas.com/User/Student/TwcMessageDetails?StaffId=108411",
  title: "/User/Student/TwcMessageDetails",
  capturedAt: "2026-11-25T14:00:00.000Z",
  links: [],
  text: "",
  messageItems: [
    {
      sender: "Aarav Agarwal",
      content: "Earlier message from this teacher.",
      postedAt: "10/28/2026 9:00:00 AM",
    },
    {
      sender: "Pooja Sahni",
      content: "Latest teacher update.",
      postedAt: "11/25/2026 7:35:38 PM",
    },
  ],
};

const structuredNoticeCapture: PageCapture = {
  url: "https://student.schoolcanvas.com/User/Student/NoticeBoard",
  title: "/User/Student/NoticeBoard",
  capturedAt: "2026-11-25T13:00:00.000Z",
  links: [],
  text: "",
  announcementItems: [
    {
      title: "Online class - instructions for tomorrow",
      content: "Dear students,\nClasses will run from 8:30 a.m. to 1:20 p.m.\nStudents must attend in proper school uniform.\nThank you.\nRegards,\nAnu S Nair",
      postedAt: "25/11/2026 05:48:28 PM",
    },
  ],
};

describe("visible School Canvas extraction", () => {
  it("removes saved sample homework, messages, and notices", () => {
    const records = [
      { id: "sample-task", origin: "sample" },
      { id: "real-task", origin: "synced" },
      { id: "manual-task", origin: "manual" },
    ];
    expect(excludeSampleRecords(records).map((record) => record.id)).toEqual([
      "real-task",
      "manual-task",
    ]);
  });

  it("removes previously saved synced announcement-list summaries", () => {
    const records = [
      { id: "list-summary", origin: "synced", content: "Read More Posted On: 25/11/2026" },
      { id: "real-notice", origin: "synced", content: "School will be closed tomorrow." },
      { id: "manual", origin: "manual", content: "Read More is part of my note." },
    ];
    expect(excludeReadMoreSummaries(records).map((record) => record.id)).toEqual([
      "real-notice",
      "manual",
    ]);
  });

  it("extracts assignment titles, full descriptions, due dates, materials, and instructions", () => {
    const result = parseCaptures([homeworkCapture]);
    expect(result.assignments).toHaveLength(3);
    expect(result.assignments[0]).toMatchObject({
      subject: "Mathematics",
      title: "Complete exercise 2A",
      dueDate: "2026-11-25",
      materials: ["math notebook"],
      origin: "synced",
    });
    expect(result.assignments[1].title).toBe("EBSB Activity - Comparative Study on Harvest Festivals");
    expect(result.assignments[1].description).toContain("cultural significance");
    expect(result.assignments[1].materials).toContain("half chart paper");
    expect(result.assignments[2].description).toContain("Q4, 5 and 6");
  });

  it("extracts message dates and classifies study-material notices without inventing read state", () => {
    const result = parseCaptures([messagesCapture]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      teacher: "Mamata H Barki",
      subject: "Kannada",
      content: expect.stringContaining("Kaalagalu notes"),
      category: "Study material",
    });
    expect(result.messages[0].readState).toBeUndefined();
    expect(result.messages[1]).toMatchObject({
      teacher: "Pooja Sahni",
      subject: "Computer Science",
      category: "Study material",
    });
    expect(result.messages[0].postedAt).toBe("2026-11-11T09:57:45");
  });

  it("extracts notices with the posted date", () => {
    const result = parseCaptures([noticeCapture]);
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0]).toMatchObject({
      title: "21st Nov - Holiday",
      postedAt: "2026-11-20T14:21:49",
      content: expect.stringContaining("non-working day"),
    });
  });

  it("accepts a structured notice even when the capture URL and title are generic", () => {
    const result = parseCaptures([{
      ...structuredNoticeCapture,
      url: "https://student.schoolcanvas.com/",
      title: "",
    }]);
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0]).toMatchObject({
      title: "Online class - instructions for tomorrow",
      content: expect.stringContaining("8:30 a.m."),
    });
  });

  it("extracts notices captured from their NoticeDetails page", () => {
    const result = parseCaptures([{
      ...structuredNoticeCapture,
      url: "https://student.schoolcanvas.com/User/Student/NoticeDetails?NoticeId=450452",
      title: "/User/Student/NoticeDetails",
    }]);
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0]).toMatchObject({
      title: "Online class - instructions for tomorrow",
      content: expect.stringContaining("8:30 a.m."),
    });
  });

  it("does not turn a Read More announcement list into a notice", () => {
    const result = parseCaptures([{
      ...noticeCapture,
      url: "https://student.schoolcanvas.com/User/Student/ReceivedSms",
      title: "/User/Student/ReceivedSms",
      text: `Grade 7 Excursion
Read More Posted On : 25/11/2026 08:48:20 PM
Read More Posted On : 25/11/2026 05:48:28 PM
Read More Posted On : 25/11/2026 03:59:20 PM`,
    }]);
    expect(result.announcements).toHaveLength(0);
  });

  it("deduplicates notice detail captures by NoticeId across syncs", () => {
    const firstCapture: PageCapture = {
      ...structuredNoticeCapture,
      url: "https://student.schoolcanvas.com/User/Student/NoticeDetails?NoticeId=450452",
    };
    const refreshedCapture: PageCapture = {
      ...firstCapture,
      capturedAt: "2026-11-25T14:00:00.000Z",
      announcementItems: [{
        ...firstCapture.announcementItems![0],
        content: "Updated notice body.",
      }],
    };
    const result = parseCaptures([firstCapture, refreshedCapture]);
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0].content).toBe("Updated notice body.");
  });

  it("extracts a notice from page text when structured capture is unavailable", () => {
    const result = parseCaptures([{
      ...noticeCapture,
      text: `Notice Details
Online class - instructions for tomorrow
Dear students,
Please note the following -
1) Online classes will commence at 8:30 a.m. and conclude by 1:20 p.m.
2) Students must join the classes by 8:30 a.m.
3) Students are required to attend classes in proper school uniform.
Thank you.
Regards,
Anu S Nair
Posted On : 25/11/2026 05:48:28 PM`,
    }]);
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0]).toMatchObject({
      title: "Online class - instructions for tomorrow",
      postedAt: "2026-11-25T17:48:28",
    });
    expect(result.announcements[0].content).toContain("Students must join the classes");
  });

  it("keeps student-panel details out of announcement content", () => {
    const captureWithStudentDetails: PageCapture = {
      ...noticeCapture,
      text: `Student Details
Class VII B
Roll number 1
Notice Details
21st Nov - Holiday

Dear Parents,
School will be closed tomorrow.
Posted On : 20/11/2026 02:21:49 PM
Student Details
Class VII B`,
    };
    const result = parseCaptures([captureWithStudentDetails]);
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0].content).toContain("School will be closed tomorrow.");
    expect(result.announcements[0].content).not.toMatch(/Student Details|Class VII B|Roll number/i);
  });

  it("cleans student details from previously stored announcement content", () => {
    const storedContent = `Student Details
Class VII B
Roll number 1
Student name
Notice Details
Dear Parents,
School will be closed tomorrow.
Posted On : 20/11/2026 02:21:49 PM`;
    const cleaned = sanitizeAnnouncementContent(storedContent);
    expect(cleaned).toContain("School will be closed tomorrow.");
    expect(cleaned).not.toMatch(/Student Details|Class VII B|Roll number|Student name/i);
  });

  it("removes portal navigation labels from announcement content", () => {
    const cleaned = sanitizeAnnouncementContent(`Online class - instructions for tomorrow
Notice Board
Fees
Transport
Report Card
E-Content
Messaging
More
Logout
Real notice text`);
    expect(cleaned).toContain("Real notice text");
    expect(cleaned).not.toMatch(/Notice Board|Fees|Transport|Report Card|E-Content|Messaging|More|Logout/);
  });

  it("extracts the observed Notice Details section even when its title has no notice keyword", () => {
    const result = parseCaptures([structuredNoticeCapture, structuredNoticeCapture]);
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0]).toMatchObject({
      title: "Online class - instructions for tomorrow",
      content: expect.stringContaining("proper school uniform"),
      postedAt: "2026-11-25T17:48:28",
      origin: "synced",
      originalUrl: structuredNoticeCapture.url,
    });
    expect(result.announcements[0].content).toContain("Dear students");
    expect(result.announcements[0].content).toContain("Anu S Nair");
    expect(result.announcements[0].content).not.toMatch(/Notice Details|Student Details/i);
  });

  it("keeps an announcement heading when its body paragraph extraction is empty", () => {
    const result = parseCaptures([{
      ...structuredNoticeCapture,
      announcementItems: [{
        title: "Online class - instructions for tomorrow",
        content: "",
        postedAt: "25/11/2026 05:48:28 PM",
      }],
    }]);
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0].title).toBe("Online class - instructions for tomorrow");
  });

  it("uses the portal's observed homework card structure and keeps attachments", () => {
    const result = parseCaptures([structuredHomeworkCapture]);
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0]).toMatchObject({
      subject: "Mathematics",
      title: "Complete exercise 2A",
      dueDate: "2026-11-25",
      materials: ["math notebook"],
    });
    expect(result.assignments[1].title).toBe("EBSB Activity - Comparative Study on Harvest Festivals");
    expect(result.assignments[1].attachments).toEqual([
      { url: "https://palarm.sgp1.digitaloceanspaces.com/sample.pdf", label: "Homework attachment" },
    ]);
  });

  it("extracts teacher, subject, and date separately without inventing read state", () => {
    const result = parseCaptures([structuredMessagesCapture]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      teacher: "Pooja Sahni",
      content: expect.stringContaining("functions is uploaded"),
      postedAt: "2026-11-05T13:53:44",
      category: "Study material",
      origin: "synced",
    });
    expect(result.messages[0].subject).toBe("Computer Science");
    expect(result.messages[0].readState).toBeUndefined();
    expect(result.messages[1].postedAt).toBe("2026-10-31T12:51:22");
  });

  it("uses the subject to identify a teacher and treats a name without subject as a student message", () => {
    const result = parseCaptures([{
      ...structuredMessagesCapture,
      messageItems: [
        {
          teacher: "Pooja Sahini Computer Science",
          content: "Teacher message with subject.",
          postedAt: "11/25/2026 1:00:00 PM",
        },
        {
          teacher: "Aarav Agarwal",
          content: "Student message without a subject.",
          postedAt: "11/25/2026 2:00:00 PM",
        },
      ],
    }]);
    expect(result.messages[0]).toMatchObject({
      teacher: "Pooja Sahni",
      subject: "Computer Science",
    });
    expect(result.messages[1].teacher).toBeUndefined();
    expect(result.messages[1].subject).toBeUndefined();
  });

  it("keeps student replies interleaved in the teacher thread they came from", () => {
    const result = parseCaptures([
      {
        ...structuredMessagesCapture,
        messageItems: [structuredMessagesCapture.messageItems![0]],
        messageThreadRefs: [{
          staffId: "108411",
          teacher: "Pooja Sahni",
          subject: "Computer Science",
        }],
      },
      teacherHistoryCapture,
    ]);
    expect(result.messages).toHaveLength(2);
    const studentReply = result.messages.find((message) => message.sender === "Aarav Agarwal");
    expect(studentReply).toMatchObject({
      sender: "Aarav Agarwal",
      teacher: "Pooja Sahni",
      subject: "Computer Science",
      content: "Earlier message from this teacher.",
      postedAt: "2026-10-28T09:00:00",
      origin: "synced",
      originalUrl: teacherHistoryCapture.url,
    });
    const thread = groupMessagesByTeacher(result.messages)[0];
    expect(thread.teacher).toBe("Pooja Sahni");
    expect(thread.messages.map((message) => message.sender)).toContain("Aarav Agarwal");
    expect(thread.messages[0].content).toBe("Latest teacher update.");
  });

  it("drops the TwcMessages cover message when TwcMessageDetails is captured and uses the latest real message as the thread cover", () => {
    const result = parseCaptures([
      {
        ...structuredMessagesCapture,
        messageItems: [
          {
            teacher: "Pooja Sahni",
            subject: "Computer Science",
            content: "Dear Students Reference material for computer subject...",
            postedAt: "11/5/2026 1:53:44 PM",
          },
          structuredMessagesCapture.messageItems![1],
        ],
        messageThreadRefs: [{
          staffId: "108411",
          teacher: "Pooja Sahni",
          subject: "Computer Science",
        }],
      },
      {
        ...teacherHistoryCapture,
        messageItems: [
          {
            sender: "Pooja Sahni",
            content: "Dear Students Reference material for computer subject on the topic functions is uploaded on e-content.",
            postedAt: "11/5/2026 1:53:44 PM",
          },
          {
            sender: "Pooja Sahni",
            content: "Latest teacher update.",
            postedAt: "11/25/2026 7:35:38 PM",
          },
        ],
      },
    ]);

    const threads = groupMessagesByTeacher(result.messages);
    const poojaThread = threads.find((thread) => thread.teacher === "Pooja Sahni");
    const anuThread = threads.find((thread) => thread.teacher === "Anu S Nair");

    expect(poojaThread?.messages).toHaveLength(2);
    expect(poojaThread?.messages[0].content).toBe("Latest teacher update.");
    expect(poojaThread?.messages.some((message) => message.originalUrl === structuredMessagesCapture.url)).toBe(false);
    expect(anuThread?.messages).toHaveLength(1);
    expect(anuThread?.messages[0].content).toBe("There is an upcoming CBSE Exhibition.");
  });

  it("prevents duplicate extracted items when the same page is synchronized twice", () => {
    const result = parseCaptures([homeworkCapture, homeworkCapture, messagesCapture, messagesCapture]);
    expect(result.assignments).toHaveLength(3);
    expect(result.messages).toHaveLength(2);
  });

  it("groups teacher messages into expandable chronological threads", () => {
    const result = parseCaptures([{
      ...structuredMessagesCapture,
      messageItems: [
        ...structuredMessagesCapture.messageItems ?? [],
        {
          teacher: "Pooja Sahni",
          subject: "Computer Science",
          content: "Earlier message from this teacher.",
          postedAt: "10/28/2026 9:00:00 AM",
        },
      ],
    }]);
    const threads = groupMessagesByTeacher(result.messages);
    const poojaThread = threads.find((thread) => thread.teacher === "Pooja Sahni");
    expect(poojaThread?.messages).toHaveLength(2);
    expect(poojaThread?.messages[0].content).toContain("functions is uploaded");
    expect(poojaThread?.messages[1].content).toBe("Earlier message from this teacher.");
  });

  it("keeps a teacher's messages in one conversation across subject and name variants", () => {
    const result = parseCaptures([{
      ...structuredMessagesCapture,
      messageItems: [
        { teacher: "Pooja Sahni Computer Science", content: "Message with subject." },
        { teacher: "Pooja Sahini Computer Science", content: "Name spelling variant." },
      ],
    }]);
    const threads = groupMessagesByTeacher(result.messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].teacher).toBe("Pooja Sahni");
    expect(threads[0].messages).toHaveLength(2);
    expect(threads[0].messages.every((message) => message.subject === "Computer Science")).toBe(true);
  });

  it("groups messages without a subject into one student conversation", () => {
    const result = parseCaptures([{
      ...structuredMessagesCapture,
      messageItems: [
        { teacher: "Student One", content: "Message one." },
        { teacher: "Student Two", content: "Message two." },
      ],
    }]);
    const threads = groupMessagesByTeacher(result.messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].teacher).toBe("Student messages");
    expect(threads[0].messages).toHaveLength(2);
    expect(threads[0].messages.every((message) => !message.subject && !message.teacher)).toBe(true);
  });

  it("recognizes a subjectless sender as a teacher when that name has a subject elsewhere", () => {
    const result = parseCaptures([{
      ...structuredMessagesCapture,
      messageItems: [
        { teacher: "Pooja Sahni Computer Science", content: "Teacher message with subject." },
        { teacher: "Pooja Sahini", content: "Same teacher, subject omitted." },
      ],
    }]);
    expect(result.messages[1]).toMatchObject({
      sender: "Pooja Sahni",
      teacher: "Pooja Sahni",
      subject: "Computer Science",
    });
  });

  it("preserves completion and student edits when refreshed portal data is merged", () => {
    const synced = parseCaptures([homeworkCapture]).assignments[0];
    const saved = {
      ...synced,
      title: "My edited title",
      status: "completed" as const,
      reminderAt: "2026-11-25T08:00",
      studentEdited: true,
    };
    const refreshed = { ...synced, title: "Portal title changed", status: "pending" as const };
    expect(mergeAssignments([saved], [refreshed])[0]).toMatchObject({
      title: "My edited title",
      status: "completed",
      reminderAt: "2026-11-25T08:00",
      studentEdited: true,
    });
  });
});
