type ContextMenuActionType =
  | "queue-selection"
  | "summarize-selection"
  | "translate-selection"
  | "rewrite-selection"
  | "explain-selection"
  | "queue-page-context";

interface PendingContextAction {
  id: string;
  type: ContextMenuActionType;
  selectionText?: string;
  pageTitle?: string;
  pageUrl?: string;
  createdAt: number;
}

type ContextMenuDispatch =
  | {
      target: "message";
      action: PendingContextAction;
    }
  | {
      target: "pending";
      action: PendingContextAction;
      openUrl: string;
    };

const PENDING_CONTEXT_ACTIONS_KEY = "chatgptQueueSteer.pendingContextActions";
const CONTEXT_ACTION_MESSAGE_TYPE = "promptqueue.contextAction";
const DEFAULT_CONTEXT_TARGET_URL = "https://chatgpt.com/";
const MAX_PENDING_CONTEXT_ACTIONS = 20;

const PROVIDER_HOSTS = new Set([
  "chatgpt.com",
  "chat.openai.com",
  "gemini.google.com",
  "claude.ai"
]);

const PROVIDER_HOST_LABELS: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "gemini.google.com": "Gemini",
  "claude.ai": "Claude"
};

const PROVIDER_URL_PATTERNS = Array.from(PROVIDER_HOSTS, (host) => `https://${host}/*`);

const VALID_CONTEXT_ACTION_TYPES: ContextMenuActionType[] = [
  "queue-selection",
  "summarize-selection",
  "translate-selection",
  "rewrite-selection",
  "explain-selection",
  "queue-page-context"
];

const MENU_ITEMS: Array<{ id: ContextMenuActionType; title: { en: string; zh: string }; contexts: chrome.contextMenus.ContextType[] }> = [
  {
    id: "queue-selection",
    title: { en: "Queue selection", zh: "加入队列：选中文本" },
    contexts: ["selection"]
  },
  {
    id: "summarize-selection",
    title: { en: "Summarize selection", zh: "总结选中文本" },
    contexts: ["selection"]
  },
  {
    id: "translate-selection",
    title: { en: "Translate selection", zh: "翻译选中文本" },
    contexts: ["selection"]
  },
  {
    id: "rewrite-selection",
    title: { en: "Rewrite selection", zh: "改写选中文本" },
    contexts: ["selection"]
  },
  {
    id: "explain-selection",
    title: { en: "Explain selection", zh: "解释选中文本" },
    contexts: ["selection"]
  },
  {
    id: "queue-page-context",
    title: { en: "Queue page context", zh: "加入队列：页面上下文" },
    contexts: ["page", "selection", "link"]
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidActionType(value: string): value is ContextMenuActionType {
  return VALID_CONTEXT_ACTION_TYPES.includes(value as ContextMenuActionType);
}

function isSelectionAction(type: ContextMenuActionType): boolean {
  return type !== "queue-page-context";
}

function getText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getCreatedAt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Date.now();
}

function normalizePendingContextAction(value: unknown): PendingContextAction | null {
  if (!isRecord(value) || !isValidActionType(String(value.type))) {
    return null;
  }

  const type = value.type as ContextMenuActionType;
  const selectionText = getText(value.selectionText);
  if (isSelectionAction(type) && !selectionText?.trim()) {
    return null;
  }

  const pageTitle = getText(value.pageTitle);
  const pageUrl = getText(value.pageUrl);
  if (type === "queue-page-context" && !pageTitle?.trim() && !pageUrl?.trim()) {
    return null;
  }

  const createdAt = getCreatedAt(value.createdAt);
  return {
    id: getText(value.id)?.trim() || `ctx-${type}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    selectionText,
    pageTitle,
    pageUrl,
    createdAt
  };
}

function normalizePendingContextActions(value: unknown): PendingContextAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizePendingContextAction)
    .filter((action): action is PendingContextAction => Boolean(action))
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_PENDING_CONTEXT_ACTIONS);
}

async function loadPendingContextActions(): Promise<PendingContextAction[]> {
  const raw = await chrome.storage.local.get([PENDING_CONTEXT_ACTIONS_KEY]);
  return normalizePendingContextActions(raw[PENDING_CONTEXT_ACTIONS_KEY]);
}

async function savePendingContextActions(actions: PendingContextAction[]): Promise<void> {
  await chrome.storage.local.set({
    [PENDING_CONTEXT_ACTIONS_KEY]: normalizePendingContextActions(actions)
  });
}

function getBrowserLanguage(): "zh" | "en" {
  const language = chrome.i18n?.getUILanguage?.().toLowerCase() ?? "";
  return language.startsWith("zh") ? "zh" : "en";
}

let contextMenuSetupInProgress = false;

function createContextMenus(): void {
  if (contextMenuSetupInProgress) {
    return;
  }

  contextMenuSetupInProgress = true;
  const language = getBrowserLanguage();
  chrome.contextMenus.removeAll(() => {
    try {
      MENU_ITEMS.forEach((item) => {
        chrome.contextMenus.create({
          id: item.id,
          title: item.title[language],
          contexts: item.contexts
        });
      });
    } finally {
      contextMenuSetupInProgress = false;
    }
  });
}

function isProviderUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    return PROVIDER_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function createContextActionId(type: ContextMenuActionType, createdAt: number): string {
  return `ctx-${type}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
}

function createContextMenuAction(
  menuItemId: string,
  info: Pick<chrome.contextMenus.OnClickData, "selectionText" | "pageUrl">,
  tab: Pick<chrome.tabs.Tab, "title" | "url"> | undefined,
  createdAt = Date.now()
): PendingContextAction | null {
  if (!isValidActionType(menuItemId)) {
    return null;
  }

  const selectionText = typeof info.selectionText === "string" ? info.selectionText : undefined;
  if (menuItemId !== "queue-page-context" && !selectionText?.trim()) {
    return null;
  }

  const pageUrl = typeof info.pageUrl === "string" && info.pageUrl
    ? info.pageUrl
    : typeof tab?.url === "string"
      ? tab.url
      : undefined;

  return {
    id: createContextActionId(menuItemId, createdAt),
    type: menuItemId,
    selectionText,
    pageTitle: typeof tab?.title === "string" ? tab.title : undefined,
    pageUrl,
    createdAt
  };
}

function resolveContextMenuDispatch(action: PendingContextAction, url: string | undefined): ContextMenuDispatch {
  if (isProviderUrl(url ?? action.pageUrl)) {
    return {
      target: "message",
      action
    };
  }

  return {
    target: "pending",
    action,
    openUrl: DEFAULT_CONTEXT_TARGET_URL
  };
}

async function appendPendingAction(action: PendingContextAction): Promise<void> {
  const current = await loadPendingContextActions();
  await savePendingContextActions([...current, action]);
}

async function sendActionToTab(tabId: number, action: PendingContextAction): Promise<void> {
  await chrome.tabs.sendMessage(tabId, {
    type: CONTEXT_ACTION_MESSAGE_TYPE,
    action
  });
}

async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  const action = createContextMenuAction(String(info.menuItemId), info, tab, Date.now());
  if (!action) {
    return;
  }

  const dispatch = resolveContextMenuDispatch(action, tab?.url ?? info.pageUrl);
  if (dispatch.target === "message" && typeof tab?.id === "number") {
    try {
      await sendActionToTab(tab.id, dispatch.action);
      return;
    } catch {
      await appendPendingAction(dispatch.action);
      return;
    }
  }

  await appendPendingAction(dispatch.action);
  await chrome.tabs.create({ url: dispatch.target === "pending" ? dispatch.openUrl : DEFAULT_CONTEXT_TARGET_URL });
}

chrome.runtime.onInstalled.addListener(createContextMenus);
chrome.runtime.onStartup?.addListener(createContextMenus);
createContextMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleContextMenuClick(info, tab);
});

async function handleGetGoogleAuthToken(sendResponse: (response: { token?: string; error?: string }) => void): Promise<void> {
  const granted = await chrome.permissions.contains({ permissions: ["identity"] });
  if (!granted) {
    sendResponse({ error: "The identity permission has not been granted. Enable Google Drive backup in Settings first." });
    return;
  }

  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
      sendResponse({ error: chrome.runtime.lastError?.message || "Failed to get token" });
    } else {
      sendResponse({ token });
    }
  });
}

function handleShowNotification(request: { title?: unknown; message?: unknown }): void {
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: typeof request.title === "string" && request.title ? request.title : "PromptQueue",
    message: typeof request.message === "string" ? request.message : ""
  });
}

interface FanoutSession {
  initiatingTabId: number;
  remaining: number;
}

type FanoutTarget = chrome.tabs.Tab & { id: number; label: string };

const fanoutSessions = new Map<string, FanoutSession>();

function createFanoutSessionId(): string {
  return `fanout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function labelForTabUrl(url: string | undefined): string {
  if (!url) {
    return "Unknown";
  }
  try {
    return PROVIDER_HOST_LABELS[new URL(url).hostname] ?? "Unknown";
  } catch {
    return "Unknown";
  }
}

function providerOrder(label: string): number {
  return ["ChatGPT", "Gemini", "Claude"].indexOf(label);
}

function lastAccessedValue(tab: chrome.tabs.Tab): number {
  return typeof tab.lastAccessed === "number" && Number.isFinite(tab.lastAccessed) ? tab.lastAccessed : 0;
}

function compareFanoutTabCandidate(
  candidate: chrome.tabs.Tab & { id: number },
  current: chrome.tabs.Tab & { id: number },
  senderTabId: number
): number {
  const candidateIsSender = candidate.id === senderTabId;
  const currentIsSender = current.id === senderTabId;
  if (candidateIsSender !== currentIsSender) {
    return candidateIsSender ? 1 : -1;
  }

  if (Boolean(candidate.active) !== Boolean(current.active)) {
    return candidate.active ? 1 : -1;
  }

  const lastAccessedDelta = lastAccessedValue(candidate) - lastAccessedValue(current);
  if (lastAccessedDelta !== 0) {
    return lastAccessedDelta;
  }

  return candidate.id - current.id;
}

function resolveFanoutTargets(tabs: chrome.tabs.Tab[], senderTabId: number): FanoutTarget[] {
  const byProvider = new Map<string, FanoutTarget>();

  for (const tab of tabs) {
    if (typeof tab.id !== "number") {
      continue;
    }

    const label = labelForTabUrl(tab.url);
    if (label === "Unknown") {
      continue;
    }

    const target: FanoutTarget = { ...tab, id: tab.id, label };
    const current = byProvider.get(label);
    if (!current || compareFanoutTabCandidate(target, current, senderTabId) > 0) {
      byProvider.set(label, target);
    }
  }

  return Array.from(byProvider.values()).sort((left, right) => {
    const leftOrder = providerOrder(left.label);
    const rightOrder = providerOrder(right.label);
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.label.localeCompare(right.label);
  });
}

async function relayFanoutResult(
  fanoutSessionId: string,
  provider: string,
  result: { text?: string; error?: string }
): Promise<void> {
  const session = fanoutSessions.get(fanoutSessionId);
  if (!session) {
    return;
  }

  try {
    void chrome.tabs.sendMessage(session.initiatingTabId, {
      type: "promptqueue.fanoutResult",
      fanoutSessionId,
      provider,
      ...result
    }).catch(() => undefined);
  } catch {
    // Originating tab may have navigated away or closed; nothing more to relay.
  }

  session.remaining -= 1;
  if (session.remaining <= 0) {
    fanoutSessions.delete(fanoutSessionId);
  }
}

function dispatchFanoutRun(target: FanoutTarget, fanoutSessionId: string, prompt: string): void {
  try {
    void chrome.tabs.sendMessage(target.id, {
      type: "promptqueue.fanoutRun",
      fanoutSessionId,
      prompt
    }).catch(() => {
      void relayFanoutResult(fanoutSessionId, target.label, { error: "This tab could not be reached." });
    });
  } catch {
    void relayFanoutResult(fanoutSessionId, target.label, { error: "This tab could not be reached." });
  }
}

async function activateFanoutTarget(target: FanoutTarget): Promise<void> {
  try {
    await chrome.tabs.update(target.id, { active: true });
    await delay(350);
  } catch {
    // Some browsers may deny tab activation for a stale target; still try to dispatch below.
  }
}

async function dispatchFanoutRuns(targets: FanoutTarget[], fanoutSessionId: string, prompt: string): Promise<void> {
  for (const target of targets) {
    await activateFanoutTarget(target);
    dispatchFanoutRun(target, fanoutSessionId, prompt);
  }
}

async function handleFanoutBroadcast(
  request: { prompt?: unknown },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: { fanoutSessionId?: string; providers?: string[]; error?: string }) => void
): Promise<void> {
  const prompt = typeof request.prompt === "string" ? request.prompt.trim() : "";
  if (!prompt || typeof sender.tab?.id !== "number") {
    sendResponse({ error: "Missing prompt or sender tab." });
    return;
  }

  const tabs = await chrome.tabs.query({ url: PROVIDER_URL_PATTERNS });
  const targets = resolveFanoutTargets(tabs, sender.tab.id);
  if (!targets.length) {
    sendResponse({ error: "No supported AI page tabs are open." });
    return;
  }

  const fanoutSessionId = createFanoutSessionId();
  fanoutSessions.set(fanoutSessionId, { initiatingTabId: sender.tab.id, remaining: targets.length });

  const providers = targets.map((target) => target.label);
  sendResponse({ fanoutSessionId, providers });

  void dispatchFanoutRuns(targets, fanoutSessionId, prompt);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_GOOGLE_AUTH_TOKEN") {
    void handleGetGoogleAuthToken(sendResponse);
    return true; // Keep the message channel open for the async response
  }
  if (request.type === "SHOW_NOTIFICATION") {
    handleShowNotification(request);
    return false;
  }
  if (request.type === "FANOUT_BROADCAST") {
    void handleFanoutBroadcast(request, sender, sendResponse);
    return true;
  }
  if (request.type === "FANOUT_RESULT") {
    const fanoutSessionId = typeof request.fanoutSessionId === "string" ? request.fanoutSessionId : "";
    if (!fanoutSessionId) {
      sendResponse({ ok: false });
      return false;
    }

    void relayFanoutResult(fanoutSessionId, typeof request.provider === "string" ? request.provider : "Unknown", {
      text: typeof request.text === "string" ? request.text : undefined,
      error: typeof request.error === "string" ? request.error : undefined
    })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});
