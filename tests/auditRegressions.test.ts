import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { hasActiveQueue } from "../src/content/providerRuntime";
import { DEFAULT_STATE, saveState } from "../src/content/storage";
import type { QueueState, QueueTask } from "../src/content/types";
import { diffTexts } from "../src/utils/textDiff";

const originalConsoleWarn = console.warn;

function makeTask(status: QueueTask["status"]): QueueTask {
  return {
    id: `${status}-task`,
    prompt: `Prompt for ${status}`,
    status,
    createdAt: 1,
    updatedAt: 1
  };
}

function setMockChromeStorage(setImpl: (items: Record<string, unknown>) => Promise<void>): void {
  (globalThis as unknown as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: async () => ({}),
        set: setImpl
      },
      onChanged: {
        addListener: () => undefined,
        removeListener: () => undefined
      }
    }
  };
}

afterEach(() => {
  console.warn = originalConsoleWarn;
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("storage persistence", () => {
  it("rejects when chrome storage cannot persist state", async () => {
    console.warn = () => undefined;

    setMockChromeStorage(async () => {
      throw new Error("quota exceeded");
    });

    await assert.rejects(
      () => saveState({ ...DEFAULT_STATE, tasks: [makeTask("pending")] }),
      /quota exceeded/
    );
  });
});

describe("queue activity detection", () => {
  it("does not treat failed or skipped tasks as active queue work", () => {
    const state: QueueState = {
      tasks: [makeTask("failed"), makeTask("skipped")],
      isRunning: false,
      isPaused: false
    };

    assert.equal(hasActiveQueue(state), false);
  });
});

describe("large text diffs", () => {
  it("falls back to whole-line replacement for very large changed lines", () => {
    const oldLine = Array.from({ length: 420 }, (_, index) => `alpha${index}`).join(" ");
    const newLine = Array.from({ length: 420 }, (_, index) => `beta${index}`).join(" ");
    const [line] = diffTexts(oldLine, newLine);

    assert.equal(line?.type, "replace");
    assert.equal(line?.oldParts.length, 1);
    assert.equal(line?.oldParts[0]?.type, "delete");
    assert.equal(line?.newParts.length, 1);
    assert.equal(line?.newParts[0]?.type, "insert");
  });
});
