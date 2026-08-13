# Changelog

## Unreleased - 2026-06-08

### Added

- Added an optional, off-by-default "Capture reply text" setting. When enabled, PromptQueue reads the visible reply text after a queued task completes and keeps the task (now shown with a "done" status) with its captured reply in a new Results section on the Run page, instead of discarding it.
- Added a "Clear Done" control (previously unused text with no wired-up button) and an "Export Results" action that downloads all completed prompt/reply pairs as Markdown.
- Added a batch table mode to the workflow variable dialog: paste a tab- or comma-separated table (first row as headers) to run a workflow once per row instead of filling variables one at a time.
- Added a system notification when the queue finishes running (Settings, on by default) and a non-blocking rate-limit warning banner when sends look unusually fast (on by default, no configurable threshold to keep the settings surface small).
- Added "Ask All Providers": broadcasts the current draft prompt to every other open supported AI tab at once, independent of the shared queue, and lets you send any two of the replies straight into Compare. Uses `chrome.tabs.query` scoped to the existing host permissions — no new sensitive permissions required.

- Added a Text Compare tab with original/revised inputs, real-time line-level diff, and word / Chinese-character highlights.
- Added responsive split and unified diff views with explicit `+`, `-`, and `~` markers so changes are not identified by color alone.
- Added Markdown diff summaries that can be copied from the Compare tab.
- Added Diff tab controls for ignoring whitespace, ignoring case, showing only changed lines, and copying the revised text.
- Added manual Diff result controls for row/column view and line/word/character precision.
- Added word precision as the default Compare mode, while keeping line and character precision available.
- Added one-line context around change-only Compare results and option metadata in copied diff summaries.
- Added a Run page Page Check for composer, send button, stop button, provider busy state, and standardized failure stages in run logs.
- Added workflow search, local tags, workflow duplication, and workflow variable run previews.
- Added workflow variables for `{{topic}}` style placeholders with run-time fill-in before queue creation.
- Added five local built-in workflow examples for polishing, code review, translation, product copy, and long-form summaries.
- Added optional pre-send auto-retry settings for failures before a message is sent.
- Added a local run log with prompt previews, attempt counts, status, provider, and copyable Markdown output.
- Added browser right-click context tools for queueing selected text, summarizing/translating/rewriting/explaining a selection, or queueing page title and URL.
- Added a Manifest V3 background service worker and short-lived pending context action storage for non-provider webpages.
- Added pure diff regression tests covering equal text, insertions, deletions, replacements, empty input, Chinese changes, and English word-level changes.
- Added P0 regression tests for workflow variables, templates, run logs, retry policy, and diff summaries.
- Added P1 regression tests for context prompts, pending context action normalization, background dispatch, and diff ignore options.
- Added GitHub Actions CI that runs the project test suite and production build.

### Fixed

- Layout breakpoints now use `@container` instead of `@media`. The panel is user-resizable (300-720px) independently of the window, so the single `@media (max-width: 520px)` block measured the viewport and never fired on a desktop window — every narrow-width layout fix in it had been dead since it was written.
- Fixed header truncation at the default 380px width. The right-hand control cluster carried `flex-shrink: 0` and occupied ~270px, leaving ~78px for a brand block needing ~164px. Removing the duplicate header language toggle (Settings already has a language dropdown) plus capping the status pill in narrow containers restores the full "PromptQueue" and provider labels.
- Fixed contrast failures across all 6 provider x theme cascades (29 failing pairs to 0, measured per WCAG 2.1). The main root cause: status tokens are authored as text colours that stay readable on each theme's background, but `.status-chip` used them as a solid fill under hardcoded white text, which inverted the role and dropped to 1.74:1 in dark themes. Chips now use a tint plus the status colour as text.
- Fixed the diff palette in Gemini and Claude dark themes. All 14 `--diff-*` tokens were defined only on the base (light) block and on `.provider-chatgpt.theme-dark`, so the other two providers rendered a light diff panel inside a dark shell.
- Added `--border-control` at 3:1 for control boundaries (WCAG 1.4.11). Input backgrounds sit at only 1.03:1 against the panel, so the border is the sole affordance; decorative dividers keep the softer `--border`.
- Raised sub-24px hit targets: settings/toggle rows collapsed to ~19px because the checkbox was reset to the UA's 13px with no row `min-height`; the removable workflow tag button was 22px.
- Fixed `box-shadow: var(--shadow)` on the workflow variable modal — that token is never defined anywhere, so the modal rendered with no shadow against its backdrop.
- Restored a non-colour state cue on the Page Check chips (leading glyph plus `aria-label`), which had become colour-only and violated WCAG 1.4.1.
- Made the sticky footer opaque; at 94% opacity list content scrolled visibly through it and read as a rendering glitch.
- Drag handles were focusable buttons with no keyboard handler, leaving a keyboard dead end; arrow keys now mirror the drag reorder.
- Replaced an invalid `role="tablist"` whose children were `aria-pressed` buttons with `role="group"`, and added the missing `aria-expanded` to the four collapsible controls.
- Storage write failures now surface as real errors instead of silently falling back to memory-only state.
- Active queue status now counts only pending and running tasks, so failed or skipped tasks do not keep the queue looking busy.
- Reply detection is stricter and no longer treats unrelated DOM mutations as the start of a provider reply.
- Large text comparisons use a bounded fallback to avoid excessive LCS work.
- The `identity` / Google OAuth permission is now requested only when a user opts into the experimental Google Drive backup feature (Settings → Data & Sync), instead of being bundled into the extension's default install-time permissions. Documentation now matches the actual permission surface.
- The Google Drive backup UI is labeled experimental, its buttons are disabled until an OAuth `client_id` is configured, and it now checks for the `identity` permission before making a request.
- Queue state writes now carry a `revision` counter; if two tabs write concurrently, the stale write is logged instead of silently overwriting the newer state without a trace.

### Changed

- The queue status bar now reports the current active task state without a misleading completed-count label.
- Added `npm run test` and `npm run check` scripts for local and CI verification.
- Updated documentation for the Compare tab, quality checks, and the session-only privacy model of comparison inputs.
- Updated documentation and privacy notes for right-click context actions and the `contextMenus` permission.
- Reworked primary navigation from five tabs to three (Run / Workflow / Settings); Compare and Support are now reached from a header icon button and a Settings footer link instead of competing for a main-nav slot.
- Unified queue vs. workflow export/import button labels so they no longer both read "Export" / "导出".
- Reorganized Settings into Basic / Execution & Retry / Model Preferences / Data & Sync groups, with plain-language hints on the engineering timing parameters (stable delay, max wait, retry delay).
- Split `queueRunner.processQueue` into smaller named methods (model selection, composer preflight, attempt execution, failure handling) without changing behavior; covered by the existing P0 regression tests.
- Introduced a design token layer for type, spacing, radii and shadows, which the stylesheet previously had only for colour. Six hardcoded font sizes on a flat 1px run became a 5-step scale (10px, below every platform minimum, folded into 11px); 13 one-off line-heights became 4; 9 radii became 4; and 51 of 168 spacing values that sat off any grid were snapped onto an explicit scale. Shadows are now tokens with dark-theme values instead of one hardcoded rgba reused in both themes.
- Gave the Run page's seven equally-weighted regions a light card treatment; previously they were separated only by a 12px gap, which left a scan no anchors.

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
