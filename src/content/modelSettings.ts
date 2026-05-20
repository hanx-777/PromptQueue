import type { ProviderModelKey, ProviderModelPreference, ProviderModelSettings } from "./types";

export interface ProviderModelOption {
  id: string;
  label: string;
  aliases: string[];
}

export interface ModelSelectionTarget {
  label: string;
  matchers: string[];
  allowFirstCredible: boolean;
}

export const PROVIDER_LABELS: Record<ProviderModelKey, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude"
};

export const DEFAULT_PROVIDER_MODELS: ProviderModelSettings = {
  chatgpt: { mode: "auto-highest" },
  gemini: { mode: "auto-highest" },
  claude: { mode: "auto-highest" }
};

export const PROVIDER_MODEL_OPTIONS: Record<ProviderModelKey, ProviderModelOption[]> = {
  chatgpt: [
    { id: "gpt-5", label: "GPT-5", aliases: ["gpt-5", "gpt 5"] },
    { id: "gpt-4o", label: "GPT-4o", aliases: ["gpt-4o", "gpt 4o"] },
    { id: "o3", label: "o3", aliases: ["o3"] }
  ],
  gemini: [
    { id: "gemini-pro", label: "Gemini Pro", aliases: ["gemini pro", "pro"] },
    { id: "gemini-flash", label: "Gemini Flash", aliases: ["gemini flash", "flash"] },
    { id: "gemini-advanced", label: "Gemini Advanced", aliases: ["gemini advanced", "advanced"] }
  ],
  claude: [
    { id: "claude-opus", label: "Claude Opus", aliases: ["claude opus", "opus"] },
    { id: "claude-sonnet", label: "Claude Sonnet", aliases: ["claude sonnet", "sonnet"] },
    { id: "claude-haiku", label: "Claude Haiku", aliases: ["claude haiku", "haiku"] }
  ]
};

const AUTO_HIGHEST_ALIASES: Record<ProviderModelKey, string[]> = {
  chatgpt: ["gpt-5", "gpt 5", "gpt-4.5", "gpt 4.5", "o3", "gpt-4o", "gpt 4o"],
  gemini: ["gemini 3 pro", "gemini 2.5 pro", "gemini advanced", "gemini pro", "pro"],
  claude: ["opus", "sonnet 4.5", "sonnet 4", "sonnet", "claude 4"]
};

export function normalizeProviderModelPreference(value: unknown): ProviderModelPreference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { mode: "auto-highest" };
  }

  const record = value as Record<string, unknown>;
  if (record.mode === "preset") {
    const modelId = typeof record.modelId === "string" ? record.modelId.trim() : "";
    return modelId ? { mode: "preset", modelId } : { mode: "auto-highest" };
  }

  if (record.mode === "custom") {
    const customLabel = typeof record.customLabel === "string" ? record.customLabel.trim() : "";
    return { mode: "custom", customLabel };
  }

  return { mode: "auto-highest" };
}

export function normalizeProviderModels(value: unknown): ProviderModelSettings {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    chatgpt: normalizeProviderModelPreference(record.chatgpt),
    gemini: normalizeProviderModelPreference(record.gemini),
    claude: normalizeProviderModelPreference(record.claude)
  };
}

export function getProviderModelPreference(
  settings: { providerModels?: ProviderModelSettings },
  providerId: string
): ProviderModelPreference {
  if (providerId !== "chatgpt" && providerId !== "gemini" && providerId !== "claude") {
    return { mode: "auto-highest" };
  }

  return settings.providerModels?.[providerId] ?? DEFAULT_PROVIDER_MODELS[providerId];
}

export function resolveModelSelectionTarget(
  providerId: ProviderModelKey,
  preference: ProviderModelPreference
): ModelSelectionTarget | null {
  if (preference.mode === "custom") {
    const label = preference.customLabel?.trim();
    return label
      ? { label, matchers: [label], allowFirstCredible: false }
      : null;
  }

  if (preference.mode === "preset") {
    const option = PROVIDER_MODEL_OPTIONS[providerId].find((item) => item.id === preference.modelId);
    return option
      ? { label: option.label, matchers: [option.label, ...option.aliases], allowFirstCredible: false }
      : null;
  }

  return {
    label: "auto-highest",
    matchers: AUTO_HIGHEST_ALIASES[providerId],
    allowFirstCredible: true
  };
}
