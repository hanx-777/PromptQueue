import { useState } from "react";
import type { Texts } from "../content/i18n";
import type { QueueSettings } from "../content/types";

const APPEND_PREFIX = "请基于你刚才的回答继续调整：";

interface SteerBoxProps {
  settings: QueueSettings;
  texts: Texts;
  busy: boolean;
  onSettingsChange: (settings: QueueSettings) => void;
  onInsertNext: (prompt: string) => Promise<void>;
  onStopAndSteer: (prompt: string) => Promise<void>;
}

export function SteerBox({
  settings,
  texts,
  busy,
  onSettingsChange,
  onInsertNext,
  onStopAndSteer
}: SteerBoxProps): JSX.Element {
  const [steerPrompt, setSteerPrompt] = useState("");

  const buildPrompt = (): string => {
    const trimmed = steerPrompt.trim();
    if (!trimmed) {
      return "";
    }
    return settings.appendContextMode ? `${APPEND_PREFIX}\n\n${trimmed}` : trimmed;
  };

  const insert = async (): Promise<void> => {
    const prompt = buildPrompt();
    if (!prompt) {
      return;
    }
    await onInsertNext(prompt);
    setSteerPrompt("");
  };

  const stopAndSteer = async (): Promise<void> => {
    const prompt = buildPrompt();
    if (!prompt) {
      return;
    }
    await onStopAndSteer(prompt);
    setSteerPrompt("");
  };

  return (
    <section className="steer-box" aria-label={texts.steerTitle}>
      <div className="section-title-row">
        <h2>{texts.steerTitle}</h2>
        <label className="mini-toggle">
          <input
            type="checkbox"
            checked={settings.appendContextMode}
            onChange={(event) => onSettingsChange({ ...settings, appendContextMode: event.target.checked })}
          />
          <span>{texts.appendContext}</span>
        </label>
      </div>
      <textarea
        value={steerPrompt}
        onChange={(event) => setSteerPrompt(event.target.value)}
        placeholder={texts.steerPlaceholder}
        rows={3}
      />
      <div className="control-grid two">
        <button type="button" onClick={insert} disabled={busy || !steerPrompt.trim()}>
          {texts.insertAsNext}
        </button>
        <button type="button" className="warning" onClick={stopAndSteer} disabled={busy || !steerPrompt.trim()}>
          {texts.stopAndSteer}
        </button>
      </div>
    </section>
  );
}
