# Student Hub

Student Hub is a local-first React application and Manifest V3 browser-extension prototype. It keeps homework, teacher messages, notices, and calendar entries in the current browser profile. It does not use a remote database or send school records to an AI service.

Dark mode is the default for new and existing profiles until a student explicitly chooses a theme in Settings. The dark palette uses brighter body text and larger notice, message, and homework descriptions for readability.

## Run the web app

```sh
npm install
npm run dev
```

Open the local address printed by Vite. The web app works in Safari, but School Canvas sync is available only from the installed extension.

## Build and install the extension

```sh
npm run build
```

For Chrome or a Chromium-based browser:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the generated `dist/` folder.
4. Sign in to School Canvas normally in the same browser.
5. Open Student Hub from the extension button. It automatically starts a sync when opened; you can also select **Sync** to run one manually.

The extension uses an inactive temporary tab to visit the observed homework, messaging, announcement, and notice pages, then reads rendered page text. It skips unrelated routes such as the new-message composition page and follows pagination only within supported academic pages. It schedules a sync every six hours by default; the interval can be changed in Settings. Sync requires the browser to be running and a valid School Canvas session in the same browser profile. The extension does not read passwords, cookies, or authentication tokens.

The extension stores captures and app data in extension-local storage. The standalone web app uses that same storage when opened as an extension page; when opened as a regular website, it uses that browser's local storage instead. The two storage areas are separate. Automatic-on-open sync is only available in the extension page; the standalone site does not have School Canvas access.

## Safari status

The responsive web app can be opened in Safari. The extension has not been packaged or tested as a Safari app extension: Safari distribution requires a Safari Web Extension wrapper and a full Xcode installation/signing setup. The current environment has Command Line Tools but not the full Xcode toolchain, so Safari background sync is not yet installable from this source tree.

## Data and extraction limitations

- Student Hub starts with empty homework, message, and announcement lists. Existing locally saved sample records are filtered out when the app loads.
- A shared School Canvas snapshot revealed homework cards as `.an-title` date headers followed by `.an-con` entries. The extension uses those rendered DOM classes on `/User/Student/HomeWork` to capture subject, full visible description, posted date, due date, and visible attachment links. Extraction must still be checked in Chrome against the live signed-in page.
- A second snapshot revealed messaging cards as `.ec-tab-menu` containers with teacher/message text in `.profile-div .ec-tab-topic` and timestamps in `.ec-tab-topic1`. The extension extracts visible teacher, message, and posted time; the markup did not establish a subject field or reliable unread state, so those remain unknown.
- A teacher-specific conversation snapshot revealed the `TwcMessageDetails?StaffId=...` route. The extension extracts the visible message cards there and follows matching detail URLs exposed by message-page anchors or forms.
- Student Hub extracts a trailing subject from message headers such as `Pooja Sahni Computer Science`, builds a cross-message teacher identity map, and groups subjectless messages from a known teacher into that teacher’s conversation. Messages from student senders in a teacher-specific conversation are associated through its `StaffId` reference and interleaved chronologically; unrelated names with no subject association remain in Student messages. Student replies are omitted from dashboard highlights, study materials, calendar events, and AI answers. Name and subject labels use distinct colors.
- Notice Board detail pages render notices in `section.bn`, with the title in `<b>`, body text in paragraphs, and a `Posted On` timestamp. The extension follows `Read More` links to `NoticeDetails?NoticeId=...`, preserves only that detail identifier, and extracts each notice from its detail page. Every sync scans at most the first ten linked notices in portal order. Notice details are deduplicated by `NoticeId`.
- Homework routes are discovered from visible School Canvas links; supplied message, announcement, and notice-board routes are also checked.
- Study-material notifications are identified from teacher messages. E-Content file listings are not yet extracted.
- Attendance and report-card content is not collected. Their app sections remain empty until an authorized integration is validated.
- Read/unread state is not inferred.
- Reminders use browser notifications while Student Hub is open; they are not guaranteed when the app or browser is closed.
- The AI assistant is a local rule-based query helper, not a connected language model.

## Checks

```sh
npm test
npm run build
```
# student-hub
# student-hub
# student-hub
# student-hub
