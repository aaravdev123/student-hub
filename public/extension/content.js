const PORTAL_ORIGIN = "https://student.schoolcanvas.com";
const PAGE_CAPTURED = "STUDENT_HUB_PAGE_CAPTURED";
const SUBJECTS = [
  "Computer Science", "Social Science", "Mathematics", "Geography", "Kannada",
  "Science", "English", "Hindi", "French", "Physics", "Chemistry", "Biology",
  "History", "Sanskrit",
];
const RELEVANT_LINK = /homework|home\s*work|assignment|diary|message|announcement|notice/i;
const PAGINATION_LINK = /^(next|more|older|newer|page\s*\d+|»|›)$/i;
const HOMEWORK_PATH = /\/user\/student\/homework\/?$/i;
const MESSAGES_PATH = /\/user\/student\/twcmessages\/?$/i;
const MESSAGE_DETAIL_PATH = /\/user\/student\/twcmessagedetails\/?$/i;
const NOTICE_DETAIL_PATH = /\/user\/student\/noticedetails\/?$/i;

function pageLinks() {
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  const messageForms = MESSAGE_DETAIL_PATH.test(location.pathname)
    ? []
    : Array.from(document.querySelectorAll('form[action*="TwcMessageDetails"]'));
  return [
    ...anchors.map((anchor) => ({
      text: (anchor.innerText || anchor.getAttribute("aria-label") || "").trim(),
      href: sanitizeUrl(anchor.href, true),
      ariaLabel: anchor.getAttribute("aria-label") || "",
    })),
    ...messageForms.map((form) => ({
      text: "",
      href: sanitizeUrl(form.action),
      ariaLabel: "",
    })),
  ]
    .filter((link) => link.href && (
      RELEVANT_LINK.test(link.text) ||
      PAGINATION_LINK.test(link.text) ||
      MESSAGE_DETAIL_PATH.test(new URL(link.href).pathname) ||
      NOTICE_DETAIL_PATH.test(new URL(link.href).pathname)
    ));
}

function sanitizeUrl(value, allowAttachment = false) {
  try {
    const url = new URL(value, location.href);
    const allowedOrigins = allowAttachment
      ? [PORTAL_ORIGIN, "https://palarm.sgp1.digitaloceanspaces.com"]
      : [PORTAL_ORIGIN];
    if (!allowedOrigins.includes(url.origin)) return "";
    for (const key of [...url.searchParams.keys()]) {
      const isMessageDetailStaffId = MESSAGE_DETAIL_PATH.test(url.pathname) && /^staffid$/i.test(key);
      const isNoticeDetailId = NOTICE_DETAIL_PATH.test(url.pathname) && /^noticeid$/i.test(key);
      if (!/^(page|p|pg|offset|limit)$/i.test(key) && !isMessageDetailStaffId && !isNoticeDetailId) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function dateFromText(value) {
  return value.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0];
}

function parseMessageHeader(value) {
  const header = (value || "").replace(/\s+/g, " ").trim();
  const subject = SUBJECTS.find((candidate) =>
    new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i").test(header),
  );
  const name = subject
    ? header.slice(0, header.length - subject.length).replace(/[\s:|,-]+$/, "").trim()
    : header;
  let teacher = subject ? name : undefined;
  if (/^pooja\s+sahini$/i.test(name)) {
    teacher = "Pooja Sahni";
  }
  const knownTeacher = ["Mamata H Barki", "Pooja Sahni", "Anu S Nair", "Shabnam Sharma", "Niranjani S"]
    .find((known) => known.toLowerCase() === teacher?.toLowerCase());
  return { sender: name || undefined, teacher: knownTeacher || teacher, subject };
}

function extractHomeworkItems() {
  const sequence = Array.from(document.querySelectorAll(".an-title, .an-con"));
  let postedDate;
  const items = [];
  for (const element of sequence) {
    if (element.matches(".an-title")) {
      postedDate = dateFromText(element.innerText || "");
      continue;
    }

    const coloredSubject = element.querySelector('span[style*="color: blue"]');
    const subject = coloredSubject?.innerText?.trim();
    const descriptionElement = Array.from(element.children)
      .find((child) => child.tagName === "SPAN");
    const description = descriptionElement?.innerText?.trim() || "";
    const dueDate = dateFromText(
      Array.from(element.querySelectorAll("span"))
        .map((span) => span.innerText || "")
        .find((text) => /Due Date\s*:/i.test(text)) || "",
    );
    if (!subject || !description || !dueDate) continue;

    const attachments = Array.from(element.querySelectorAll("a[href]"))
      .map((anchor) => ({
        url: sanitizeUrl(anchor.href, true),
        label: anchor.querySelector("img")?.getAttribute("title") ||
          anchor.innerText?.trim() ||
          "Assignment attachment",
      }))
      .filter((attachment) => attachment.url);

    items.push({ subject, description, postedDate, dueDate, attachments });
  }
  return items;
}

function extractMessageItems() {
  return Array.from(document.querySelectorAll(".ec-tab-menu")).flatMap((card) => {
    const topicElements = Array.from(card.querySelectorAll(".profile-div .ec-tab-topic"));
    const identity = parseMessageHeader(topicElements[0]?.innerText);
    const content = topicElements[1]?.innerText?.trim();
    const postedText = card.querySelector(".ec-tab-topic1")?.innerText || "";
    const postedAt = postedText.match(
      /Posted On\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*[AP]M)/i,
    )?.[1];
    if (!content) return [];
    return [{ ...identity, content, postedAt }];
  });
}

function extractMessageThreadRefs() {
  const refs = new Map();
  for (const card of document.querySelectorAll(".ec-tab-menu")) {
    const header = card.querySelector(".profile-div .ec-tab-topic")?.innerText || "";
    const identity = parseMessageHeader(header);
    if (!identity.teacher || !identity.subject) continue;
    for (const anchor of card.querySelectorAll('a[href*="TwcMessageDetails"]')) {
      const url = new URL(anchor.href, location.href);
      const staffId = url.searchParams.get("StaffId");
      if (staffId) refs.set(staffId, { staffId, teacher: identity.teacher, subject: identity.subject });
    }
    for (const form of card.querySelectorAll('form[action*="TwcMessageDetails"]')) {
      const url = new URL(form.action, location.href);
      const staffId = url.searchParams.get("StaffId");
      if (staffId) refs.set(staffId, { staffId, teacher: identity.teacher, subject: identity.subject });
    }
  }
  return [...refs.values()];
}

function extractAnnouncementItems() {
  const sections = new Set(document.querySelectorAll(".bn"));
  for (const heading of document.querySelectorAll("h3")) {
    if (!/^Notice Details$/i.test((heading.textContent || "").trim())) continue;
    const section = heading.closest("section");
    const container = section || heading.parentElement;
    if (container) sections.add(container);
  }
  return Array.from(sections).flatMap((section) => {
    const textOf = (element) => (element?.textContent || "").replace(/\s+/g, " ").trim();
    const heading = textOf(section.querySelector("h3"));
    const title = textOf(section.querySelector("b, strong"));
    if (!title) return [];

    const postedText = Array.from(section.querySelectorAll("span"))
      .map(textOf)
      .find((text) => /Posted On\s*:/i.test(text)) || "";
    const postedAt = postedText.match(
      /Posted On\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+\d{1,2}:\d{2}:\d{2}\s*[AP]M)?)/i,
    )?.[1];
    const paragraphContent = Array.from(section.querySelectorAll("p"))
      .map(textOf)
      .filter(Boolean)
      .join("\n");
    const content = paragraphContent || (section.innerText || section.textContent || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) =>
        line &&
        !/^Notice Details$/i.test(line) &&
        line !== title &&
        !/^Posted On\s*:/i.test(line),
      )
      .join("\n");
    if (!/^Notice Details$/i.test(heading) && !/Posted On\s*:/i.test(postedText)) return [];
    return [{ title, content, postedAt }];
  });
}

function academicText(text, path) {
  const lines = text.split("\n");
  let firstRelevantLine = -1;
  if (/homework|assignment|diary/i.test(path) || /\bdue\s*date\s*[:|-]/i.test(text)) {
    firstRelevantLine = lines.findIndex((line) => new RegExp(
      `^\\s*(?:${SUBJECTS.join("|")})\\s*[:|]`,
      "i",
    ).test(line));
  } else if (/twcmessages|receivedsms/i.test(path)) {
    firstRelevantLine = lines.findIndex((line) =>
      SUBJECTS.some((subject) => new RegExp(`\\b${subject}\\s*$`, "i").test(line.trim())),
    );
  } else if (/noticeboard/i.test(path)) {
    firstRelevantLine = lines.findIndex((line) => /^Notice Details$/i.test(line.trim()));
    if (firstRelevantLine < 0) {
      firstRelevantLine = lines.findIndex((line) => /Holiday|Notice|Closure/i.test(line));
    }
  }
  return firstRelevantLine < 0 ? "" : lines.slice(firstRelevantLine).join("\n").trim();
}

function hasVisibleLoginForm(bodyText) {
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0;
  };
  const visiblePassword = Array.from(document.querySelectorAll('input[type="password"]'))
    .find(isVisible);
  if (!visiblePassword) return false;

  const form = visiblePassword.closest("form") || document;
  const formText = form.innerText || "";
  const hasLoginId = /\b(?:login\s*id|username|user\s*name)\b/i.test(formText) ||
    Array.from(form.querySelectorAll("input"))
    .filter(isVisible)
    .some((input) => {
      const label = [
        input.getAttribute("aria-label"),
        input.getAttribute("placeholder"),
        input.id,
        input.name,
      ].filter(Boolean).join(" ");
      const associatedLabel = input.id
        ? form.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.innerText || ""
        : "";
      return /\b(login\s*id|username|user\s*name)\b/i.test(`${label} ${associatedLabel}`);
    });
  const hasSignInButton = Array.from(form.querySelectorAll("button, input[type='submit']"))
    .filter(isVisible)
    .some((button) => /\b(sign\s*in|log\s*in)\b/i.test(
      button.innerText || button.value || button.getAttribute("aria-label") || "",
    ));

  const loginHeading = Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"))
    .some((heading) => /^Login to Student Portal$/i.test(heading.innerText?.trim() || ""));
  return hasLoginId && hasSignInButton && loginHeading &&
    /\b(?:login|log in|sign in|sign-in)\b/i.test(bodyText);
}

function capturePage() {
  const path = location.pathname.toLowerCase();
  const isRoot = path === "/";
  const bodyText = document.body?.innerText?.trim() || "";
  const relevantPath = /twcmessages|twcmessagedetails|receivedsms|noticeboard|noticedetails|homework|assignment|diary/i.test(path);
  const likelyHomework = /\bdue\s*date\s*[:|-]/i.test(bodyText);
  const requiresSignIn = hasVisibleLoginForm(bodyText);
  if (!isRoot && !relevantPath && !likelyHomework && !requiresSignIn) return;
  const homeworkItems = !isRoot && !requiresSignIn && HOMEWORK_PATH.test(path)
    ? extractHomeworkItems()
    : undefined;
  const messageItems = !isRoot && !requiresSignIn && (MESSAGES_PATH.test(path) || MESSAGE_DETAIL_PATH.test(path))
    ? extractMessageItems()
    : undefined;
  const messageThreadRefs = !isRoot && !requiresSignIn && MESSAGES_PATH.test(path)
    ? extractMessageThreadRefs()
    : undefined;
  const announcementItems = !isRoot && !requiresSignIn && /noticeboard|receivedsms|noticedetails/i.test(path)
    ? extractAnnouncementItems()
    : undefined;
  const noticeDiagnostics = !isRoot && /noticeboard|noticedetails/i.test(path)
    ? {
        sectionCount: document.querySelectorAll(".bn").length,
        headingCount: Array.from(document.querySelectorAll("h3"))
          .filter((heading) => /^Notice Details$/i.test((heading.textContent || "").trim())).length,
        extractedCount: announcementItems?.length || 0,
      }
    : undefined;
  const text = isRoot || requiresSignIn
    ? ""
    : homeworkItems?.length
      ? homeworkItems.map((item) =>
          `${item.subject}: ${item.description}\nPosted: ${item.postedDate || "unknown"}\nDue Date: ${item.dueDate}`,
        ).join("\n\n")
      : announcementItems?.length
        ? announcementItems.map((item) =>
            `${item.title}\n${item.content}\nPosted On: ${item.postedAt || "unknown"}`,
          ).join("\n\n")
      : messageItems?.length
        ? ""
        : academicText(bodyText, path);

  chrome.runtime.sendMessage({
    type: PAGE_CAPTURED,
    capture: {
      url: sanitizeUrl(location.href),
      title: isRoot ? "" : location.pathname,
      capturedAt: new Date().toISOString(),
      text: text.slice(0, 50000),
      links: isRoot || relevantPath ? pageLinks() : [],
      requiresSignIn,
      homeworkItems,
      messageItems,
      messageThreadRefs,
      announcementItems,
      noticeDiagnostics,
    },
  });
}

let stableTimer;
let hardStop;
const observer = new MutationObserver(() => {
  clearTimeout(stableTimer);
  stableTimer = setTimeout(finishCapture, 900);
});

function finishCapture() {
  observer.disconnect();
  clearTimeout(hardStop);
  capturePage();
}

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  stableTimer = setTimeout(finishCapture, 1400);
  hardStop = setTimeout(finishCapture, 10000);
} else {
  window.addEventListener("DOMContentLoaded", capturePage, { once: true });
}
