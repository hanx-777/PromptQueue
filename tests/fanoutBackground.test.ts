import assert from "node:assert/strict";
import { describe, it } from "node:test";

type RuntimeMessageListener = (
  request: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;

interface ChromeMock {
  listeners: RuntimeMessageListener[];
  sentMessages: Array<{ tabId: number; message: Record<string, unknown> }>;
  activatedTabs: number[];
}

function installChromeMock(
  tabs: chrome.tabs.Tab[],
  options: { stallFanoutRunMessages?: boolean; stallFanoutResultMessages?: boolean } = {}
): ChromeMock {
  const listeners: RuntimeMessageListener[] = [];
  const sentMessages: Array<{ tabId: number; message: Record<string, unknown> }> = [];
  const activatedTabs: number[] = [];

  (globalThis as unknown as { chrome: typeof chrome }).chrome = {
    contextMenus: {
      create: () => undefined,
      removeAll: (callback?: () => void) => callback?.(),
      onClicked: {
        addListener: () => undefined
      }
    },
    i18n: {
      getUILanguage: () => "en"
    },
    identity: {
      getAuthToken: () => undefined
    },
    notifications: {
      create: () => undefined
    },
    permissions: {
      contains: async () => false
    },
    runtime: {
      getURL: (path: string) => path,
      lastError: undefined,
      onInstalled: {
        addListener: () => undefined
      },
      onMessage: {
        addListener: (listener: RuntimeMessageListener) => {
          listeners.push(listener);
        },
        removeListener: () => undefined
      },
      onStartup: {
        addListener: () => undefined
      }
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => undefined
      },
      onChanged: {
        addListener: () => undefined,
        removeListener: () => undefined
      }
    },
    tabs: {
      create: async () => ({} as chrome.tabs.Tab),
      query: async () => tabs,
      update: async (tabId: number, updateProperties: chrome.tabs.UpdateProperties) => {
        if (updateProperties.active) {
          activatedTabs.push(tabId);
        }
        return tabs.find((tab) => tab.id === tabId) ?? ({} as chrome.tabs.Tab);
      },
      sendMessage: async (tabId: number, message: Record<string, unknown>) => {
        sentMessages.push({ tabId, message });
        if (options.stallFanoutRunMessages && message.type === "promptqueue.fanoutRun") {
          return await new Promise(() => undefined);
        }
        if (options.stallFanoutResultMessages && message.type === "promptqueue.fanoutResult") {
          return await new Promise(() => undefined);
        }
        return undefined;
      }
    }
  } as unknown as typeof chrome;

  return { listeners, sentMessages, activatedTabs };
}

function timeoutAfter(ms: number): Promise<"timeout"> {
  return new Promise((resolve) => setTimeout(() => resolve("timeout"), ms));
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function callListener(
  listener: RuntimeMessageListener,
  request: Record<string, unknown>,
  sender: chrome.runtime.MessageSender
): { keepAlive: boolean | void; response: Promise<unknown> } {
  let resolveResponse: (response: unknown) => void = () => undefined;
  const response = new Promise<unknown>((resolve) => {
    resolveResponse = resolve;
  });
  const keepAlive = listener(request, sender, resolveResponse);
  return { keepAlive, response };
}

async function loadBackground(): Promise<void> {
  delete require.cache[require.resolve("../src/background/index")];
  // @ts-expect-error background/index is a side-effect-only service worker script.
  await import("../src/background/index");
}

describe("background fan-out dispatch", () => {
  it("deduplicates provider targets and keeps async result relays alive", async () => {
    const chromeMock = installChromeMock([
      { id: 1, url: "https://chatgpt.com/c/current", active: true, lastAccessed: 10 } as chrome.tabs.Tab,
      { id: 2, url: "https://chat.openai.com/c/older", active: false, lastAccessed: 20 } as chrome.tabs.Tab,
      { id: 3, url: "https://gemini.google.com/app", active: false, lastAccessed: 30 } as chrome.tabs.Tab,
      { id: 4, url: "https://claude.ai/chat/old", active: false, lastAccessed: 40 } as chrome.tabs.Tab,
      { id: 5, url: "https://claude.ai/new", active: true, lastAccessed: 50 } as chrome.tabs.Tab
    ]);

    await loadBackground();
    const listener = chromeMock.listeners[0];
    assert.ok(listener, "background runtime listener should be registered");

    const broadcast = callListener(
      listener,
      { type: "FANOUT_BROADCAST", prompt: "Compare these answers." },
      { tab: { id: 1 } as chrome.tabs.Tab }
    );

    assert.equal(broadcast.keepAlive, true);
    const broadcastResponse = await broadcast.response as { fanoutSessionId: string; providers: string[] };
    assert.deepEqual(broadcastResponse.providers, ["ChatGPT", "Gemini", "Claude"]);
    await waitForCondition(() => chromeMock.sentMessages.filter((item) => item.message.type === "promptqueue.fanoutRun").length === 3);
    assert.deepEqual(chromeMock.activatedTabs, [1, 3, 5]);
    assert.deepEqual(
      chromeMock.sentMessages
        .filter((item) => item.message.type === "promptqueue.fanoutRun")
        .map((item) => item.tabId),
      [1, 3, 5]
    );

    const relay = callListener(
      listener,
      {
        type: "FANOUT_RESULT",
        fanoutSessionId: broadcastResponse.fanoutSessionId,
        provider: "Gemini",
        text: "Gemini finished."
      },
      { tab: { id: 3 } as chrome.tabs.Tab }
    );

    assert.equal(relay.keepAlive, true);
    assert.deepEqual(await relay.response, { ok: true });
    assert.deepEqual(chromeMock.sentMessages[chromeMock.sentMessages.length - 1], {
      tabId: 1,
      message: {
        type: "promptqueue.fanoutResult",
        fanoutSessionId: broadcastResponse.fanoutSessionId,
        provider: "Gemini",
        text: "Gemini finished.",
        error: undefined
      }
    });
  });

  it("continues dispatching provider tabs even if an earlier provider run message stays unresolved", async () => {
    const chromeMock = installChromeMock([
      { id: 1, url: "https://chatgpt.com/c/current", active: true } as chrome.tabs.Tab,
      { id: 2, url: "https://gemini.google.com/app", active: false } as chrome.tabs.Tab
    ], { stallFanoutRunMessages: true });

    await loadBackground();
    const listener = chromeMock.listeners[0];
    assert.ok(listener, "background runtime listener should be registered");

    const broadcast = callListener(
      listener,
      { type: "FANOUT_BROADCAST", prompt: "Do not wait for provider completion." },
      { tab: { id: 1 } as chrome.tabs.Tab }
    );

    assert.equal(broadcast.keepAlive, true);
    const broadcastResponse = await Promise.race([broadcast.response, timeoutAfter(50)]);
    assert.notEqual(broadcastResponse, "timeout");
    assert.deepEqual((broadcastResponse as { providers: string[] }).providers, ["ChatGPT", "Gemini"]);
    await waitForCondition(() => chromeMock.sentMessages.filter((item) => item.message.type === "promptqueue.fanoutRun").length === 2);
    assert.deepEqual(chromeMock.activatedTabs, [1, 2]);
    assert.deepEqual(
      chromeMock.sentMessages.map((item) => item.tabId),
      [1, 2]
    );
  });

  it("uses the most recently accessed inactive tab when a provider has multiple candidates", async () => {
    const chromeMock = installChromeMock([
      { id: 1, url: "https://chatgpt.com/c/current", active: true, lastAccessed: 1_730_000_000_000 } as chrome.tabs.Tab,
      { id: 2, url: "https://gemini.google.com/app/old", active: false, lastAccessed: 1_720_000_000_000 } as chrome.tabs.Tab,
      { id: 3, url: "https://gemini.google.com/app/recent", active: false, lastAccessed: 1_730_000_000_000 } as chrome.tabs.Tab
    ]);

    await loadBackground();
    const listener = chromeMock.listeners[0];
    assert.ok(listener, "background runtime listener should be registered");

    const broadcast = callListener(
      listener,
      { type: "FANOUT_BROADCAST", prompt: "Use the freshest Gemini tab." },
      { tab: { id: 1 } as chrome.tabs.Tab }
    );

    assert.deepEqual((await broadcast.response as { providers: string[] }).providers, ["ChatGPT", "Gemini"]);
    await waitForCondition(() => chromeMock.sentMessages.filter((item) => item.message.type === "promptqueue.fanoutRun").length === 2);
    assert.deepEqual(
      chromeMock.sentMessages
        .filter((item) => item.message.type === "promptqueue.fanoutRun")
        .map((item) => item.tabId),
      [1, 3]
    );
  });

  it("acknowledges provider results even when the initiating tab does not respond", async () => {
    const chromeMock = installChromeMock([
      { id: 1, url: "https://chatgpt.com/c/current", active: true } as chrome.tabs.Tab,
      { id: 2, url: "https://gemini.google.com/app", active: false } as chrome.tabs.Tab
    ], { stallFanoutResultMessages: true });

    await loadBackground();
    const listener = chromeMock.listeners[0];
    assert.ok(listener, "background runtime listener should be registered");

    const broadcast = callListener(
      listener,
      { type: "FANOUT_BROADCAST", prompt: "Collect result without UI ack." },
      { tab: { id: 1 } as chrome.tabs.Tab }
    );
    const broadcastResponse = await broadcast.response as { fanoutSessionId: string };
    await waitForCondition(() => chromeMock.sentMessages.filter((item) => item.message.type === "promptqueue.fanoutRun").length === 2);

    const relay = callListener(
      listener,
      {
        type: "FANOUT_RESULT",
        fanoutSessionId: broadcastResponse.fanoutSessionId,
        provider: "Gemini",
        text: "Gemini result"
      },
      { tab: { id: 2 } as chrome.tabs.Tab }
    );

    assert.equal(relay.keepAlive, true);
    assert.deepEqual(await Promise.race([relay.response, timeoutAfter(50)]), { ok: true });
    assert.deepEqual(chromeMock.sentMessages.find((item) => item.message.type === "promptqueue.fanoutResult"), {
      tabId: 1,
      message: {
        type: "promptqueue.fanoutResult",
        fanoutSessionId: broadcastResponse.fanoutSessionId,
        provider: "Gemini",
        text: "Gemini result",
        error: undefined
      }
    });
  });
});
