import { getCurrentProvider } from "./providers";
import type { AssistantMessage, ProviderAdapter, ProviderGenerationSnapshot } from "./providers";
import { ensureProviderComposerReady } from "./providerRuntime";
import { ReplyWatcher } from "./replyWatcher";
import { loadSettings, loadState } from "./storage";
import { waitFor } from "../utils/events";

export interface FanoutRunResult {
  text?: string;
  error?: string;
}

export function isNewAssistantMessageCandidate(
  baselineSnapshot: ProviderGenerationSnapshot,
  baselineMessage: AssistantMessage | null,
  snapshot: ProviderGenerationSnapshot,
  candidate: AssistantMessage
): boolean {
  return (
    snapshot.assistantMessageCount > baselineSnapshot.assistantMessageCount ||
    snapshot.assistantTextLength > baselineSnapshot.assistantTextLength ||
    snapshot.assistantMediaCount > baselineSnapshot.assistantMediaCount ||
    snapshot.assistantSignature !== baselineSnapshot.assistantSignature ||
    candidate.text !== baselineMessage?.text
  );
}

async function waitForNewAssistantMessage(
  provider: ProviderAdapter,
  baselineSnapshot: ProviderGenerationSnapshot,
  baselineMessage: AssistantMessage | null,
  timeoutMs: number
): Promise<AssistantMessage | null> {
  return await waitFor(() => {
    const snapshot = provider.getGenerationSnapshot();
    const candidate = provider.getLastAssistantMessage();
    if (!candidate?.text) {
      return null;
    }

    return isNewAssistantMessageCandidate(baselineSnapshot, baselineMessage, snapshot, candidate) ? candidate : null;
  }, { timeoutMs, intervalMs: 250 });
}

async function waitForProviderIdle(provider: ProviderAdapter, timeoutMs: number): Promise<boolean> {
  return Boolean(await waitFor(() => (
    !provider.findStopButton() && !provider.isGenerating()
  ) ? true : null, { timeoutMs, intervalMs: 250 }).catch(() => false));
}

async function waitForProviderComposer(provider: ProviderAdapter, timeoutMs: number): Promise<void> {
  const composerReady = await waitFor(() => provider.findComposer() ? true : null, {
    timeoutMs,
    intervalMs: 100
  });
  if (!composerReady) {
    throw new Error(`${provider.label} composer was not found. Open a ${provider.label} chat page and make sure the message box is visible.`);
  }
}

function normalizeSearchText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripReplyHeading(line: string): string {
  return line
    .replace(/^claude responded:\s*/i, "")
    .replace(/^chatgpt\s*(?:said|says|说)[:：]?\s*/i, "")
    .replace(/^gemini\s*(?:said|says|说)[:：]?\s*/i, "")
    .replace(/^assistant\s*(?:said|says|说)[:：]?\s*/i, "")
    .trim();
}

function isPromptEchoNoiseLine(line: string): boolean {
  const normalized = normalizeSearchText(line).toLowerCase();
  return (
    !normalized ||
    normalized === "you said" ||
    normalized.startsWith("you said:") ||
    normalized === "\u4f60\u8bf4" ||
    normalized.startsWith("\u4f60\u8bf4 ") ||
    normalized === "chatgpt \u8bf4" ||
    normalized === "gemini \u8bf4" ||
    normalized === "claude \u8bf4" ||
    normalized === "chatgpt says" ||
    normalized === "gemini says" ||
    normalized === "claude says" ||
    normalized === "defining the output"
  );
}

function isPromptEchoStopLine(line: string): boolean {
  const normalized = normalizeSearchText(line).toLowerCase();
  return (
    normalized === "promptqueue" ||
    normalized.includes("input box") ||
    normalized.includes("send button") ||
    normalized.includes("stop button") ||
    normalized.includes("write your prompt") ||
    normalized.includes("ask chatgpt") ||
    normalized.includes("ask gemini") ||
    normalized.includes("chatgpt can make mistakes") ||
    normalized.includes("gemini is a tool") ||
    normalized.includes("claude is ai") ||
    normalized.includes("\u8f93\u5165\u6846") ||
    normalized.includes("\u53d1\u9001\u6309\u94ae") ||
    normalized.includes("\u505c\u6b62\u6309\u94ae") ||
    normalized.includes("\u95ee\u95ee chatgpt") ||
    normalized.includes("\u95ee\u95ee gemini") ||
    normalized.includes("chatgpt \u53ef\u80fd\u4f1a\u51fa\u9519") ||
    normalized.includes("gemini \u662f\u4e00\u6b3e ai \u5de5\u5177")
  );
}

export function extractReplyTextAfterPromptEcho(pageText: string, prompt: string): string | null {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return null;
  }

  const promptIndex = pageText.lastIndexOf(trimmedPrompt);
  if (promptIndex < 0) {
    return null;
  }

  const followingLines = pageText
    .slice(promptIndex + trimmedPrompt.length)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of followingLines) {
    if (isPromptEchoStopLine(line)) {
      return null;
    }

    const stripped = stripReplyHeading(line);
    if (!stripped || isPromptEchoNoiseLine(stripped)) {
      continue;
    }
    if (normalizeSearchText(stripped) === normalizeSearchText(trimmedPrompt)) {
      continue;
    }

    return stripped;
  }

  return null;
}

function documentContainsPrompt(prompt: string): boolean {
  const normalizedPrompt = normalizeSearchText(prompt);
  if (!normalizedPrompt) {
    return false;
  }

  const pageText = normalizeSearchText(document.body.innerText ?? document.body.textContent ?? "");
  return pageText.includes(normalizedPrompt);
}

async function waitForPromptEcho(prompt: string, timeoutMs: number): Promise<boolean> {
  return Boolean(await waitFor(() => documentContainsPrompt(prompt) ? true : null, {
    timeoutMs,
    intervalMs: 250
  }).catch(() => false));
}

export function isPromptEchoFallbackCandidate(prompt: string, message: AssistantMessage | null): boolean {
  const candidateText = normalizeSearchText(message?.text ?? "");
  const promptText = normalizeSearchText(prompt);
  return Boolean(
    candidateText &&
    promptText &&
    candidateText !== promptText &&
    !candidateText.includes(promptText)
  );
}

async function waitForPromptEchoReply(
  provider: ProviderAdapter,
  prompt: string,
  timeoutMs: number
): Promise<AssistantMessage | null> {
  const promptEchoed = await waitForPromptEcho(prompt, Math.min(timeoutMs, 45_000));
  if (!promptEchoed || !await waitForProviderIdle(provider, Math.min(timeoutMs, 60_000))) {
    return null;
  }

  const echoedReplyText = extractReplyTextAfterPromptEcho(
    document.body.innerText ?? document.body.textContent ?? "",
    prompt
  );
  if (echoedReplyText) {
    return { text: echoedReplyText };
  }

  const promptEchoFallbackMessage = provider.getLastAssistantMessage();
  return isPromptEchoFallbackCandidate(prompt, promptEchoFallbackMessage) ? promptEchoFallbackMessage : null;
}

/**
 * Sends a single one-off prompt on the current page and waits for the reply,
 * independent of the shared queue (used by cross-provider fan-out). Never
 * writes to the shared QueueState so it cannot race with a real queue run.
 */
export async function runFanoutPrompt(prompt: string): Promise<FanoutRunResult> {
  const state = await loadState();
  if (state.isRunning) {
    return { error: "A queue is already running in this tab. Pause it before using fan-out." };
  }

  const settings = await loadSettings();
  const provider = getCurrentProvider();

  try {
    await waitForProviderComposer(provider, 10_000);
    await provider.setComposerText(prompt);
    await ensureProviderComposerReady(provider);
    const baselineSnapshot = provider.getGenerationSnapshot();
    const baselineMessage = provider.getLastAssistantMessage();
    await provider.clickSend();
    const fanoutMaxWaitMs = Math.min(settings.maxWaitMs, 120_000);
    const promptEchoReplyPromise = waitForPromptEchoReply(provider, prompt, fanoutMaxWaitMs).catch(() => null);

    const watcher = new ReplyWatcher({
      stableDelayMs: settings.stableDelayMs,
      maxWaitMs: fanoutMaxWaitMs,
      requireStart: true,
      baselineSnapshot
    });
    let watcherErrorMessage = "";
    const watcherPromise = watcher.waitUntilComplete().catch((error) => {
      watcherErrorMessage = error instanceof Error ? error.message : String(error);
    });
    const earlyMessage = await Promise.race([
      waitForNewAssistantMessage(
        provider,
        baselineSnapshot,
        baselineMessage,
        Math.min(fanoutMaxWaitMs, 60_000)
      ).catch(() => null),
      promptEchoReplyPromise,
      watcherPromise.then(() => null)
    ]);
    if (earlyMessage?.text && await waitForProviderIdle(provider, Math.min(fanoutMaxWaitMs, 60_000))) {
      return { text: provider.getLastAssistantMessage()?.text ?? earlyMessage.text };
    }
    await watcherPromise;

    if (provider.findStopButton()) {
      return { error: "Reply did not finish cleanly." };
    }

    const message = await waitForNewAssistantMessage(
      provider,
      baselineSnapshot,
      baselineMessage,
      watcherErrorMessage ? Math.min(fanoutMaxWaitMs, 60_000) : 10_000
    );
    if (message?.text) {
      return { text: message.text };
    }
    const promptEchoReply = await promptEchoReplyPromise;
    if (promptEchoReply?.text) {
      return { text: promptEchoReply.text };
    }

    return { error: watcherErrorMessage || "Could not read the reply text." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
