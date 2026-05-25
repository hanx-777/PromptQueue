# Changelog

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
