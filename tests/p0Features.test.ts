import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS } from "../src/content/storage";
import type { QueueRunLogEntry, QueueState, QueueTask } from "../src/content/types";
import { BUILT_IN_WORKFLOW_TEMPLATES, createWorkflowFromTemplate } from "../src/content/workflowTemplates";
import { shouldAutoRetryTask } from "../src/content/queueRunner";
import { appendRunLogEntry, formatRunLogMarkdown } from "../src/utils/runLog";
import { diffTexts, formatDiffSummary } from "../src/utils/textDiff";
import { applyWorkflowVariables, extractWorkflowVariables } from "../src/utils/workflowVariables";

function makeTask(patch: Partial<QueueTask> = {}): QueueTask {
  return {
    id: "task-1",
    prompt: "Prompt",
    status: "running",
    createdAt: 1,
    updatedAt: 1,
    ...patch
  };
}

function makeLogEntry(index: number): QueueRunLogEntry {
  return {
    id: `log-${index}`,
    taskId: `task-${index}`,
    promptPreview: `Prompt ${index}`,
    status: "done",
    provider: "ChatGPT",
    startedAt: index,
    endedAt: index + 1,
    attemptCount: 1
  };
}

describe("workflow variables", () => {
  it("extracts unique English and Chinese variables with whitespace trimmed", () => {
    const variables = extractWorkflowVariables([
      { prompt: "Write about {{ topic }} in {{语言}}." },
      { prompt: "Make it {{style}} and mention {{ topic }} again." }
    ]);

    assert.deepEqual(variables, ["topic", "语言", "style"]);
  });

  it("applies variable values and rejects missing required values", () => {
    assert.equal(
      applyWorkflowVariables("Write about {{ topic }} in {{语言}}.", { topic: "AI", 语言: "中文" }),
      "Write about AI in 中文."
    );

    assert.throws(
      () => applyWorkflowVariables("Write about {{topic}}.", {}),
      /topic/
    );
  });
});

describe("built-in workflow templates", () => {
  it("exposes five local templates and creates uniquely named workflow copies", () => {
    assert.deepEqual(
      BUILT_IN_WORKFLOW_TEMPLATES.map((template) => template.id),
      ["academic-polish", "code-review", "translate", "product-copy", "long-summary"]
    );

    const workflow = createWorkflowFromTemplate(BUILT_IN_WORKFLOW_TEMPLATES[0], ["Academic Polish"], 1000);
    const nextWorkflow = createWorkflowFromTemplate(BUILT_IN_WORKFLOW_TEMPLATES[0], ["academic polish", "Academic Polish 2"], 1000);

    assert.equal(workflow.name, "Academic Polish 2");
    assert.equal(nextWorkflow.name, "Academic Polish 3");
    assert.ok(workflow.messages.length > 0);
    assert.ok(workflow.messages.some((message) => message.prompt.includes("{{")));
  });
});

describe("queue run log", () => {
  it("appends entries, caps history at 100, and formats markdown without full prompt text", () => {
    let state: QueueState = {
      tasks: [],
      isRunning: false,
      isPaused: false,
      runLog: []
    };

    for (let index = 0; index < 105; index += 1) {
      state = appendRunLogEntry(state, makeLogEntry(index));
    }

    assert.equal(state.runLog?.length, 100);
    assert.equal(state.runLog?.[0]?.id, "log-5");

    const markdown = formatRunLogMarkdown(state.runLog ?? []);
    assert.match(markdown, /Prompt 104/);
    assert.doesNotMatch(markdown, /Prompt 0/);
  });
});

describe("auto retry policy", () => {
  it("retries only pre-send failures within the configured retry budget", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      autoRetryEnabled: true,
      maxAutoRetries: 1,
      retryDelayMs: 3000
    };

    assert.equal(shouldAutoRetryTask(makeTask({ attemptCount: 1 }), settings, false), true);
    assert.equal(shouldAutoRetryTask(makeTask({ attemptCount: 2 }), settings, false), false);
    assert.equal(shouldAutoRetryTask(makeTask({ attemptCount: 1 }), settings, true), false);
    assert.equal(shouldAutoRetryTask(makeTask({ attemptCount: 1 }), { ...settings, autoRetryEnabled: false }, false), false);
  });
});

describe("diff summary", () => {
  it("formats a markdown summary of additions, deletions, and changed lines", () => {
    const summary = formatDiffSummary(diffTexts("alpha\nshort", "alpha\nlonger\nadded"), "en");

    assert.match(summary, /Added: 1/);
    assert.match(summary, /Changed: 1/);
    assert.match(summary, /~ Line 2/);
    assert.match(summary, /- short/);
    assert.match(summary, /\+ longer/);
    assert.match(summary, /\+ Line 3/);
    assert.match(summary, /\+ added/);
  });
});
