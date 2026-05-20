import { chatgptProvider } from "./chatgpt";
import { claudeProvider } from "./claude";
import { geminiProvider } from "./gemini";
import type { ProviderAdapter } from "./types";

export const SUPPORTED_PROVIDERS = [chatgptProvider, geminiProvider, claudeProvider] as const;

export function getCurrentProvider(hostname = window.location.hostname): ProviderAdapter {
  const normalized = hostname.toLowerCase();
  return (
    SUPPORTED_PROVIDERS.find((provider) => (
      provider.hostnames.some((host) => normalized === host || normalized.endsWith(`.${host}`))
    )) ?? chatgptProvider
  );
}

export function getCurrentProviderLabel(): string {
  return getCurrentProvider().label;
}

export type { ProviderAdapter, ProviderId } from "./types";
