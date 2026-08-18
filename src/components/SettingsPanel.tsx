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
type SettingsPage = "general" | "advanced" | "support";

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
  const [activePage, setActivePage] = useState<SettingsPage>("general");
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState<string>("");
  const providerModels = settings.providerModels ?? DEFAULT_PROVIDER_MODELS;
  const providerIds: ProviderModelKey[] = ["chatgpt", "gemini", "claude"];
  const syncConfigured = isGoogleDriveSyncConfigured();
  const automationEnabledCount = [
    settings.autoStartNext,
    settings.appendContextMode,
    settings.notifyOnQueueComplete
  ].filter(Boolean).length;
  const automaticModelCount = providerIds.filter((providerId) => providerModels[providerId].mode === "auto-highest").length;
  const configuredModelCount = providerIds.length - automaticModelCount;
  const modelSummary = configuredModelCount
    ? `${configuredModelCount}/3 ${texts.settingsOverviewSpecified}`
    : `${automaticModelCount}/3 ${texts.settingsOverviewAutomatic}`;
  const settingsPages: Array<{ id: SettingsPage; label: string }> = [
    { id: "general", label: texts.settingsPageGeneral },
    { id: "advanced", label: texts.settingsPageAdvanced },
    { id: "support", label: texts.settingsPageSupport }
  ];
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
      <header className="settings-header">
        <div className="settings-header-copy">
          <h2>{texts.settings}</h2>
          <p>{texts.settingsIntro}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={texts.closeSettings}
          title={texts.closeSettings}
        >
          <CloseIcon />
        </button>
      </header>

      <nav className="settings-pagination" aria-label={texts.settingsPagination}>
        <div className="settings-page-list">
          {settingsPages.map((page, index) => (
            <button
              type="button"
              key={page.id}
              className="settings-page-button"
              onClick={() => setActivePage(page.id)}
              aria-current={activePage === page.id ? "page" : undefined}
            >
              <span aria-hidden="true">{index + 1}</span>
              <strong>{page.label}</strong>
            </button>
          ))}
        </div>
      </nav>

      <div className="settings-overview" aria-label={texts.settings}>
        <div className="settings-overview-item">
          <span>{texts.settingsOverviewAutomation}</span>
          <strong>{automationEnabledCount}/3 {texts.settingsOverviewEnabled}</strong>
        </div>
        <div className="settings-overview-item">
          <span>{texts.settingsOverviewModels}</span>
          <strong>{modelSummary}</strong>
        </div>
        <div className="settings-overview-item">
          <span>{texts.settingsOverviewData}</span>
          <strong>{settings.captureReplies ? texts.settingsOverviewCaptureOn : texts.settingsOverviewCaptureOff}</strong>
        </div>
      </div>

      <div className="settings-page-content">
        {activePage === "general" ? (
          <>
      <section className="settings-section" aria-labelledby="promptqueue-general-settings">
        <div className="settings-section-heading">
          <span className="settings-section-index" aria-hidden="true">01</span>
          <div>
            <h3 id="promptqueue-general-settings">{texts.settingsGroupBasic}</h3>
            <p>{texts.settingsGroupBasicHint}</p>
          </div>
        </div>

        <div className="settings-control-list">
          <label className="setting-row settings-toggle-row">
            <span>{texts.autoStartNext}</span>
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={settings.autoStartNext}
                onChange={(event) => update("autoStartNext", event.target.checked)}
              />
              <span className="settings-switch-track" aria-hidden="true"><span /></span>
            </span>
          </label>

          <label className="setting-row settings-toggle-row">
            <span>{texts.appendContextMode}</span>
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={settings.appendContextMode}
                onChange={(event) => update("appendContextMode", event.target.checked)}
              />
              <span className="settings-switch-track" aria-hidden="true"><span /></span>
            </span>
          </label>

          <label className="setting-row settings-toggle-row">
            <span>{texts.notifyOnQueueComplete}</span>
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={settings.notifyOnQueueComplete}
                onChange={(event) => update("notifyOnQueueComplete", event.target.checked)}
              />
              <span className="settings-switch-track" aria-hidden="true"><span /></span>
            </span>
          </label>
        </div>

        <div className="settings-basic-fields">
          <label className="field settings-code-field">
            <span>{texts.batchSeparator}</span>
            <input
              type="text"
              value={settings.batchSeparator}
              onChange={(event) => update("batchSeparator", event.target.value)}
            />
          </label>

          <fieldset className="settings-choice-field">
            <legend>{texts.theme}</legend>
            <div className="settings-choice-group" role="radiogroup" aria-label={texts.theme}>
              <label className="settings-choice">
                <input type="radio" name="promptqueue-theme" checked={settings.theme === "page"} onChange={() => update("theme", "page")} />
                <span>{texts.system}</span>
              </label>
              <label className="settings-choice">
                <input type="radio" name="promptqueue-theme" checked={settings.theme === "light"} onChange={() => update("theme", "light")} />
                <span>{texts.light}</span>
              </label>
              <label className="settings-choice">
                <input type="radio" name="promptqueue-theme" checked={settings.theme === "dark"} onChange={() => update("theme", "dark")} />
                <span>{texts.dark}</span>
              </label>
            </div>
          </fieldset>

          <fieldset className="settings-choice-field">
            <legend>{texts.language}</legend>
            <div className="settings-choice-group" role="radiogroup" aria-label={texts.language}>
              <label className="settings-choice">
                <input type="radio" name="promptqueue-language" checked={settings.language === "zh"} onChange={() => update("language", "zh")} />
                <span>{texts.chinese}</span>
              </label>
              <label className="settings-choice">
                <input type="radio" name="promptqueue-language" checked={settings.language === "en"} onChange={() => update("language", "en")} />
                <span>{texts.english}</span>
              </label>
            </div>
          </fieldset>
        </div>
      </section>

      <div className="settings-footer-actions">
        <button
          type="button"
          className="secondary settings-reset"
          onClick={() => update("panelWidth", 380)}
        >
          {texts.resetWidth}
        </button>
      </div>

          </>
        ) : null}

        {activePage === "advanced" ? (
          <>
      <div className="advanced-settings">
          <section className="settings-section settings-advanced-section" aria-labelledby="promptqueue-execution-settings">
            <div className="settings-section-heading">
              <span className="settings-section-index" aria-hidden="true">02</span>
              <div>
                <h3 id="promptqueue-execution-settings">{texts.settingsGroupExecution}</h3>
                <p>{texts.settingsGroupExecutionHint}</p>
              </div>
            </div>

            <div className="settings-field-grid">
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
            </div>

            <label className="setting-row">
              <span>{texts.autoRetryEnabled}</span>
              <input
                type="checkbox"
                checked={settings.autoRetryEnabled}
                onChange={(event) => update("autoRetryEnabled", event.target.checked)}
              />
            </label>

            <div className="settings-field-grid settings-dependent-fields" aria-disabled={!settings.autoRetryEnabled}>
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
            </div>

            <label className="setting-row">
              <span>{texts.rateLimitWarningEnabled}</span>
              <input
                type="checkbox"
                checked={settings.rateLimitWarningEnabled}
                onChange={(event) => update("rateLimitWarningEnabled", event.target.checked)}
              />
            </label>
          </section>

          <section className="settings-section settings-advanced-section" aria-labelledby="promptqueue-model-settings">
            <div className="settings-section-heading">
              <span className="settings-section-index" aria-hidden="true">03</span>
              <div>
                <h3 id="promptqueue-model-settings">{texts.settingsGroupModels}</h3>
                <p>{texts.modelSelectionHint}</p>
              </div>
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
          </section>

          <section className="settings-section settings-advanced-section" aria-labelledby="promptqueue-data-settings">
            <div className="settings-section-heading">
              <span className="settings-section-index" aria-hidden="true">04</span>
              <div>
                <h3 id="promptqueue-data-settings">{texts.settingsGroupData}</h3>
              </div>
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
          </section>
      </div>

          </>
        ) : null}

        {activePage === "support" ? (
          <>
      <section className="settings-support" aria-label={texts.navSupport}>
        <span className="settings-section-index" aria-hidden="true">05</span>
        <div className="settings-support-copy">
          <div className="donate-copy">
            <strong>{texts.supportTitle}</strong>
            <span>{texts.supportBody}</span>
          </div>
          <div className="settings-support-actions">
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
          </div>
        </div>
        {donateImageUrl ? <img src={donateImageUrl} alt={texts.wechatPayAlt} loading="lazy" /> : null}
      </section>
          </>
        ) : null}
      </div>

    </section>
  );
}
