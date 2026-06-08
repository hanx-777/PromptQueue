import type { QueueRunLogEntry, QueueState } from "../content/types";

export const MAX_RUN_LOG_ENTRIES = 100;

export function appendRunLogEntry(state: QueueState, entry: QueueRunLogEntry): QueueState {
  const runLog = [...(state.runLog ?? []), entry].slice(-MAX_RUN_LOG_ENTRIES);
  return {
    ...state,
    runLog
  };
}

function formatTime(value?: number): string {
  return value ? new Date(value).toLocaleString() : "-";
}

export function formatRunLogMarkdown(entries: QueueRunLogEntry[]): string {
  if (!entries.length) {
    return "# PromptQueue Run Log\n\nNo run log entries.";
  }

  const lines = ["# PromptQueue Run Log", ""];
  entries.forEach((entry, index) => {
    lines.push(`## ${index + 1}. ${entry.status.toUpperCase()} - ${entry.provider}`);
    lines.push(`- Task: ${entry.taskId}`);
    lines.push(`- Prompt: ${entry.promptPreview}`);
    lines.push(`- Attempts: ${entry.attemptCount}`);
    lines.push(`- Started: ${formatTime(entry.startedAt)}`);
    lines.push(`- Ended: ${formatTime(entry.endedAt)}`);
    if (entry.error) {
      lines.push(`- Error: ${entry.error}`);
    }
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}
