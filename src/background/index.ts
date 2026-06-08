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

function createContextMenus(): void {
  const language = getBrowserLanguage();
  chrome.contextMenus.removeAll(() => {
    MENU_ITEMS.forEach((item) => {
      chrome.contextMenus.create({
        id: item.id,
        title: item.title[language],
        contexts: item.contexts
      });
    });
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
