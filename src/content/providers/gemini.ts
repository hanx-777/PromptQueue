import { createDomProvider } from "./domAdapterFactory";

export const geminiProvider = createDomProvider({
  id: "gemini",
  label: "Gemini",
  hostnames: ["gemini.google.com"],
  composerSelectors: [
    "rich-textarea textarea",
    "rich-textarea div[contenteditable='true']",
    "rich-textarea [contenteditable='true']",
    "div[contenteditable='true'][role='textbox']",
    "[role='textbox'][contenteditable='true']",
    "[aria-label*='prompt' i]",
    "[aria-label*='message' i]",
    "textarea",
    "div[contenteditable='true']",
    "[role='textbox']"
  ],
  sendButtonSelectors: [
    "button[aria-label*='send' i]",
    "button[aria-label*='submit' i]",
    "button[data-testid*='send' i]",
    "button[data-test-id*='send' i]",
    "button[type='submit']"
  ],
  stopButtonSelectors: [
    "button[aria-label*='stop' i]",
    "button[aria-label*='cancel' i]",
    "button[data-testid*='stop' i]",
    "button[data-test-id*='stop' i]"
  ],
  sendPositiveWords: ["send", "submit", "\u53d1\u9001"],
  stopPositiveWords: ["stop", "cancel", "\u505c\u6b62", "\u53d6\u6d88"],
  notSendWords: ["attach", "upload", "image", "mic", "microphone", "voice", "tool", "stop", "cancel", "\u505c\u6b62", "\u53d6\u6d88"],
  mainSelectors: ["main", "[role='main']", "bard-sidenav-content", "chat-window"],
  composerError: "Gemini composer was not found. Open a Gemini chat page and make sure the message box is visible.",
  sendError: "Gemini send button was not found or is disabled after filling the composer."
});
