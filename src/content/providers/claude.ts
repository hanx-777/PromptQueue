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
  composerError: "Claude composer was not found. Open a Claude chat page and make sure the message box is visible.",
  sendError: "Claude send button was not found or is disabled after filling the composer."
});
