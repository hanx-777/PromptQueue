# PromptQueue

PromptQueue is a local Chrome/Edge Manifest V3 extension that adds Codex-like prompt queue and steer controls to ChatGPT, Gemini, and Claude web apps. It works only through visible page DOM interactions: filling the composer, clicking send, and watching the page for reply completion.

This is not an OpenAI API project. It does not use an API key, backend service, cookies, tokens, private ChatGPT endpoints, or internal network calls.

## Features

- Shadow DOM sidebar on `chatgpt.com`, `chat.openai.com`, `gemini.google.com`, and `claude.ai`
- Provider adapters for ChatGPT, Gemini, and Claude
- Run tab combining prompt input, Steer controls, queue execution controls, Save as Workflow, and a compact Queue Messages preview
- Workflow library for saving multiple named reusable multi-message prompt queues
- Prompt states: pending, running, done, failed, skipped
- Batch add prompts split by `---`, `###`, or a custom separator line
- Automatic next-message sending after the current provider output appears stable
- Clickable queue status chips for toggling pending/done and resetting failed/skipped to pending
- Combined start/pause control, clear, named workflow import/export, and workflow message editing
- Steer Next and Stop & Steer
- Chinese / English UI toggle
- Support tab with GitHub Star, Ko-fi, and local WeChat Pay donation QR code
- Persistent queue, named workflow library, settings, collapsed state, and panel width via `chrome.storage.local`
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
5. Open or refresh `https://chatgpt.com/`, `https://chat.openai.com/`, `https://gemini.google.com/`, or `https://claude.ai/`.

## Usage

Open ChatGPT, Gemini, or Claude Web while logged in. The PromptQueue panel appears on the right side and shows the active provider in the header.

Use the compact navigation bar near the top of the panel:

- Run: add queue messages, insert steer prompts, start/pause the queue with one compact control, clear the queue, save the current queue as a named workflow, and watch Queue Messages update.
- Workflow: manage saved named workflows, run a workflow, expand it to edit its name/messages, delete from the card corner, and import/export workflow JSON.
- Settings: timing, language, theme, separators, and panel width.
- Support: GitHub Star, Ko-fi, and optional donation QR code.

In Run, add prompts in the textarea and click Add to Queue. Put `---` or `###` on its own line to split multiple prompts into separate queue messages. New messages append to the bottom of the current queue, including while another message is running. Click Save as Workflow to name the current queue, for example `Test`, and store it locally as a reusable workflow. Click Start to send the first pending message; click the same Start control while running to pause after the current response.

The extension waits for generation to finish by observing DOM changes and the visible stop button. When output is stable for the configured delay, the task is marked done and the next pending task starts if auto-start is enabled.

Pausing does not stop the current provider response; it prevents the next queue message from being sent. Stop & Steer still attempts to click the provider's visible stop button before inserting a steer message.

## Queue And Workflow Behavior

- The Queue is the current run queue; each prompt is one message.
- Only one message runs at a time.
- A message is marked running before its prompt is sent.
- Completion marks the message done.
- Timeout or send/composer detection errors mark the message failed and pause the queue.
- A Workflow is a saved named template made from multiple queue messages.
- The Workflow library is stored locally in `chrome.storage.local` alongside the current queue and settings.
- Save as Workflow stores the current queue as pending reusable messages and does not clear the Run queue.
- Run on a workflow replaces the current queue with that workflow's messages as pending tasks and starts immediately.
- Export Workflow writes `type`, `version`, `name`, `exportedAt`, `messages`, and related settings.
- Import Workflow supports both new workflow JSON and older queue JSON, creates a new named workflow, assigns fresh IDs, and restores every imported message as pending.
- Refreshing the page preserves the queue. Any previously running message is restored to pending and a warning is shown.
- Queue and workflow data are shared across ChatGPT, Gemini, and Claude.
- In Queue Messages, clicking a status chip changes pending to done, done to pending, and failed/skipped back to pending. Running tasks cannot be toggled.
- Saved workflows can be reordered by dragging their card handle in the Workflow tab.

## Model Defaults

Advanced settings can store a default model preference for ChatGPT, Gemini, and Claude. The default is Auto highest available. Before sending each queue message, PromptQueue tries to switch through the provider's visible model menu. If the model menu or requested option cannot be found, the queue continues with the current visible model and shows a warning.

## Steer Behavior

Steer Next inserts a temporary prompt immediately after the current running task, before other pending work. Stop & Steer first attempts to click the visible stop button, then inserts the steer task. If no stop button is found, the panel shows a warning and keeps the queue intact.

Steer is implemented as a next-message insertion mechanism. It cannot alter a model response already generated inside the provider.

## Known Limitations

- ChatGPT, Gemini, or Claude DOM changes can break selectors. The extension uses multiple selector and heuristic fallbacks, but these pages are not public automation APIs.
- The extension cannot control a provider's internal queue or model state.
- Model switching is best-effort because model menus, model names, and account availability differ by provider, subscription, region, and UI version.
- Stop & Steer depends on the provider exposing a visible stop button.
- Reply completion is inferred from DOM stability and may need timing adjustment for very long or dynamic answers.
- The donation QR code is a static local image bundled into `dist/assets/donate-wechat.jpg`.
- The extension should not be used to bypass platform limits, rate limits, or product rules.

## Troubleshooting

- If the panel says the composer was not found, open a normal chat page and make sure the message box is visible.
- If the send button is not found, click into the provider composer once, then try again.
- If tasks fail from timeout, increase Max wait in settings.
- If a provider changes its UI and sending stops working, inspect the visible composer/send/stop button attributes and update the adapter under `src/content/providers/`.
- If the panel does not appear, confirm the unpacked extension points at `dist` and that `dist/manifest.json` exists.

## Development Notes

- Repository: `https://github.com/hanx-777/PromptQueue`
- Source entry: `src/content/index.tsx`
- Content script output: `dist/assets/content.js`
- Manifest source: `manifest.json`
- Manifest build copy: `dist/manifest.json`
- Icons: `public/icons`
- The Vite build disables code splitting and emits a stable content script filename for Manifest V3 loading.
