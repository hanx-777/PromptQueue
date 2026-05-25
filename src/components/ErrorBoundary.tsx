import React from "react";
import { getTexts, type Language } from "../content/i18n";
import { loadSettings, subscribeStorageChanges } from "../content/storage";

type ResolvedTheme = "light" | "dark";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  language: Language;
  theme: ResolvedTheme;
}

function detectSystemTheme(): ResolvedTheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export class ErrorBoundary extends React.Component<Props, State> {
  private unsubscribe: (() => void) | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
      language: "zh",
      theme: detectSystemTheme()
    };
  }

  static getDerivedStateFromError(error: Error): Pick<State, "hasError" | "message"> {
    return { hasError: true, message: error.message ?? "" };
  }

  componentDidCatch(error: Error): void {
    console.error("[PromptQueue] UI crashed:", error);
    void this.syncFromSettings();
    if (!this.unsubscribe) {
      this.unsubscribe = subscribeStorageChanges(() => {
        void this.syncFromSettings();
      });
    }
  }

  componentWillUnmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private async syncFromSettings(): Promise<void> {
    try {
      const settings = await loadSettings();
      const theme: ResolvedTheme = settings.theme === "page" ? detectSystemTheme() : settings.theme;
      this.setState({ language: settings.language, theme });
    } catch {
      // Settings unavailable; keep current language/theme defaults.
    }
  }

  private handleRetry = (): void => {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.setState({ hasError: false, message: "" });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const texts = getTexts(this.state.language);
      const detail = this.state.message.trim() || texts.errorFallbackMessage;

      return (
        <aside
          className={`queue-shell theme-${this.state.theme} error-fallback`}
          role="alert"
          aria-live="assertive"
        >
          <p className="error-fallback-title">{texts.errorTitle}</p>
          <p className="error-fallback-detail">{detail}</p>
          <div className="error-fallback-actions">
            <button type="button" onClick={this.handleRetry}>
              {texts.errorRetry}
            </button>
          </div>
        </aside>
      );
    }

    return this.props.children;
  }
}
