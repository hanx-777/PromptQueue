import { createDomProvider } from "./domAdapterFactory";

export const claudeProvider = createDomProvider({
  id: "claude",
  label: "Claude",
  hostnames: ["claude.ai"],
  composerSelectors: [
    "div[contenteditable='true'][role='textbox']",
    "[contenteditable='true'][data-testid*='input' i]",
    "[contenteditable='true'][data-testid*='composer' i]",
    "[aria-label*='message' i][contenteditable='true']",
    "[aria-label*='prompt' i][contenteditable='true']",
    "textarea",
    "div[contenteditable='true']",
    "[role='textbox']"
  ],
  sendButtonSelectors: [
    "button[aria-label*='send' i]",
    "button[data-testid*='send' i]",
    "button[data-testid*='submit' i]",
    "button[type='submit']"
  ],
  stopButtonSelectors: [
    "button[aria-label*='stop' i]",
    "button[aria-label*='cancel' i]",
    "button[data-testid*='stop' i]"
  ],
  sendPositiveWords: ["send", "submit", "\u53d1\u9001"],
  stopPositiveWords: ["stop", "cancel", "\u505c\u6b62", "\u53d6\u6d88"],
  notSendWords: ["attach", "upload", "file", "image", "mic", "microphone", "voice", "stop", "cancel", "\u505c\u6b62", "\u53d6\u6d88"],
  mainSelectors: ["main", "[role='main']", "[data-testid*='chat' i]"],
  modelButtonSelectors: [
    "button[aria-label*='model' i]",
    "button[aria-label*='Claude' i]",
    "button[data-testid*='model' i]",
    "button[data-testid*='selector' i]"
  ],
  modelOptionSelectors: [
    "[role='menuitem']",
    "[role='option']",
    "button"
  ],
  modelButtonWords: ["model", "claude", "opus", "sonnet", "haiku", "\u6a21\u578b"],
  modelOptionWords: ["claude", "opus", "sonnet", "haiku", "\u6a21\u578b"],
  assistantSelectors: [
    "[data-testid*='assistant' i]",
    "[data-is-streaming]",
    "article",
    "[role='article']"
  ],
  generatingSelectors: [
    "button[aria-label*='stop' i]",
    "button[aria-label*='cancel' i]",
    "[data-is-streaming='true']",
    "[aria-busy='true']",
    "[role='progressbar']"
  ],
  generatingWords: ["stop", "cancel", "generating", "thinking", "loading", "\u505c\u6b62", "\u53d6\u6d88", "\u751f\u6210", "\u601d\u8003", "\u52a0\u8f7d"],
  pendingMediaSelectors: [
    "[aria-busy='true']",
    "[role='progressbar']",
    "progress"
  ],
  pendingMediaWords: ["generating", "creating", "loading", "\u751f\u6210", "\u521b\u5efa", "\u52a0\u8f7d"],
  composerError: "Claude composer was not found. Open a Claude chat page and make sure the message box is visible.",
  sendError: "Claude send button was not found or is disabled after filling the composer."
});
