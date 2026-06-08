# Contributing to PromptQueue

PromptQueue is a local-first browser extension for queueing prompts, reusing workflows, steering the next message, and comparing text on supported AI chat pages.

Thanks for helping improve it. Please keep contributions focused on visible-page automation, local storage, and provider-safe behavior.

## Development Setup

```bash
npm install
npm run check
```

For local extension testing:

```bash
npm run build
```

Then load the generated `dist` directory as an unpacked Chrome or Edge extension.

## Pull Request Checklist

- Run `npm run check` before opening a pull request.
- Keep queue, workflow, settings, and privacy behavior local-first.
- Do not add backend services, analytics, telemetry, cookies, tokens, or private provider API calls.
- Avoid new browser permissions unless the change cannot work without them and the reason is documented.
- Update `README.md`, `CHANGELOG.md`, and `PRIVACY.md` when user-facing behavior or data handling changes.
- Add or update tests for diff logic, queue runtime behavior, storage behavior, and reply detection changes.

## Provider DOM Changes

ChatGPT, Gemini, and Claude are not public automation APIs. If a provider UI change breaks PromptQueue:

1. Reproduce the issue on the current provider page.
2. Keep selectors conservative and scoped.
3. Prefer visible controls and accessible labels when available.
4. Add a regression test for the runtime behavior when possible.

## Privacy Expectations

PromptQueue should remain local-first:

- No prompt uploads.
- No analytics.
- No remote logging.
- No cookie or token access.
- No private provider endpoints.

Text Compare inputs are session-only and should not be persisted.
