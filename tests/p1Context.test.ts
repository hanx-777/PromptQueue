import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createContextMenuAction, resolveContextMenuDispatch } from "../src/background/contextMenu";
import { buildContextPrompt, normalizePendingContextActions } from "../src/content/contextActions";
import type { PendingContextAction } from "../src/content/types";

function makeAction(patch: Partial<PendingContextAction> = {}): PendingContextAction {
  return {
    id: "ctx-1",
    type: "queue-selection",
    selectionText: "Selected text",
    pageTitle: "Example Page",
    pageUrl: "https://example.com/article",
    createdAt: 1,
    ...patch
  };
}

describe("context prompts", () => {
  it("builds prompts for all selection actions and page context", () => {
    assert.equal(buildContextPrompt(makeAction({ type: "queue-selection" }), "en"), "Selected text");
    assert.match(buildContextPrompt(makeAction({ type: "summarize-selection" }), "en") ?? "", /Summarize/);
    assert.match(buildContextPrompt(makeAction({ type: "translate-selection" }), "zh") ?? "", /翻译成中文/);
    assert.match(buildContextPrompt(makeAction({ type: "rewrite-selection" }), "en") ?? "", /Rewrite/);
    assert.match(buildContextPrompt(makeAction({ type: "explain-selection" }), "en") ?? "", /Explain/);

    const pagePrompt = buildContextPrompt(makeAction({ type: "queue-page-context", selectionText: "" }), "en") ?? "";
    assert.match(pagePrompt, /Example Page/);
    assert.match(pagePrompt, /https:\/\/example\.com\/article/);
  });

  it("rejects empty selection for selection-only actions", () => {
    assert.equal(buildContextPrompt(makeAction({ selectionText: "  " }), "en"), null);
    assert.notEqual(buildContextPrompt(makeAction({ type: "queue-page-context", selectionText: "  " }), "en"), null);
  });
});

describe("pending context actions", () => {
  it("normalizes pending actions and keeps only the newest twenty", () => {
    const actions = Array.from({ length: 24 }, (_, index) => makeAction({ id: `ctx-${index}`, createdAt: index }));
    const normalized = normalizePendingContextActions([
      { id: "bad", type: "missing-url" },
      ...actions
    ]);

    assert.equal(normalized.length, 20);
    assert.equal(normalized[0]?.id, "ctx-4");
    assert.equal(normalized[19]?.id, "ctx-23");
  });
});

describe("background context menu dispatch", () => {
  it("maps menu clicks to direct messages on provider pages", () => {
    const dispatch = resolveContextMenuDispatch(
      createContextMenuAction("summarize-selection", {
        selectionText: "Some text",
        pageUrl: "https://chatgpt.com/c/123"
      }, { title: "ChatGPT", url: "https://chatgpt.com/c/123" }, 1),
      { url: "https://chatgpt.com/c/123" }
    );

    assert.equal(dispatch.target, "message");
    assert.equal(dispatch.action.type, "summarize-selection");
  });

  it("stores pending actions and opens ChatGPT from non-provider pages", () => {
    const dispatch = resolveContextMenuDispatch(
      createContextMenuAction("queue-page-context", {
        pageUrl: "https://example.com/article"
      }, { title: "Example", url: "https://example.com/article" }, 1),
      { url: "https://example.com/article" }
    );

    assert.equal(dispatch.target, "pending");
    assert.equal(dispatch.openUrl, "https://chatgpt.com/");
  });
});
