import type { QueueTask } from "../content/types";

export function getDoneTasks(tasks: QueueTask[]): QueueTask[] {
  return tasks.filter((task) => task.status === "done");
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString();
}

export function formatTaskResultsMarkdown(tasks: QueueTask[]): string {
  const doneTasks = getDoneTasks(tasks);
  if (!doneTasks.length) {
    return "# PromptQueue Results\n\nNo completed results.";
  }

  const lines = ["# PromptQueue Results", ""];
  doneTasks.forEach((task, index) => {
    lines.push(`## ${index + 1}. ${formatTime(task.updatedAt)}`);
    lines.push("");
    lines.push("**Prompt:**");
    lines.push("");
    lines.push(task.prompt);
    lines.push("");
    lines.push("**Reply:**");
    lines.push("");
    lines.push(task.resultSummary?.trim() || "_(not captured)_");
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}
