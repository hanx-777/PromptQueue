export type FanoutResultStatus = "pending" | "done" | "error";

export interface FanoutResult {
  provider: string;
  status: FanoutResultStatus;
  text?: string;
  error?: string;
}

const STANDARD_FANOUT_PROVIDERS = ["ChatGPT", "Gemini", "Claude"];

export interface FanoutResultSummary {
  total: number;
  pending: number;
  done: number;
  error: number;
  running: boolean;
}

export function createFanoutResultRows(providers: string[], missingProviderMessage: string): FanoutResult[] {
  const openProviders = new Set(providers);
  const orderedProviders = [
    ...STANDARD_FANOUT_PROVIDERS,
    ...providers.filter((provider) => !STANDARD_FANOUT_PROVIDERS.includes(provider))
  ];

  return orderedProviders.map((provider) => (
    openProviders.has(provider)
      ? { provider, status: "pending" }
      : { provider, status: "error", error: missingProviderMessage }
  ));
}

export function summarizeFanoutResults(results: FanoutResult[]): FanoutResultSummary {
  const summary = results.reduce<FanoutResultSummary>((current, result) => {
    current.total += 1;
    current[result.status] += 1;
    return current;
  }, {
    total: 0,
    pending: 0,
    done: 0,
    error: 0,
    running: false
  });

  return {
    ...summary,
    running: summary.pending > 0
  };
}
