export type DiffPartType = "equal" | "insert" | "delete";
export type DiffLineType = DiffPartType | "replace";

export interface DiffPart {
  type: DiffPartType;
  text: string;
}

export interface DiffLine {
  type: DiffLineType;
  oldText: string;
  newText: string;
  oldParts: DiffPart[];
  newParts: DiffPart[];
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffStats {
  added: number;
  deleted: number;
  changed: number;
}

interface LineOperation {
  type: "equal" | "insert" | "delete";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface TokenOperation {
  type: DiffPartType;
  text: string;
}

const MAX_LCS_CELLS = 250_000;

function splitLines(text: string): string[] {
  return text.length ? text.replace(/\r\n/g, "\n").split("\n") : [];
}

function createPart(type: DiffPartType, text: string): DiffPart {
  return { type, text };
}

function mergeAdjacentParts(parts: DiffPart[]): DiffPart[] {
  return parts.reduce<DiffPart[]>((merged, part) => {
    if (!part.text) {
      return merged;
    }

    const previous = merged[merged.length - 1];
    if (previous?.type === part.type) {
      previous.text += part.text;
      return merged;
    }

    merged.push({ ...part });
    return merged;
  }, []);
}

function buildLcsTable<T>(left: T[], right: T[], equals: (left: T, right: T) => boolean): number[][] {
  const table = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex][rightIndex] = equals(left[leftIndex], right[rightIndex])
        ? table[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
    }
  }

  return table;
}

function exceedsLcsBudget(leftLength: number, rightLength: number): boolean {
  return leftLength > 0 && rightLength > 0 && leftLength * rightLength > MAX_LCS_CELLS;
}

function diffLinesByPosition(oldLines: string[], newLines: string[]): LineOperation[] {
  const operations: LineOperation[] = [];
  const maxLength = Math.max(oldLines.length, newLines.length);

  for (let index = 0; index < maxLength; index += 1) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];
    if (oldLine !== undefined && newLine !== undefined) {
      if (oldLine === newLine) {
        operations.push({
          type: "equal",
          text: oldLine,
          oldLineNumber: index + 1,
          newLineNumber: index + 1
        });
      } else {
        operations.push({
          type: "delete",
          text: oldLine,
          oldLineNumber: index + 1
        });
        operations.push({
          type: "insert",
          text: newLine,
          newLineNumber: index + 1
        });
      }
      continue;
    }

    if (oldLine !== undefined) {
      operations.push({
        type: "delete",
        text: oldLine,
        oldLineNumber: index + 1
      });
    }
    if (newLine !== undefined) {
      operations.push({
        type: "insert",
        text: newLine,
        newLineNumber: index + 1
      });
    }
  }

  return operations;
}

function diffLines(oldLines: string[], newLines: string[]): LineOperation[] {
  if (exceedsLcsBudget(oldLines.length, newLines.length)) {
    return diffLinesByPosition(oldLines, newLines);
  }

  const table = buildLcsTable(oldLines, newLines, (oldLine, newLine) => oldLine === newLine);
  const operations: LineOperation[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      operations.push({
        type: "equal",
        text: oldLines[oldIndex],
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1
      });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1]) {
      operations.push({
        type: "delete",
        text: oldLines[oldIndex],
        oldLineNumber: oldIndex + 1
      });
      oldIndex += 1;
    } else {
      operations.push({
        type: "insert",
        text: newLines[newIndex],
        newLineNumber: newIndex + 1
      });
      newIndex += 1;
    }
  }

  while (oldIndex < oldLines.length) {
    operations.push({
      type: "delete",
      text: oldLines[oldIndex],
      oldLineNumber: oldIndex + 1
    });
    oldIndex += 1;
  }

  while (newIndex < newLines.length) {
    operations.push({
      type: "insert",
      text: newLines[newIndex],
      newLineNumber: newIndex + 1
    });
    newIndex += 1;
  }

  return operations;
}

function isCjkCharacter(value: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let currentKind: "word" | "space" | "punctuation" | null = null;

  const flush = (): void => {
    if (current) {
      tokens.push(current);
      current = "";
    }
  };

  for (const char of text) {
    if (isCjkCharacter(char)) {
      flush();
      currentKind = null;
      tokens.push(char);
      continue;
    }

    const kind = /\s/u.test(char)
      ? "space"
      : /[\p{L}\p{N}_-]/u.test(char)
        ? "word"
        : "punctuation";

    if (kind !== currentKind) {
      flush();
      currentKind = kind;
    }
    current += char;
  }

  flush();
  return tokens;
}

function diffTokens(oldText: string, newText: string): { oldParts: DiffPart[]; newParts: DiffPart[] } {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  if (exceedsLcsBudget(oldTokens.length, newTokens.length)) {
    return {
      oldParts: oldText ? [createPart("delete", oldText)] : [],
      newParts: newText ? [createPart("insert", newText)] : []
    };
  }

  const table = buildLcsTable(oldTokens, newTokens, (oldToken, newToken) => oldToken === newToken);
  const oldOperations: TokenOperation[] = [];
  const newOperations: TokenOperation[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldTokens.length && newIndex < newTokens.length) {
    if (oldTokens[oldIndex] === newTokens[newIndex]) {
      oldOperations.push({ type: "equal", text: oldTokens[oldIndex] });
      newOperations.push({ type: "equal", text: newTokens[newIndex] });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1]) {
      oldOperations.push({ type: "delete", text: oldTokens[oldIndex] });
      oldIndex += 1;
    } else {
      newOperations.push({ type: "insert", text: newTokens[newIndex] });
      newIndex += 1;
    }
  }

  while (oldIndex < oldTokens.length) {
    oldOperations.push({ type: "delete", text: oldTokens[oldIndex] });
    oldIndex += 1;
  }

  while (newIndex < newTokens.length) {
    newOperations.push({ type: "insert", text: newTokens[newIndex] });
    newIndex += 1;
  }

  return {
    oldParts: mergeAdjacentParts(oldOperations.map((operation) => createPart(operation.type, operation.text))),
    newParts: mergeAdjacentParts(newOperations.map((operation) => createPart(operation.type, operation.text)))
  };
}

function equalLine(operation: LineOperation): DiffLine {
  return {
    type: "equal",
    oldText: operation.text,
    newText: operation.text,
    oldParts: [createPart("equal", operation.text)],
    newParts: [createPart("equal", operation.text)],
    oldLineNumber: operation.oldLineNumber,
    newLineNumber: operation.newLineNumber
  };
}

function insertLine(operation: LineOperation): DiffLine {
  return {
    type: "insert",
    oldText: "",
    newText: operation.text,
    oldParts: [],
    newParts: [createPart("insert", operation.text)],
    newLineNumber: operation.newLineNumber
  };
}

function deleteLine(operation: LineOperation): DiffLine {
  return {
    type: "delete",
    oldText: operation.text,
    newText: "",
    oldParts: [createPart("delete", operation.text)],
    newParts: [],
    oldLineNumber: operation.oldLineNumber
  };
}

function replaceLine(deleted: LineOperation, inserted: LineOperation): DiffLine {
  const { oldParts, newParts } = diffTokens(deleted.text, inserted.text);
  return {
    type: "replace",
    oldText: deleted.text,
    newText: inserted.text,
    oldParts,
    newParts,
    oldLineNumber: deleted.oldLineNumber,
    newLineNumber: inserted.newLineNumber
  };
}

function coalesceLineOperations(operations: LineOperation[]): DiffLine[] {
  const lines: DiffLine[] = [];
  let index = 0;

  while (index < operations.length) {
    const operation = operations[index];
    if (operation.type === "equal") {
      lines.push(equalLine(operation));
      index += 1;
      continue;
    }

    const deleted: LineOperation[] = [];
    const inserted: LineOperation[] = [];
    while (index < operations.length && operations[index].type !== "equal") {
      const current = operations[index];
      if (current.type === "delete") {
        deleted.push(current);
      } else {
        inserted.push(current);
      }
      index += 1;
    }

    const pairCount = Math.min(deleted.length, inserted.length);
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      lines.push(replaceLine(deleted[pairIndex], inserted[pairIndex]));
    }
    for (let deleteIndex = pairCount; deleteIndex < deleted.length; deleteIndex += 1) {
      lines.push(deleteLine(deleted[deleteIndex]));
    }
    for (let insertIndex = pairCount; insertIndex < inserted.length; insertIndex += 1) {
      lines.push(insertLine(inserted[insertIndex]));
    }
  }

  return lines;
}

export function diffTexts(oldText: string, newText: string): DiffLine[] {
  return coalesceLineOperations(diffLines(splitLines(oldText), splitLines(newText)));
}

export function getDiffStats(lines: DiffLine[]): DiffStats {
  return lines.reduce<DiffStats>(
    (stats, line) => {
      if (line.type === "insert") {
        stats.added += 1;
      } else if (line.type === "delete") {
        stats.deleted += 1;
      } else if (line.type === "replace") {
        stats.changed += 1;
      }
      return stats;
    },
    { added: 0, deleted: 0, changed: 0 }
  );
}
