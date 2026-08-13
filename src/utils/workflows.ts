import type { QueueWorkflow, WorkflowMessage } from "../content/types";

function createId(timestamp: number): string {
  return `${timestamp}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeWorkflowTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tags: string[] = [];
  const seen = new Set<string>();
  value.forEach((item) => {
    if (typeof item !== "string") {
      return;
    }

    const tag = item.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) {
      return;
    }
    seen.add(key);
    tags.push(tag);
  });

  return tags;
}

export function getUniqueWorkflowName(name: string, existingNames: string[], suffixStyle: "parentheses" | "space" = "parentheses"): string {
  const baseName = name.trim() || "Untitled Workflow";
  const names = new Set(existingNames.map((item) => item.trim().toLowerCase()));
  if (!names.has(baseName.toLowerCase())) {
    return baseName;
  }

  let index = 2;
  const makeCandidate = (): string => suffixStyle === "space" ? `${baseName} ${index}` : `${baseName} (${index})`;
  let candidate = makeCandidate();
  while (names.has(candidate.toLowerCase())) {
    index += 1;
    candidate = makeCandidate();
  }
  return candidate;
}

function copyMessage(message: WorkflowMessage, timestamp: number): WorkflowMessage {
  return {
    id: createId(timestamp),
    prompt: message.prompt,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function copyWorkflow(
  workflow: QueueWorkflow,
  existingNames: string[],
  timestamp = Date.now()
): QueueWorkflow {
  return {
    id: createId(timestamp),
    name: getUniqueWorkflowName(workflow.name, existingNames),
    messages: workflow.messages.map((message) => copyMessage(message, timestamp)),
    tags: normalizeWorkflowTags(workflow.tags),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function filterWorkflows(
  workflows: QueueWorkflow[],
  filters: { query: string; tag: string }
): QueueWorkflow[] {
  const query = filters.query.trim().toLowerCase();
  const tag = filters.tag.trim().toLowerCase();

  return workflows.filter((workflow) => {
    const tags = normalizeWorkflowTags(workflow.tags);
    const matchesTag = !tag || tags.some((item) => item.toLowerCase() === tag);
    if (!matchesTag) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      workflow.name,
      tags.join(" "),
      ...workflow.messages.map((message) => message.prompt)
    ].join("\n").toLowerCase();
    return haystack.includes(query);
  });
}
