# Changelog

## Unreleased - 2026-06-08

### Added

- Added a Text Compare tab with original/revised inputs, real-time line-level diff, and word / Chinese-character highlights.
- Added responsive split and unified diff views with explicit `+`, `-`, and `~` markers so changes are not identified by color alone.
- Added Markdown diff summaries that can be copied from the Compare tab.
- Added workflow variables for `{{topic}}` style placeholders with run-time fill-in before queue creation.
- Added five local built-in workflow examples for polishing, code review, translation, product copy, and long-form summaries.
- Added optional pre-send auto-retry settings for failures before a message is sent.
- Added a local run log with prompt previews, attempt counts, status, provider, and copyable Markdown output.
- Added pure diff regression tests covering equal text, insertions, deletions, replacements, empty input, Chinese changes, and English word-level changes.
- Added P0 regression tests for workflow variables, templates, run logs, retry policy, and diff summaries.
- Added GitHub Actions CI that runs the project test suite and production build.

### Fixed

- Storage write failures now surface as real errors instead of silently falling back to memory-only state.
- Active queue status now counts only pending and running tasks, so failed or skipped tasks do not keep the queue looking busy.
- Reply detection is stricter and no longer treats unrelated DOM mutations as the start of a provider reply.
- Large text comparisons use a bounded fallback to avoid excessive LCS work.

### Changed

- The queue status bar now reports the current active task state without a misleading completed-count label.
- Added `npm run test` and `npm run check` scripts for local and CI verification.
- Updated documentation for the Compare tab, quality checks, and the session-only privacy model of comparison inputs.

## v1.0.0 - 2026-05-25

PromptQueue 1.0.0 is the first stable release for ChatGPT, Gemini, and Claude web apps.

### Highlights

- Added the native composer queue dock above the provider input box.
- Added Codex-style queue behavior: queued messages stay out of chat history until their turn.
- Added Enter-to-queue while the provider is generating, without stopping the active reply.
- Added automatic queue execution with stricter reply completion waiting to reduce skipped or swallowed messages.
- Added drag reordering for pending queue messages.
- Added Steer priority action in the native dock to stop the current reply and move a pending message to the front.
- Completed provider-specific light and dark themes for ChatGPT, Gemini, and Claude.
- Kept workflow save/load/run support with local import and export.
- Kept all queue, workflow, settings, language, theme, and panel state in `chrome.storage.local`.

### Privacy and Permissions

- No backend service, API key, cookies, tokens, or private provider endpoints are used.
- No new browser permissions were added for 1.0.0.
- The extension continues to use visible DOM interactions only.

### Known Limitations

- ChatGPT, Gemini, and Claude DOM changes may break selectors.
- Reply completion is inferred from visible page state and can still require timing adjustment for unusual replies.
- Model switching is best-effort because provider menus and available models vary by account and UI version.
