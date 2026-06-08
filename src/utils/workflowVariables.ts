interface PromptLike {
  prompt: string;
}

export type WorkflowVariableValues = Record<string, string>;

const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

function normalizeVariableName(name: string): string {
  return name.trim();
}

function collectFromText(text: string, variables: string[], seen: Set<string>): void {
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const name = normalizeVariableName(match[1] ?? "");
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    variables.push(name);
  }
}

export function extractWorkflowVariables(input: string | PromptLike[]): string[] {
  const variables: string[] = [];
  const seen = new Set<string>();

  if (typeof input === "string") {
    collectFromText(input, variables, seen);
    return variables;
  }

  input.forEach((item) => collectFromText(item.prompt, variables, seen));
  return variables;
}

export function applyWorkflowVariables(prompt: string, values: WorkflowVariableValues): string {
  return prompt.replace(VARIABLE_PATTERN, (_match, rawName: string) => {
    const name = normalizeVariableName(rawName);
    const value = values[name];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Missing value for workflow variable: ${name}`);
    }
    return value;
  });
}

export function applyWorkflowVariablesToMessages<T extends PromptLike>(
  messages: T[],
  values: WorkflowVariableValues
): T[] {
  return messages.map((message) => ({
    ...message,
    prompt: applyWorkflowVariables(message.prompt, values)
  }));
}
