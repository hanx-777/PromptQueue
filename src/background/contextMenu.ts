import type { ContextMenuActionType, PendingContextAction } from "../content/types";

export const DEFAULT_CONTEXT_TARGET_URL = "https://chatgpt.com/";

const PROVIDER_HOSTS = new Set([
  "chatgpt.com",
  "chat.openai.com",
  "gemini.google.com",
  "claude.ai"
]);

export interface ContextMenuDispatchTarget {
  url?: string;
}

export type ContextMenuDispatch =
  | {
      target: "message";
      action: PendingContextAction;
    }
  | {
      target: "pending";
      action: PendingContextAction;
      openUrl: string;
    };

function isValidActionType(value: string): value is ContextMenuActionType {
  return (
    value === "queue-selection" ||
    value === "summarize-selection" ||
    value === "translate-selection" ||
    value === "rewrite-selection" ||
    value === "explain-selection" ||
    value === "queue-page-context"
  );
}

export function isProviderUrl(url: string | undefined): boolean {
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

export function createContextMenuAction(
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

export function resolveContextMenuDispatch(
  action: PendingContextAction,
  target: ContextMenuDispatchTarget
): ContextMenuDispatch {
  if (isProviderUrl(target.url ?? action.pageUrl)) {
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
