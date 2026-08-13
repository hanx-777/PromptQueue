import { useMemo, useState } from "react";
import type { Texts } from "../content/i18n";
import { DEFAULT_PROVIDER_MODELS, PROVIDER_LABELS, PROVIDER_MODEL_OPTIONS } from "../content/modelSettings";
import type { ProviderModelKey, ProviderModelPreference, QueueSettings } from "../content/types";
import { CloseIcon } from "./Icons";
import { uploadBackup, downloadBackup } from "../content/sync/googleDrive";
import { loadWorkflows, saveWorkflows, saveSettings } from "../content/storage";

interface SettingsPanelProps {
  settings: QueueSettings;
  texts: Texts;
  onChange: (settings: QueueSettings) => void;
  onClose: () => void;
}

const GOOGLE_OAUTH_CLIENT_ID_PLACEHOLDER = "YOUR_GOOGLE_OAUTH_CLIENT_ID";
const GITHUB_REPO_URL = "https://github.com/hanx-777/PromptQueue";
const KOFI_URL = "https://ko-fi.com/hanx1221";

function isGoogleDriveSyncConfigured(): boolean {
  try {
    const manifest = chrome.runtime.getManifest() as chrome.runtime.Manifest & { oauth2?: { client_id?: string } };
    const clientId = manifest.oauth2?.client_id;
    return Boolean(clientId) && clientId !== GOOGLE_OAUTH_CLIENT_ID_PLACEHOLDER;
  } catch {
    return false;
  }
}

async function ensureIdentityPermission(): Promise<boolean> {
  const granted = await chrome.permissions.contains({ permissions: ["identity"] });
  if (granted) {
    return true;
  }
  return chrome.permissions.request({ permissions: ["identity"] });
}

export function SettingsPanel({ settings, texts, onChange, onClose }: SettingsPanelProps): JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState<string>("");
  const providerModels = settings.providerModels ?? DEFAULT_PROVIDER_MODELS;
  const providerIds: ProviderModelKey[] = ["chatgpt", "gemini", "claude"];
  const syncConfigured = isGoogleDriveSyncConfigured();
  const donateImageUrl = useMemo(() => {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL("assets/donate-wechat.jpg");
    }
    return "";
  }, []);

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

  const handleBackup = async () => {
    try {
      const permitted = await ensureIdentityPermission();
      if (!permitted) {
        setSyncStatus("error");
        setSyncMessage(texts.syncPermissionDenied);
        return;
      }
      setSyncStatus("syncing");
      setSyncMessage(texts.syncUploading);
      const workflows = await loadWorkflows();
      await uploadBackup({ settings, workflows });
      setSyncStatus("success");
      setSyncMessage(texts.syncBackupSuccess);
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch (e: any) {
      setSyncStatus("error");
      setSyncMessage(e.message || texts.syncBackupButton);
    }
  };

  const handleRestore = async () => {
    try {
      const permitted = await ensureIdentityPermission();
      if (!permitted) {
        setSyncStatus("error");
        setSyncMessage(texts.syncPermissionDenied);
        return;
      }
      setSyncStatus("syncing");
      setSyncMessage(texts.syncDownloading);
      const data = await downloadBackup();
      if (!data) {
        throw new Error(texts.syncNoBackupFound);
      }
      if (data.settings) {
        await saveSettings(data.settings);
        onChange(data.settings);
      }
      if (data.workflows) {
        await saveWorkflows(data.workflows);
      }
      setSyncStatus("success");
      setSyncMessage(texts.syncRestoreSuccess);
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch (e: any) {
      setSyncStatus("error");
      setSyncMessage(e.message || texts.syncRestoreButton);
    }
  };

  return (
    <section className="settings-panel" aria-label={texts.settings}>
      <div className="section-title-row">
        <h2>{texts.settings}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={texts.closeSettings}>
          <CloseIcon />
        </button>
      </div>

      <div className="settings-group" aria-label={texts.settingsGroupBasic}>
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

        <label className="setting-row">
          <span>{texts.notifyOnQueueComplete}</span>
          <input
            type="checkbox"
            checked={settings.notifyOnQueueComplete}
            onChange={(event) => update("notifyOnQueueComplete", event.target.checked)}
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
            <option value="page">{texts.system}</option>
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
      </div>

      <button
        type="button"
        className="secondary settings-disclosure"
        onClick={() => setAdvancedOpen((value) => !value)}
        aria-expanded={advancedOpen}
      >
        {advancedOpen ? texts.hideAdvancedSettings : texts.advancedSettings}
      </button>

      {advancedOpen ? (
        <div className="advanced-settings">
          <div className="settings-group" aria-label={texts.settingsGroupExecution}>
            <div className="advanced-settings-title">
              <strong>{texts.settingsGroupExecution}</strong>
              <span>{texts.settingsGroupExecutionHint}</span>
            </div>

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
              <span className="field-hint">{texts.stableDelayMsHint}</span>
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
              <span className="field-hint">{texts.maxWaitMsHint}</span>
            </label>

            <label className="setting-row">
              <span>{texts.autoRetryEnabled}</span>
              <input
                type="checkbox"
                checked={settings.autoRetryEnabled}
                onChange={(event) => update("autoRetryEnabled", event.target.checked)}
              />
            </label>

            <label className="field">
              <span>{texts.maxAutoRetries}</span>
              <input
                type="number"
                min={0}
                max={5}
                step={1}
                value={settings.maxAutoRetries}
                onChange={(event) => update("maxAutoRetries", Number(event.target.value))}
                disabled={!settings.autoRetryEnabled}
              />
            </label>

            <label className="field">
              <span>{texts.retryDelayMs}</span>
              <input
                type="number"
                min={500}
                max={60000}
                step={500}
                value={settings.retryDelayMs}
                onChange={(event) => update("retryDelayMs", Number(event.target.value))}
                disabled={!settings.autoRetryEnabled}
              />
              <span className="field-hint">{texts.retryDelayMsHint}</span>
            </label>

            <label className="setting-row">
              <span>{texts.rateLimitWarningEnabled}</span>
              <input
                type="checkbox"
                checked={settings.rateLimitWarningEnabled}
                onChange={(event) => update("rateLimitWarningEnabled", event.target.checked)}
              />
            </label>
          </div>

          <div className="settings-group" aria-label={texts.settingsGroupModels}>
            <div className="advanced-settings-title">
              <strong>{texts.settingsGroupModels}</strong>
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

          <div className="settings-group" aria-label={texts.settingsGroupData}>
            <div className="advanced-settings-title">
              <strong>{texts.settingsGroupData}</strong>
            </div>

            <label className="setting-row">
              <span>{texts.captureReplies}</span>
              <input
                type="checkbox"
                checked={settings.captureReplies}
                onChange={(event) => update("captureReplies", event.target.checked)}
              />
            </label>
            <span className="field-hint">{texts.captureRepliesHint}</span>

            <div className="sync-card">
              <div className="advanced-settings-title">
                <strong>
                  {texts.syncSectionTitle}
                  <span className="badge badge-experimental">{texts.syncExperimentalBadge}</span>
                </strong>
                <span>{texts.syncExperimentalHint}</span>
                {!syncConfigured ? <span className="field-hint">{texts.syncNotConfiguredHint}</span> : null}
              </div>
              <div className="sync-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={handleBackup}
                  disabled={!syncConfigured || syncStatus === "syncing"}
                >
                  {texts.syncBackupButton}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={handleRestore}
                  disabled={!syncConfigured || syncStatus === "syncing"}
                >
                  {texts.syncRestoreButton}
                </button>
              </div>
              {syncStatus !== "idle" ? (
                <div className={`sync-status sync-status-${syncStatus}`}>{syncMessage}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="secondary"
        onClick={() => update("panelWidth", 380)}
      >
        {texts.resetWidth}
      </button>

      <div className="settings-support-footer" aria-label={texts.navSupport}>
        <div className="donate-card expanded">
          <div className="donate-copy">
            <strong>{texts.supportTitle}</strong>
            <span>{texts.supportBody}</span>
          </div>
          <a
            className="github-star-link"
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
          >
            {texts.githubStar}
          </a>
          <a
            className="github-star-link kofi-link"
            href={KOFI_URL}
            target="_blank"
            rel="noreferrer"
          >
            {texts.koFiSupport}
          </a>
          {donateImageUrl ? (
            <img src={donateImageUrl} alt={texts.wechatPayAlt} loading="lazy" />
          ) : null}
        </div>
      </div>
    </section>
  );
}
