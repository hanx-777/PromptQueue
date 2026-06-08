import type { ContextMenuActionType, PendingContextAction, QueueSettings } from "./types";

export const PENDING_CONTEXT_ACTIONS_KEY = "chatgptQueueSteer.pendingContextActions";
export const CONTEXT_ACTION_MESSAGE_TYPE = "promptqueue.contextAction";
export const CONTEXT_ACTION_EVENT = "promptqueue-context-actions";
export const MAX_PENDING_CONTEXT_ACTIONS = 20;

const VALID_CONTEXT_ACTION_TYPES: ContextMenuActionType[] = [
  "queue-selection",
  "summarize-selection",
  "translate-selection",
  "rewrite-selection",
  "explain-selection",
  "queue-page-context"
];

let memoryPendingContextActions: PendingContextAction[] = [];

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getCreatedAt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Date.now();
}

function isSelectionAction(type: ContextMenuActionType): boolean {
  return type !== "queue-page-context";
}

function normalizePendingContextAction(value: unknown): PendingContextAction | null {
  if (!isRecord(value) || !VALID_CONTEXT_ACTION_TYPES.includes(value.type as ContextMenuActionType)) {
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

  return {
    id: getText(value.id)?.trim() || `ctx-${getCreatedAt(value.createdAt)}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    selectionText,
    pageTitle,
    pageUrl,
    createdAt: getCreatedAt(value.createdAt)
  };
}

export function normalizePendingContextActions(value: unknown): PendingContextAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizePendingContextAction)
    .filter((action): action is PendingContextAction => Boolean(action))
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_PENDING_CONTEXT_ACTIONS);
}

export async function loadPendingContextActions(): Promise<PendingContextAction[]> {
  if (!hasChromeStorage()) {
    return normalizePendingContextActions(memoryPendingContextActions);
  }

  const raw = await chrome.storage.local.get([PENDING_CONTEXT_ACTIONS_KEY]);
  return normalizePendingContextActions(raw[PENDING_CONTEXT_ACTIONS_KEY]);
}

export async function savePendingContextActions(actions: PendingContextAction[]): Promise<void> {
  const safeActions = normalizePendingContextActions(actions);
  memoryPendingContextActions = safeActions;

  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.local.set({ [PENDING_CONTEXT_ACTIONS_KEY]: safeActions });
}

export async function consumePendingContextActions(): Promise<PendingContextAction[]> {
  const actions = await loadPendingContextActions();
  await savePendingContextActions([]);
  return actions;
}

function getSelectionText(action: PendingContextAction): string | null {
  const selectionText = action.selectionText ?? "";
  return selectionText.trim() ? selectionText : null;
}

function buildPageContextPrompt(action: PendingContextAction, language: QueueSettings["language"]): string | null {
  const title = action.pageTitle?.trim();
  const url = action.pageUrl?.trim();
  if (!title && !url) {
    return null;
  }

  if (language === "zh") {
    return [
      "请基于以下网页上下文继续处理：",
      "",
      title ? `标题：${title}` : "",
      url ? `URL：${url}` : ""
    ].filter(Boolean).join("\n");
  }

  return [
    "Use this page context for the next task:",
    "",
    title ? `Title: ${title}` : "",
    url ? `URL: ${url}` : ""
  ].filter(Boolean).join("\n");
}

export function buildContextPrompt(
  action: PendingContextAction,
  language: QueueSettings["language"]
): string | null {
  if (action.type === "queue-page-context") {
    return buildPageContextPrompt(action, language);
  }

  const selectionText = getSelectionText(action);
  if (!selectionText) {
    return null;
  }

  if (action.type === "queue-selection") {
    return selectionText;
  }

  const prompts: Record<Exclude<ContextMenuActionType, "queue-selection" | "queue-page-context">, string> = language === "zh"
    ? {
        "summarize-selection": "请总结以下选中文本，保留关键结论和行动项：",
        "translate-selection": "请将以下选中文本翻译成中文，保留原意和格式：",
        "rewrite-selection": "请改写以下选中文本，使表达更清晰自然：",
        "explain-selection": "请解释以下选中文本，说明关键概念、背景和含义："
      }
    : {
        "summarize-selection": "Summarize the selected text and keep the key conclusions and action items:",
        "translate-selection": "Translate the selected text into English while preserving meaning and formatting:",
        "rewrite-selection": "Rewrite the selected text so it is clearer and more natural:",
        "explain-selection": "Explain the selected text, including key concepts, context, and implications:"
      };

  return `${prompts[action.type]}\n\n${selectionText}`;
}
