import { useState } from "react";
import type { Texts } from "../content/i18n";
import { DEFAULT_PROVIDER_MODELS, PROVIDER_LABELS, PROVIDER_MODEL_OPTIONS } from "../content/modelSettings";
import type { ProviderModelKey, ProviderModelPreference, QueueSettings } from "../content/types";
import { CloseIcon } from "./Icons";

interface SettingsPanelProps {
  settings: QueueSettings;
  texts: Texts;
  onChange: (settings: QueueSettings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, texts, onChange, onClose }: SettingsPanelProps): JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const providerModels = settings.providerModels ?? DEFAULT_PROVIDER_MODELS;
  const providerIds: ProviderModelKey[] = ["chatgpt", "gemini", "claude"];

  const update = <K extends keyof QueueSettings>(key: K, value: QueueSettings[K]): void => {
    onChange({ ...settings, [key]: value });
  };

  const updateProviderModel = (providerId: ProviderModelKey, preference: ProviderModelPreference): void => {
    update("providerModels", {
      ...providerModels,
      [providerId]: preference
    });
  };

  const selectProviderModel = (providerId: ProviderModelKey, value: string): void => {
    if (value === "auto-highest") {
      updateProviderModel(providerId, { mode: "auto-highest" });
      return;
    }

    if (value === "custom") {
      const previous = providerModels[providerId];
      updateProviderModel(providerId, {
        mode: "custom",
        customLabel: previous.mode === "custom" ? previous.customLabel : ""
      });
      return;
    }

    updateProviderModel(providerId, {
      mode: "preset",
      modelId: value.replace(/^preset:/, "")
    });
  };

  const providerSelectValue = (preference: ProviderModelPreference): string => {
    if (preference.mode === "preset" && preference.modelId) {
      return `preset:${preference.modelId}`;
    }
    return preference.mode;
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
        className="secondary settings-disclosure"
        onClick={() => setAdvancedOpen((value) => !value)}
      >
        {advancedOpen ? texts.hideAdvancedSettings : texts.advancedSettings}
      </button>

      {advancedOpen ? (
        <div className="advanced-settings">
          <div className="advanced-settings-title">
            <strong>{texts.modelDefaults}</strong>
            <span>{texts.modelSelectionHint}</span>
          </div>
          {providerIds.map((providerId) => {
            const preference = providerModels[providerId];
            return (
              <div className="provider-model-setting" key={providerId}>
                <label className="field">
                  <span>{PROVIDER_LABELS[providerId]}</span>
                  <select
                    value={providerSelectValue(preference)}
                    onChange={(event) => selectProviderModel(providerId, event.target.value)}
                  >
                    <option value="auto-highest">{texts.autoHighestModel}</option>
                    {PROVIDER_MODEL_OPTIONS[providerId].map((option) => (
                      <option key={option.id} value={`preset:${option.id}`}>
                        {option.label}
                      </option>
                    ))}
                    <option value="custom">{texts.customModelLabel}</option>
                  </select>
                </label>
                {preference.mode === "custom" ? (
                  <label className="field">
                    <span>{texts.customModelLabel}</span>
                    <input
                      type="text"
                      value={preference.customLabel ?? ""}
                      onChange={(event) => updateProviderModel(providerId, {
                        mode: "custom",
                        customLabel: event.target.value
                      })}
                      placeholder={texts.customModelPlaceholder}
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

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
