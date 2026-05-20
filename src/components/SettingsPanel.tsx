import type { Texts } from "../content/i18n";
import type { QueueSettings } from "../content/types";
import { CloseIcon } from "./Icons";

interface SettingsPanelProps {
  settings: QueueSettings;
  texts: Texts;
  onChange: (settings: QueueSettings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, texts, onChange, onClose }: SettingsPanelProps): JSX.Element {
  const update = <K extends keyof QueueSettings>(key: K, value: QueueSettings[K]): void => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <section className="settings-panel" aria-label={texts.settings}>
      <div className="section-title-row">
        <h2>{texts.settings}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={texts.closeSettings}>
          <CloseIcon />
        </button>
      </div>

      <label className="setting-row">
        <span>{texts.autoStartNext}</span>
        <input
          type="checkbox"
          checked={settings.autoStartNext}
          onChange={(event) => update("autoStartNext", event.target.checked)}
        />
      </label>

      <label className="setting-row">
        <span>{texts.appendContextMode}</span>
        <input
          type="checkbox"
          checked={settings.appendContextMode}
          onChange={(event) => update("appendContextMode", event.target.checked)}
        />
      </label>

      <label className="field">
        <span>{texts.stableDelayMs}</span>
        <input
          type="number"
          min={500}
          max={30000}
          step={250}
          value={settings.stableDelayMs}
          onChange={(event) => update("stableDelayMs", Number(event.target.value))}
        />
      </label>

      <label className="field">
        <span>{texts.maxWaitMs}</span>
        <input
          type="number"
          min={5000}
          max={3600000}
          step={5000}
          value={settings.maxWaitMs}
          onChange={(event) => update("maxWaitMs", Number(event.target.value))}
        />
      </label>

      <label className="field">
        <span>{texts.batchSeparator}</span>
        <input
          type="text"
          value={settings.batchSeparator}
          onChange={(event) => update("batchSeparator", event.target.value)}
        />
      </label>

      <label className="field">
        <span>{texts.theme}</span>
        <select
          value={settings.theme}
          onChange={(event) => update("theme", event.target.value as QueueSettings["theme"])}
        >
          <option value="system">{texts.system}</option>
          <option value="light">{texts.light}</option>
          <option value="dark">{texts.dark}</option>
        </select>
      </label>

      <label className="field">
        <span>{texts.language}</span>
        <select
          value={settings.language}
          onChange={(event) => update("language", event.target.value as QueueSettings["language"])}
        >
          <option value="zh">{texts.chinese}</option>
          <option value="en">{texts.english}</option>
        </select>
      </label>

      <button
        type="button"
        className="secondary"
        onClick={() => update("panelWidth", 380)}
      >
        {texts.resetWidth}
      </button>
    </section>
  );
}
