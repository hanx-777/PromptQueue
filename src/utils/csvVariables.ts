export interface ParsedVariableTable {
  headers: string[];
  rows: Record<string, string>[];
}

function splitLine(line: string): string[] {
  const cells = line.includes("\t") ? line.split("\t") : line.split(",");
  return cells.map((cell) => cell.trim());
}

export function parseVariableTable(raw: string): ParsedVariableTable {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return { headers: [], rows: [] };
  }

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

export function getMissingVariableColumns(headers: string[], requiredVariables: string[]): string[] {
  const headerSet = new Set(headers);
  return requiredVariables.filter((name) => !headerSet.has(name));
}

export function getIncompleteRowCount(rows: Record<string, string>[], requiredVariables: string[]): number {
  return rows.filter((row) => requiredVariables.some((name) => !row[name]?.trim())).length;
}
