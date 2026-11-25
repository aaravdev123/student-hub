const ROOT = "https://student.schoolcanvas.com/";
const PAGE_CAPTURED = "STUDENT_HUB_PAGE_CAPTURED";
const SYNC_KEY = "studentHubSync";
const CAPTURES_KEY = "studentHubCaptures";
const RECENT_NOTICE_LIMIT = 10;
const KNOWN_PATHS = [
  "/User/Student/TwcMessages",
  "/User/Student/ReceivedSms",
  "/User/Student/NoticeBoard",
  "/User/Student/HomeWork",
];
const PAGINATION_LINK = /^(next|more|older|newer|page\s*\d+|»|›)$/i;
const SUPPORTED_PATHS = [
  /^\/user\/student\/twcmessages\/?$/i,
  /^\/user\/student\/twcmessagedetails\/?$/i,
  /^\/user\/student\/receivedsms\/?$/i,
  /^\/user\/student\/noticeboard\/?$/i,
  /^\/user\/student\/noticedetails\/?$/i,
  /^\/user\/student\/homework\/?$/i,
];

chrome.runtime.onInstalled.addListener(async () => {
  const { studentHubData } = await chrome.storage.local.get("studentHubData");
  const hours = Number(studentHubData?.syncIntervalHours);
  await chrome.alarms.create("student-hub-sync", {
    periodInMinutes: Number.isFinite(hours) && hours >= 1 && hours <= 24 ? hours * 60 : 360,
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "student-hub-sync") {
    startSync().catch((error) => setSyncError(String(error)));
  } else if (alarm.name === "student-hub-sync-watchdog") {
    checkSyncTimeout().catch((error) => setSyncError(String(error)));
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("extension/dashboard.html") });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "STUDENT_HUB_START_SYNC") {
    startSync()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "STUDENT_HUB_SET_INTERVAL") {
    const hours = Number(message.hours);
    if (Number.isFinite(hours) && hours >= 1 && hours <= 24) {
      chrome.alarms.create("student-hub-sync", { periodInMinutes: hours * 60 });
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "Sync interval must be between 1 and 24 hours." });
    }
    return true;
  }

  if (message?.type === PAGE_CAPTURED && sender.tab?.id !== undefined) {
    acceptPage(message.capture, sender.tab.id).catch((error) => {
      setSyncError(String(error), sender.tab.id);
    });
  }
});

async function startSync() {
  const current = await chrome.storage.local.get(SYNC_KEY);
  if (current[SYNC_KEY]?.running) return;

  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  const queue = KNOWN_PATHS.map((path) => `${new URL(path, ROOT).href}`);
  await chrome.storage.local.set({
    [SYNC_KEY]: {
      running: true,
      tabId: tab.id,
      queue,
      visited: [ROOT],
      startedAt: new Date().toISOString(),
      pageStartedAt: new Date().toISOString(),
      currentUrl: ROOT,
      status: "loading",
      error: null,
      noticeListCaptured: false,
      noticeDetailLinksQueued: 0,
    },
  });
  await chrome.alarms.create("student-hub-sync-watchdog", { delayInMinutes: 0.5 });
  await chrome.tabs.update(tab.id, { url: ROOT });
}

async function acceptPage(capture, tabId) {
  if (!capture || typeof capture.text !== "string" || !capture.url) return;
  const stateResult = await chrome.storage.local.get(SYNC_KEY);
  const state = stateResult[SYNC_KEY];
  if (!state?.running || state.tabId !== tabId) {
    await storeCapture(capture);
    return;
  }
  await chrome.alarms.clear("student-hub-sync-watchdog");

  if (capture.requiresSignIn) {
    await chrome.storage.local.set({
      [SYNC_KEY]: {
        ...state,
        running: false,
        status: "needs-sign-in",
        error: `The School Canvas page at ${new URL(capture.url).pathname} appears to be the sign-in page. If the portal is already open and signed in, reload Student Hub and try Sync again.`,
        completedAt: new Date().toISOString(),
      },
    });
    await chrome.alarms.clear("student-hub-sync-watchdog");
    await chrome.tabs.remove(tabId);
    return;
  }

  if (isAcademicPage(capture)) await storeCapture(capture);
  const pagination = (capture.links || [])
    .filter((link) =>
      PAGINATION_LINK.test(link.text.trim()) ||
      /aria-label=.?(next|more)/i.test(link.ariaLabel),
    )
    .map((link) => link.href);
  const messageDetails = (capture.links || [])
    .map((link) => link.href)
    .filter((href) => /\/user\/student\/twcmessagedetails\/?$/i.test(new URL(href).pathname));
  const isNoticeListPage = /\/user\/student\/(?:receivedsms|noticeboard)\/?$/i.test(new URL(capture.url).pathname);
  const noticeCandidates = (capture.links || [])
    .map((link) => link.href)
    .filter((href) => /\/user\/student\/noticedetails\/?$/i.test(new URL(href).pathname));
  const visited = new Set(state.visited || []);
  const queue = [...(state.queue || [])];
  const unseenNoticeCandidates = [...new Set(noticeCandidates)]
    .filter((href) => !visited.has(href) && !queue.includes(href));
  const remainingNoticeLimit = Math.max(
    0,
    RECENT_NOTICE_LIMIT - (state.noticeDetailLinksQueued || 0),
  );
  const noticeDetails = unseenNoticeCandidates.slice(0, remainingNoticeLimit);
  for (const href of [...pagination, ...messageDetails, ...noticeDetails]) {
    if (!visited.has(href) && !queue.includes(href) && isSupportedAcademicPath(href)) queue.push(href);
  }
  const noticeListCaptured = state.noticeListCaptured || isNoticeListPage;
  const noticeDetailLinksQueued = (state.noticeDetailLinksQueued || 0) + noticeDetails.length;
  const next = queue.shift();
  if (next) {
    visited.add(next);
    await chrome.storage.local.set({
      [SYNC_KEY]: {
        ...state,
        queue,
        visited: [...visited],
        status: "syncing",
        currentUrl: next,
        pageStartedAt: new Date().toISOString(),
        noticeListCaptured,
        noticeDetailLinksQueued,
      },
    });
    await chrome.alarms.create("student-hub-sync-watchdog", { delayInMinutes: 0.5 });
    await chrome.tabs.update(tabId, { url: next });
    return;
  }

  await chrome.storage.local.set({
    [SYNC_KEY]: {
      ...state,
      running: false,
      queue: [],
      visited: [...visited],
      status: "complete",
      error: null,
      completedAt: new Date().toISOString(),
      noticeListCaptured,
      noticeDetailLinksQueued,
    },
  });
  await chrome.alarms.clear("student-hub-sync-watchdog");
  await chrome.tabs.remove(tabId);
}

async function checkSyncTimeout() {
  const result = await chrome.storage.local.get(SYNC_KEY);
  const state = result[SYNC_KEY];
  if (!state?.running || Date.now() - new Date(state.pageStartedAt).getTime() < 30000) return;
  await setSyncError(`School Canvas page did not respond in time: ${state.currentUrl}`, state.tabId);
}

function isSupportedAcademicPath(value) {
  try {
    const url = new URL(value, ROOT);
    if (url.origin !== new URL(ROOT).origin ||
      !SUPPORTED_PATHS.some((path) => path.test(url.pathname))) return false;
    if (/\/user\/student\/twcmessagedetails\/?$/i.test(url.pathname)) {
      return Boolean(url.searchParams.get("StaffId"));
    }
    if (/\/user\/student\/noticedetails\/?$/i.test(url.pathname)) {
      return Boolean(url.searchParams.get("NoticeId"));
    }
    return true;
  } catch {
    return false;
  }
}

function isAcademicPage(capture) {
  return isSupportedAcademicPath(capture.url);
}

async function storeCapture(capture) {
  const result = await chrome.storage.local.get(CAPTURES_KEY);
  const captures = Array.isArray(result[CAPTURES_KEY]) ? result[CAPTURES_KEY] : [];
  const isReplaceableCapture = /\/user\/student\/(?:receivedsms|noticeboard|noticedetails|twcmessages|twcmessagedetails)\/?$/i.test(
    new URL(capture.url).pathname,
  );
  if (isReplaceableCapture) {
    const existingIndex = captures.findIndex((item) => item.url === capture.url);
    if (existingIndex >= 0) {
      captures[existingIndex] = capture;
      await chrome.storage.local.set({ [CAPTURES_KEY]: captures });
      return;
    }
  }
  const fingerprint = (item) => JSON.stringify({
    url: item.url,
    text: item.text,
    homeworkItems: item.homeworkItems ?? [],
    messageItems: item.messageItems ?? [],
    announcementItems: item.announcementItems ?? [],
    noticeDiagnostics: item.noticeDiagnostics ?? null,
  });
  const key = fingerprint(capture);
  if (!captures.some((item) => fingerprint(item) === key)) {
    captures.push(capture);
  }
  await chrome.storage.local.set({ [CAPTURES_KEY]: captures });
}

async function setSyncError(error, tabId) {
  const result = await chrome.storage.local.get(SYNC_KEY);
  const state = result[SYNC_KEY] || {};
  const failedTabId = tabId ?? state.tabId;
  await chrome.storage.local.set({
    [SYNC_KEY]: { ...state, running: false, status: "error", error },
  });
  await chrome.alarms.clear("student-hub-sync-watchdog");
  if (failedTabId !== undefined) await chrome.tabs.remove(failedTabId).catch(() => undefined);
}
