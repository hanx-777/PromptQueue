import { createDomProvider } from "./domAdapterFactory";

export const chatgptProvider = createDomProvider({
  id: "chatgpt",
  label: "ChatGPT",
  hostnames: ["chatgpt.com", "chat.openai.com"],
  composerSelectors: [
    "form textarea",
    "form div[contenteditable='true']",
    "form [contenteditable]",
    "textarea",
    "div[contenteditable='true']",
    "[contenteditable]",
    "[role='textbox']",
    "[data-testid*='composer' i] textarea",
    "[data-testid*='composer' i] div[contenteditable='true']",
    "[data-testid*='composer' i] [contenteditable]",
    "[data-testid*='prompt' i] textarea",
    "[data-testid*='prompt' i] div[contenteditable='true']",
    "[data-testid*='prompt' i] [contenteditable]",
    "[data-testid*='composer' i]",
    "[data-testid*='prompt' i]"
  ],
  sendButtonSelectors: [
    "button[aria-label*='send' i]",
    "button[data-testid*='send' i]",
    "form button[type='submit']",
    "[data-testid*='send' i] button"
  ],
  stopButtonSelectors: [
    "button[aria-label*='stop' i]",
    "button[data-testid*='stop' i]",
    "[data-testid*='stop' i] button",
    "button[aria-label*='\u505c\u6b62' i]",
    "button[data-testid*='\u505c\u6b62' i]"
  ],
  sendPositiveWords: ["send", "\u53d1\u9001"],
  stopPositiveWords: ["stop", "\u505c\u6b62"],
  notSendWords: ["attach", "upload", "file", "voice", "voice mode", "microphone", "mic", "dictate", "dictation", "tool", "search", "model", "mode", "selector", "pro", "flash", "stop", "\u4e0a\u4f20", "\u9644\u4ef6", "\u5de5\u5177", "\u6a21\u5f0f", "\u6a21\u578b", "\u9009\u62e9\u5668", "\u6587\u4ef6", "\u8bed\u97f3", "\u8bed\u97f3\u6a21\u5f0f", "\u542c\u5199", "\u9ea6\u514b\u98ce", "\u641c\u7d22", "\u505c\u6b62"],
  mainSelectors: ["main", "[role='main']"],
  modelButtonSelectors: [
    "button[data-testid*='model' i]",
    "button[aria-label*='model' i]",
    "button[aria-label*='GPT' i]",
    "[data-testid*='model' i] button"
  ],
  modelOptionSelectors: [
    "[role='menuitem']",
    "[role='option']",
    "[data-testid*='model' i]",
    "button"
  ],
  modelButtonWords: ["model", "gpt", "chatgpt", "\u6a21\u578b"],
  modelOptionWords: ["gpt", "o3", "o4", "model", "\u6a21\u578b"],
  assistantSelectors: [
    "[data-message-author-role='assistant']",
    "[data-testid*='conversation-turn' i]",
    "article"
  ],
  generatingSelectors: [
    "button[aria-label*='stop' i]",
    "button[data-testid*='stop' i]",
    "[aria-busy='true']",
    "[role='progressbar']"
  ],
  generatingWords: ["stop", "generating", "creating", "thinking", "loading", "\u505c\u6b62", "\u751f\u6210", "\u521b\u5efa", "\u601d\u8003", "\u52a0\u8f7d"],
  pendingMediaSelectors: [
    "[aria-busy='true']",
    "[role='progressbar']",
    "progress"
  ],
  pendingMediaWords: ["generating", "creating", "loading", "drawing", "\u751f\u6210", "\u521b\u5efa", "\u52a0\u8f7d"],
  composerError: "ChatGPT composer was not found. Open a ChatGPT chat page and make sure the message box is visible.",
  sendError: "ChatGPT send button was not found or is disabled after filling the composer."
});
