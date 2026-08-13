import type { Texts } from "../content/i18n";
import type { QueueSettings } from "../content/types";

interface SteerBoxProps {
  settings: QueueSettings;
  texts: Texts;
  busy: boolean;
  prompt: string;
  onSettingsChange: (settings: QueueSettings) => void;
  onInsertNext: (prompt: string) => Promise<void>;
  onStopAndSteer: (prompt: string) => Promise<void>;
  onConsumed: () => void;
}

export function SteerBox({
  settings,
  texts,
  busy,
  prompt,
  onSettingsChange,
  onInsertNext,
  onStopAndSteer,
  onConsumed
}: SteerBoxProps): JSX.Element {
  const buildPrompt = (): string => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return "";
    }
    return settings.appendContextMode ? `${texts.steerAppendPrefix}\n\n${trimmed}` : trimmed;
  };

  const insert = async (): Promise<void> => {
    const built = buildPrompt();
    if (!built) {
      return;
    }
    await onInsertNext(built);
    onConsumed();
  };

  const stopAndSteer = async (): Promise<void> => {
    const built = buildPrompt();
    if (!built) {
      return;
    }
    await onStopAndSteer(built);
    onConsumed();
  };

  return (
    <div className="steer-actions" aria-label={texts.steerTitle}>
      <label className="mini-toggle">
        <input
          type="checkbox"
          checked={settings.appendContextMode}
          onChange={(event) => onSettingsChange({ ...settings, appendContextMode: event.target.checked })}
        />
        <span>{texts.appendContext}</span>
      </label>
      <div className="control-grid two">
        <button type="button" className="warning" onClick={() => void stopAndSteer()} disabled={busy || !prompt.trim()}>
          {texts.stopAndSteer}
        </button>
        <button type="button" onClick={() => void insert()} disabled={busy || !prompt.trim()}>
          {texts.insertAsNext}
        </button>
      </div>
    </div>
  );
}
