# ChatGPT Queue Steer Extension

A local Chrome/Edge Manifest V3 extension that adds Codex-like Queue and Steer controls to ChatGPT Web. It works only through visible page DOM interactions: filling the composer, clicking send, and watching the page for reply completion.

This is not an OpenAI API project. It does not use an API key, backend service, cookies, tokens, private ChatGPT endpoints, or internal network calls.

## Features

- Shadow DOM sidebar on `chatgpt.com` and `chat.openai.com`
- Run tab combining prompt input, Steer controls, queue execution controls, and a compact Queue Messages preview
- Workflow tab for arranging and exporting a reusable multi-message prompt flow
- Prompt states: pending, running, done, failed, skipped
- Batch add prompts split by `---`, `###`, or a custom separator line
- Automatic next-message sending after ChatGPT output appears stable
- Pause, resume, retry, skip, reorder, move to top, clear, Import Workflow, and Export Workflow
- Steer Next and Stop & Steer
- Chinese / English UI toggle
- Support tab with GitHub Star link and local WeChat Pay donation QR code
- Persistent queue, settings, collapsed state, and panel width via `chrome.storage.local`
- Dark, light, and system theme modes
- Keyboard shortcuts:
  - `Alt + Q`: collapse or expand the sidebar
  - `Alt + Shift + Enter`: add the current sidebar textarea content to the queue

## Privacy Model

- Stores queue data only in local browser extension storage.
- Stores the donation QR code as a local extension asset.
- Does not upload prompts or settings to any server.
- Does not read cookies.
- Does not collect account information.
- Does not scrape auth tokens.
- Does not request `tabs`, `cookies`, `webRequest`, `scripting`, `activeTab`, or other sensitive permissions.
- The GitHub Star button opens the repository page; it does not request GitHub OAuth permission or star on the user's behalf.

## Installation

```bash
npm install
npm run build
```

Then load the extension:

1. Open Chrome or Edge extensions management.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select the generated `dist` directory.
5. Open or refresh `https://chatgpt.com/` or `https://chat.openai.com/`.

## Usage

Open ChatGPT Web while logged in. The Queue Steer panel appears on the right side.

Use the compact navigation bar near the top of the panel:

- Run: add queue messages, insert steer prompts, start/pause/resume/stop the queue, import/export workflows, and watch the compact Queue Messages list update.
- Workflow: edit, reorder, and export the arranged multi-message prompt flow.
- Settings: timing, language, theme, separators, and panel width.
- Support: GitHub Star link and optional donation QR code.

In Run, add prompts in the textarea and click Add to Queue. Put `---` or `###` on its own line to split multiple prompts into separate queue messages. New messages append to the bottom of the current queue, including while another message is running. Click Start to send the first pending message.

The extension waits for ChatGPT generation to finish by observing DOM changes and the visible stop button. When output is stable for the configured delay, the task is marked done and the next pending task starts if auto-start is enabled.

Use Pause to finish the current response but prevent the next task from sending. Use Resume to continue. Stop attempts to click ChatGPT's visible stop button.

## Queue And Workflow Behavior

- The Queue is the current run queue; each prompt is one message.
- Only one message runs at a time.
- A message is marked running before its prompt is sent.
- Completion marks the message done.
- Timeout or send/composer detection errors mark the message failed and pause the queue.
- The Workflow is the current multi-message queue exported as a reusable JSON file.
- Export Workflow writes `type`, `version`, `name`, `exportedAt`, `messages`, and related settings.
- Import Workflow supports both new workflow JSON and older queue JSON, appends valid messages to the current queue, assigns fresh IDs, and restores every imported message as pending.
- Refreshing the page preserves the queue. Any previously running message is restored to pending and a warning is shown.

## Steer Behavior

Steer Next inserts a temporary prompt immediately after the current running task, before other pending work. Stop & Steer first attempts to click the visible ChatGPT stop button, then inserts the steer task. If no stop button is found, the panel shows a warning and keeps the queue intact.

Steer is implemented as a next-message insertion mechanism. It cannot alter a model response already generated inside ChatGPT.

## Known Limitations

- ChatGPT Web DOM changes can break selectors. The extension uses multiple selector and heuristic fallbacks, but the page is not a public automation API.
- The extension cannot control ChatGPT's internal queue or model state.
- Stop & Steer depends on ChatGPT exposing a visible stop button.
- Reply completion is inferred from DOM stability and may need timing adjustment for very long or dynamic answers.
- The donation QR code is a static local image bundled into `dist/assets/donate-wechat.jpg`.
- The extension should not be used to bypass ChatGPT platform limits, rate limits, or product rules.

## Troubleshooting

- If the panel says the composer was not found, open a normal chat page and make sure the message box is visible.
- If the send button is not found, click into the ChatGPT composer once, then try again.
- If tasks fail from timeout, increase Max wait in settings.
- If ChatGPT changes its UI and sending stops working, inspect the visible composer/send/stop button attributes and update `src/content/chatgptDom.ts`.
- If the panel does not appear, confirm the unpacked extension points at `dist` and that `dist/manifest.json` exists.

## Development Notes

- Repository: `https://github.com/hanx-777/chatgpt-queue-steer-extension`
- Source entry: `src/content/index.tsx`
- Content script output: `dist/assets/content.js`
- Manifest source: `manifest.json`
- Manifest build copy: `dist/manifest.json`
- Icons: `public/icons`
- The Vite build disables code splitting and emits a stable content script filename for Manifest V3 loading.
