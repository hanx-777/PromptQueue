import type { QueueWorkflow, WorkflowMessage } from "./types";

export interface BuiltInWorkflowTemplate {
  id: string;
  name: string;
  description: string;
  messages: string[];
}

export const BUILT_IN_WORKFLOW_TEMPLATES: BuiltInWorkflowTemplate[] = [
  {
    id: "academic-polish",
    name: "Academic Polish",
    description: "Polish academic writing and summarize revision decisions.",
    messages: [
      "Please polish this {{language}} academic text about {{topic}} for clarity, logic, and concision. Keep the original meaning.\n\nText:\n{{text}}",
      "List the most important revisions you made for {{topic}}, grouped by clarity, structure, terminology, and remaining risks."
    ]
  },
  {
    id: "code-review",
    name: "Code Review",
    description: "Review code with a specific focus and produce actionable findings.",
    messages: [
      "Review the following {{language}} code. Focus on {{focus}}. Prioritize correctness, edge cases, and maintainability.\n\nCode:\n{{code}}",
      "Turn the review into a concise checklist of fixes, ordered by severity."
    ]
  },
  {
    id: "translate",
    name: "Translate",
    description: "Translate text and explain important wording choices.",
    messages: [
      "Translate the following text from {{source_language}} to {{target_language}}. Preserve tone and formatting.\n\nText:\n{{text}}",
      "Explain any wording choices that may affect nuance, formality, or technical accuracy."
    ]
  },
  {
    id: "product-copy",
    name: "Product Copy",
    description: "Draft product copy for a specific audience and tone.",
    messages: [
      "Write product copy for {{product}}. Audience: {{audience}}. Tone: {{tone}}. Include a headline, short description, and three benefit bullets.",
      "Create three alternative headlines for {{product}} and explain which one is strongest."
    ]
  },
  {
    id: "long-summary",
    name: "Long Summary",
    description: "Summarize long material into a requested structure.",
    messages: [
      "Summarize this material about {{topic}} in {{format}} format. Keep key evidence, caveats, and action items.\n\nMaterial:\n{{text}}",
      "Extract follow-up questions and unresolved assumptions from the {{topic}} material."
    ]
  }
];

function createId(timestamp: number): string {
  return `${timestamp}-${Math.random().toString(36).slice(2)}`;
}

function uniqueName(baseName: string, existingNames: string[]): string {
  const names = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  if (!names.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (names.has(`${baseName} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
}

function makeMessage(prompt: string, timestamp: number): WorkflowMessage {
  return {
    id: createId(timestamp),
    prompt,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createWorkflowFromTemplate(
  template: BuiltInWorkflowTemplate,
  existingNames: string[],
  timestamp = Date.now()
): QueueWorkflow {
  return {
    id: createId(timestamp),
    name: uniqueName(template.name, existingNames),
    messages: template.messages.map((prompt) => makeMessage(prompt, timestamp)),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
