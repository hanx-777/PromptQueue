import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { getProviderHealthStatus, getProviderPreflightFailureStage } from "../src/content/providerRuntime";
import { DEFAULT_SETTINGS } from "../src/content/storage";
import type { ProviderAdapter } from "../src/content/providers";
import type { ProviderGenerationSnapshot } from "../src/content/providers";
import { extractReplyTextAfterPromptEcho, isNewAssistantMessageCandidate, isPromptEchoFallbackCandidate } from "../src/content/fanout";
import { evaluateReplySnapshotActivity } from "../src/content/replyWatcher";
import type { QueueRunLogEntry, QueueState, QueueTask, QueueWorkflow } from "../src/content/types";
import { BUILT_IN_WORKFLOW_TEMPLATES, createWorkflowFromTemplate } from "../src/content/workflowTemplates";
import { shouldAutoRetryTask } from "../src/content/queueRunner";
import { appendRunLogEntry, formatRunLogMarkdown } from "../src/utils/runLog";
import { formatTaskResultsMarkdown, getDoneTasks } from "../src/utils/taskResults";
import { getIncompleteRowCount, getMissingVariableColumns, parseVariableTable } from "../src/utils/csvVariables";
import { diffTexts, formatDiffSummary } from "../src/utils/textDiff";
import { copyWorkflow, filterWorkflows, normalizeWorkflowTags } from "../src/utils/workflows";
import { applyWorkflowVariables, extractWorkflowVariables } from "../src/utils/workflowVariables";
import { createFanoutResultRows, summarizeFanoutResults } from "../src/utils/fanoutResults";
import { cleanAssistantText, isLikelyUserAuthoredMessageText } from "../src/content/providers/domAdapterFactory";

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

function makeWorkflow(patch: Partial<QueueWorkflow> = {}): QueueWorkflow {
  return {
    id: "workflow-1",
    name: "Academic Polish",
    messages: [
      {
        id: "message-1",
        prompt: "Polish a research abstract",
        createdAt: 1,
        updatedAt: 1
      }
    ],
    tags: ["writing"],
    createdAt: 1,
    updatedAt: 1,
    ...patch
  };
}

function makeProviderAdapter(patch: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    id: "chatgpt",
    label: "ChatGPT",
    hostnames: ["chatgpt.com"],
    findComposer: () => ({} as HTMLElement),
    findComposerAnchor: () => null,
    findSendButton: () => ({} as HTMLButtonElement),
    findStopButton: () => null,
    setComposerText: async () => undefined,
    clickSend: async () => undefined,
    clickStop: async () => false,
    isGenerating: () => false,
    findMainArea: () => ({} as HTMLElement),
    getGenerationSnapshot: () => ({
      composerReady: true,
      sendReady: true,
      stopButtonVisible: false,
      structuredBusyIndicators: 0,
      generatingIndicators: 0,
      pendingMedia: false,
      assistantSignature: "0:0:0",
      assistantTextLength: 0,
      assistantMediaCount: 0,
      assistantMessageCount: 0
    }),
    selectModel: async () => ({ selected: false }),
    getLastAssistantMessage: () => null,
    ...patch
  };
}

function makeGenerationSnapshot(patch: Partial<ProviderGenerationSnapshot> = {}): ProviderGenerationSnapshot {
  return {
    composerReady: true,
    sendReady: true,
    stopButtonVisible: false,
    structuredBusyIndicators: 0,
    generatingIndicators: 0,
    pendingMedia: false,
    assistantSignature: "0:0:0",
    assistantTextLength: 0,
    assistantMediaCount: 0,
    assistantMessageCount: 0,
    ...patch
  };
}

function unicodeEscape(word: string): string {
  return Array.from(word)
    .map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)
    .join("");
}

describe("reply watcher activity tracking", () => {
  it("does not refresh stability forever after a reply has merely grown from the baseline", () => {
    const baseline = makeGenerationSnapshot({
      assistantSignature: "10:0:10",
      assistantTextLength: 10
    });
    const reply = makeGenerationSnapshot({
      assistantSignature: "25:0:25",
      assistantTextLength: 25
    });

    const firstPoll = evaluateReplySnapshotActivity(baseline, {
      assistantSignature: baseline.assistantSignature,
      assistantTextLength: baseline.assistantTextLength,
      assistantMediaCount: baseline.assistantMediaCount,
      assistantMessageCount: baseline.assistantMessageCount
    }, reply);
    assert.equal(firstPoll.changedSinceLastPoll, true);
    assert.equal(firstPoll.grewFromBaseline, true);

    const secondPoll = evaluateReplySnapshotActivity(baseline, firstPoll.observedSnapshot, reply);
    assert.equal(secondPoll.changedSinceLastPoll, false);
    assert.equal(secondPoll.grewFromBaseline, true);
  });
});

describe("fan-out reply capture", () => {
  it("accepts a repeated final reply text when the assistant snapshot grew", () => {
    const baseline = makeGenerationSnapshot({
      assistantSignature: "100:0:100",
      assistantTextLength: 100,
      assistantMessageCount: 4
    });
    const repeatedReply = makeGenerationSnapshot({
      assistantSignature: "110:0:110",
      assistantTextLength: 110,
      assistantMessageCount: 4
    });

    assert.equal(
      isNewAssistantMessageCandidate(baseline, { text: "Google OK" }, repeatedReply, { text: "Google OK" }),
      true
    );
    assert.equal(
      isNewAssistantMessageCandidate(baseline, { text: "Google OK" }, baseline, { text: "Google OK" }),
      false
    );
  });

  it("rejects provider user-message containers as assistant reply candidates", () => {
    assert.equal(isLikelyUserAuthoredMessageText("You said: PromptQueue final verification\nPromptQueue final verification"), true);
    assert.equal(isLikelyUserAuthoredMessageText("你说 PromptQueue final verification"), true);
    assert.equal(isLikelyUserAuthoredMessageText("Google OK"), false);
    assert.equal(isLikelyUserAuthoredMessageText("Claude responded: Anthropic Claude OK.\nAnthropic Claude OK"), false);
  });

  it("filters provider chrome headings before reading assistant replies", () => {
    assert.equal(cleanAssistantText("Defining the Output"), "");
    assert.equal(cleanAssistantText("Gemini 说\nDefining the Output\nGoogle OK"), "Google OK");
  });

  it("allows repeated short replies after the prompt echo but never the prompt itself", () => {
    const prompt = "PromptQueue text capture smoke: reply with only provider name + OK.";

    assert.equal(isPromptEchoFallbackCandidate(prompt, { text: "Google OK" }), true);
    assert.equal(isPromptEchoFallbackCandidate(prompt, { text: prompt }), false);
    assert.equal(isPromptEchoFallbackCandidate(prompt, { text: `You said: ${prompt}` }), false);
  });

  it("extracts the reply that follows the echoed prompt in provider page text", () => {
    const prompt = "PromptQueue text capture smoke: reply with only provider name + OK.";
    const pageText = [
      "Gemini 说",
      "Google OK",
      "你说",
      prompt,
      "Gemini 说",
      "Defining the Output",
      "Google OK",
      "问问 Gemini",
      "PromptQueue"
    ].join("\n");

    assert.equal(extractReplyTextAfterPromptEcho(pageText, prompt), "Google OK");
    assert.equal(extractReplyTextAfterPromptEcho(`你说\n${prompt}\nPromptQueue\n页面检测`, prompt), null);
  });
});

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

  it("formats failure stages in markdown entries", () => {
    const markdown = formatRunLogMarkdown([
      {
        ...makeLogEntry(1),
        status: "failed",
        failureStage: "composer-missing",
        error: "Composer missing"
      }
    ]);

    assert.match(markdown, /Failure stage: composer-missing/);
  });
});

describe("task results", () => {
  it("filters to done tasks only and formats prompt/reply pairs as markdown", () => {
    const tasks: QueueTask[] = [
      makeTask({ id: "t1", status: "pending" }),
      makeTask({ id: "t2", status: "done", prompt: "Summarize this", resultSummary: "Here is a summary." }),
      makeTask({ id: "t3", status: "done", prompt: "Translate this" })
    ];

    const done = getDoneTasks(tasks);
    assert.deepEqual(done.map((task) => task.id), ["t2", "t3"]);

    const markdown = formatTaskResultsMarkdown(tasks);
    assert.match(markdown, /Summarize this/);
    assert.match(markdown, /Here is a summary\./);
    assert.match(markdown, /Translate this/);
    assert.match(markdown, /\(not captured\)/);
  });

  it("reports no completed results when nothing is done", () => {
    const markdown = formatTaskResultsMarkdown([makeTask({ status: "pending" })]);
    assert.match(markdown, /No completed results\./);
  });
});

describe("csv variable table", () => {
  it("parses tab-separated pasted rows into header-keyed records", () => {
    const raw = "topic\tstyle\nAI\tformal\ncats\tcasual";
    const table = parseVariableTable(raw);

    assert.deepEqual(table.headers, ["topic", "style"]);
    assert.deepEqual(table.rows, [
      { topic: "AI", style: "formal" },
      { topic: "cats", style: "casual" }
    ]);
  });

  it("falls back to comma-separated parsing and ignores blank lines", () => {
    const raw = "topic,style\n\nAI,formal\n";
    const table = parseVariableTable(raw);

    assert.deepEqual(table.headers, ["topic", "style"]);
    assert.deepEqual(table.rows, [{ topic: "AI", style: "formal" }]);
  });

  it("reports missing required columns and incomplete rows", () => {
    const table = parseVariableTable("topic\nAI\n");
    assert.deepEqual(getMissingVariableColumns(table.headers, ["topic", "style"]), ["style"]);

    const rows = [{ topic: "AI", style: "formal" }, { topic: "", style: "casual" }];
    assert.equal(getIncompleteRowCount(rows, ["topic", "style"]), 1);
  });
});

describe("provider health", () => {
  it("reports composer, send button, stop button, and busy state", () => {
    const provider = makeProviderAdapter({
      findStopButton: () => ({} as HTMLButtonElement),
      isGenerating: () => true
    });
    const health = getProviderHealthStatus(provider, 1234);

    assert.deepEqual(health, {
      provider: "ChatGPT",
      composerFound: true,
      sendButtonFound: true,
      stopButtonFound: true,
      pageBusy: true,
      checkedAt: 1234
    });
  });

  it("maps missing composer and missing send button to preflight stages", () => {
    assert.equal(
      getProviderPreflightFailureStage(makeProviderAdapter({ findComposer: () => null })),
      "composer-missing"
    );
    assert.equal(
      getProviderPreflightFailureStage(makeProviderAdapter({ findSendButton: () => null })),
      "send-button-missing"
    );
    assert.equal(getProviderPreflightFailureStage(makeProviderAdapter()), null);
  });
});

describe("provider send button guards", () => {
  it("includes generic contenteditable composer selectors for modern chat editors", () => {
    for (const providerFile of ["chatgpt.ts", "gemini.ts", "claude.ts"]) {
      const source = fs.readFileSync(`src/content/providers/${providerFile}`, "utf8");

      assert.match(source, /\[contenteditable\]/, `${providerFile} should detect non-true contenteditable composers`);
    }
  });

  it("keeps localized attachment and tool controls out of send-button candidates", () => {
    for (const providerFile of ["chatgpt.ts", "gemini.ts", "claude.ts"]) {
      const source = fs.readFileSync(`src/content/providers/${providerFile}`, "utf8");
      const notSendWords = source.match(/notSendWords:\s*\[([^\]]+)\]/s)?.[1] ?? "";

      for (const word of ["上传", "附件", "工具", "模式", "模型"]) {
        assert.ok(
          notSendWords.includes(`"${word}"`) || notSendWords.includes(`"${unicodeEscape(word)}"`),
          `${providerFile} should block ${word} controls`
        );
      }
    }
  });
});

describe("fan-out result presentation", () => {
  it("creates stable provider rows and marks unopened providers immediately", () => {
    const rows = createFanoutResultRows(["Gemini"], "Open a tab first.");

    assert.deepEqual(rows.map((row) => [row.provider, row.status, row.error]), [
      ["ChatGPT", "error", "Open a tab first."],
      ["Gemini", "pending", undefined],
      ["Claude", "error", "Open a tab first."]
    ]);
  });

  it("summarizes pending, completed, and failed provider rows", () => {
    const summary = summarizeFanoutResults([
      { provider: "ChatGPT", status: "done", text: "ok" },
      { provider: "Gemini", status: "pending" },
      { provider: "Claude", status: "error", error: "Timed out." }
    ]);

    assert.deepEqual(summary, {
      total: 3,
      pending: 1,
      done: 1,
      error: 1,
      running: true
    });
  });
});

describe("workflow management helpers", () => {
  it("normalizes tags, filters by query and tag, and copies workflows with unique names", () => {
    assert.deepEqual(normalizeWorkflowTags([" writing ", "AI", "writing", "", "AI"]), ["writing", "AI"]);

    const workflows = [
      makeWorkflow({ id: "w1", name: "Academic Polish", tags: ["writing"] }),
      makeWorkflow({
        id: "w2",
        name: "Code Review",
        tags: ["code"],
        messages: [{ id: "m2", prompt: "Find edge cases", createdAt: 1, updatedAt: 1 }]
      })
    ];

    assert.deepEqual(filterWorkflows(workflows, { query: "edge", tag: "" }).map((workflow) => workflow.id), ["w2"]);
    assert.deepEqual(filterWorkflows(workflows, { query: "", tag: "writing" }).map((workflow) => workflow.id), ["w1"]);

    const copied = copyWorkflow(workflows[0], workflows.map((workflow) => workflow.name), 1000);
    assert.equal(copied.name, "Academic Polish (2)");
    assert.equal(copied.tags?.[0], "writing");
    assert.notEqual(copied.id, workflows[0].id);
    assert.notEqual(copied.messages[0]?.id, workflows[0].messages[0]?.id);
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
