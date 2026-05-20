import { createDomProvider } from "./domAdapterFactory";

export const chatgptProvider = createDomProvider({
  id: "chatgpt",
  label: "ChatGPT",
  hostnames: ["chatgpt.com", "chat.openai.com"],
  composerSelectors: [
    "form textarea",
    "form div[contenteditable='true']",
    "textarea",
    "div[contenteditable='true']",
    "[role='textbox']",
    "[data-testid*='composer' i] textarea",
    "[data-testid*='composer' i] div[contenteditable='true']",
    "[data-testid*='prompt' i] textarea",
    "[data-testid*='prompt' i] div[contenteditable='true']",
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
  notSendWords: ["attach", "upload", "file", "voice", "microphone", "mic", "dictate", "tool", "search", "stop", "\u505c\u6b62"],
  mainSelectors: ["main", "[role='main']"],
  composerError: "ChatGPT composer was not found. Open a ChatGPT chat page and make sure the message box is visible.",
  sendError: "ChatGPT send button was not found or is disabled after filling the composer."
});
