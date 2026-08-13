import { useDeferredValue, useMemo, useState } from "react";
import type { Texts } from "../content/i18n";
import type { Language } from "../content/i18n";
import { diffTexts, filterDiffLinesWithContext, formatDiffSummary, getDiffStats, type DiffLine, type DiffOptions, type DiffPart } from "../utils/textDiff";
import { ClearIcon, CloseIcon, CopyIcon, SwapIcon } from "./Icons";

interface TextComparePanelProps {
  texts: Texts;
  oldText: string;
  newText: string;
  language: Language;
  onOldTextChange: (text: string) => void;
  onNewTextChange: (text: string) => void;
  onClose?: () => void;
}

interface TextMetrics {
  lines: number;
  chars: number;
}

type CompareSide = "old" | "new";
type CompareViewMode = "row" | "column";
type ComparePrecision = "line" | "word" | "character";

function getTextMetrics(text: string): TextMetrics {
  return {
    lines: text.length ? text.replace(/\r\n/g, "\n").split("\n").length : 0,
    chars: Array.from(text).length
  };
}

function getPartClassName(part: DiffPart, side: CompareSide): string {
  if (part.type === "equal") {
    return "diff-token diff-token-equal";
  }
  return `diff-token diff-token-${part.type} diff-token-${side}`;
}

function getLineMarker(line: DiffLine, side: CompareSide): string {
  if (line.type === "insert") {
    return side === "new" ? "+" : "";
  }
  if (line.type === "delete") {
    return side === "old" ? "-" : "";
  }
  if (line.type === "replace") {
    return "~";
  }
  return "";
}

function getLineClassName(line: DiffLine, side?: CompareSide): string {
  const sideClass = side ? ` diff-line-${side}` : "";
  return `diff-line diff-line-${line.type}${sideClass}`;
}

function renderParts(parts: DiffPart[], side: CompareSide): JSX.Element[] {
  return parts.map((part, index) => (
    <span className={getPartClassName(part, side)} key={`${part.type}-${index}`}>
      {part.text}
    </span>
  ));
}

function renderSplitCell(line: DiffLine, side: CompareSide, texts: Texts): JSX.Element {
  const parts = side === "old" ? line.oldParts : line.newParts;
  const text = side === "old" ? line.oldText : line.newText;
  const lineNumber = side === "old" ? line.oldLineNumber : line.newLineNumber;
  const isEmptySide = !text && ((side === "old" && line.type === "insert") || (side === "new" && line.type === "delete"));

  return (
    <div className={`${getLineClassName(line, side)}${isEmptySide ? " diff-line-empty-side" : ""}`}>
      <span className="diff-gutter" aria-hidden="true">
        <span className="diff-line-number">{lineNumber ?? ""}</span>
        <span className="diff-marker">{getLineMarker(line, side)}</span>
      </span>
      <span className="diff-line-content">
        {isEmptySide ? <span className="diff-empty-placeholder">{texts.compareNoLine}</span> : renderParts(parts, side)}
      </span>
    </div>
  );
}

function renderUnifiedLine(line: DiffLine, side: CompareSide, texts: Texts): JSX.Element {
  const parts = side === "old" ? line.oldParts : line.newParts;
  const lineNumber = side === "old" ? line.oldLineNumber : line.newLineNumber;
  const sideLabel = side === "old" ? texts.compareOldSide : texts.compareNewSide;

  return (
    <div className={getLineClassName(line, side)} key={`${side}-${line.oldLineNumber ?? "x"}-${line.newLineNumber ?? "x"}`}>
      <span className="diff-gutter" aria-hidden="true">
        <span className="diff-line-number">{lineNumber ?? ""}</span>
        <span className="diff-marker">{line.type === "replace" ? "~" : getLineMarker(line, side)}</span>
      </span>
      <span className="diff-side-badge">{line.type === "replace" ? sideLabel : ""}</span>
      <span className="diff-line-content">{renderParts(parts, side)}</span>
    </div>
  );
}

function renderUnifiedRows(line: DiffLine, texts: Texts): JSX.Element[] {
  if (line.type === "insert") {
    return [renderUnifiedLine(line, "new", texts)];
  }
  if (line.type === "delete") {
    return [renderUnifiedLine(line, "old", texts)];
  }
  if (line.type === "replace") {
    return [renderUnifiedLine(line, "old", texts), renderUnifiedLine(line, "new", texts)];
  }
  return [renderUnifiedLine(line, "old", texts)];
}

function formatMetrics(metrics: TextMetrics, texts: Texts): string {
  return `${metrics.lines} ${texts.compareLinesUnit} · ${metrics.chars} ${texts.compareCharsUnit}`;
}

export function TextComparePanel({
  texts,
  oldText,
  newText,
  language,
  onOldTextChange,
  onNewTextChange,
  onClose
}: TextComparePanelProps): JSX.Element {
  const [viewMode, setViewMode] = useState<CompareViewMode>("column");
  const [precision, setPrecision] = useState<ComparePrecision>("word");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const deferredOldText = useDeferredValue(oldText);
  const deferredNewText = useDeferredValue(newText);
  const diffOptions = useMemo<DiffOptions>(() => ({
    ignoreWhitespace,
    ignoreCase,
    precision
  }), [ignoreCase, ignoreWhitespace, precision]);
  const diffLines = useMemo(() => diffTexts(deferredOldText, deferredNewText, diffOptions), [deferredOldText, deferredNewText, diffOptions]);
  const visibleDiffLines = useMemo(
    () => onlyChanges ? filterDiffLinesWithContext(diffLines, 1) : diffLines,
    [diffLines, onlyChanges]
  );
  const stats = useMemo(() => getDiffStats(diffLines), [diffLines]);
  const oldMetrics = useMemo(() => getTextMetrics(oldText), [oldText]);
  const newMetrics = useMemo(() => getTextMetrics(newText), [newText]);
  const hasInput = Boolean(oldText || newText);
  const hasChanges = stats.added > 0 || stats.deleted > 0 || stats.changed > 0;
  const useSplitView = viewMode === "column";

  const clear = (): void => {
    onOldTextChange("");
    onNewTextChange("");
  };

  const swap = (): void => {
    onOldTextChange(newText);
    onNewTextChange(oldText);
  };

  const copySummary = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(formatDiffSummary(diffLines, language, {
        ...diffOptions,
        onlyChanges
      }));
      setCopyMessage(texts.compareSummaryCopied);
    } catch {
      setCopyMessage(texts.compareSummaryCopyFailed);
    }
  };

  const copyRevised = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(newText);
      setCopyMessage(texts.compareRevisedCopied);
    } catch {
      setCopyMessage(texts.compareRevisedCopyFailed);
    }
  };

  return (
    <section className="panel-section compare-panel" aria-label={texts.navCompare}>
      {onClose ? (
        <div className="section-title-row">
          <h2>{texts.navCompare}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={texts.closePanel}>
            <CloseIcon />
          </button>
        </div>
      ) : null}
      <div className="compare-input-grid">
        <label className="compare-field">
          <span className="compare-field-head">
            <strong>{texts.compareOldLabel}</strong>
            <span>{formatMetrics(oldMetrics, texts)}</span>
          </span>
          <textarea
            value={oldText}
            onChange={(event) => onOldTextChange(event.target.value)}
            placeholder={texts.compareOldPlaceholder}
            rows={7}
          />
        </label>

        <label className="compare-field">
          <span className="compare-field-head">
            <strong>{texts.compareNewLabel}</strong>
            <span>{formatMetrics(newMetrics, texts)}</span>
          </span>
          <textarea
            value={newText}
            onChange={(event) => onNewTextChange(event.target.value)}
            placeholder={texts.compareNewPlaceholder}
            rows={7}
          />
        </label>
      </div>

      <section className="compare-result-shell" aria-label={texts.compareResultTitle}>
        <div className="compare-toolbar">
          <div className="compare-stat-list" aria-label={texts.compareStatsLabel}>
            <span className="diff-stat diff-stat-insert">+ {stats.added} {texts.compareAdded}</span>
            <span className="diff-stat diff-stat-delete">- {stats.deleted} {texts.compareDeleted}</span>
            <span className="diff-stat diff-stat-change">~ {stats.changed} {texts.compareChanged}</span>
            {hasInput && !hasChanges ? <span className="diff-stat diff-stat-equal">{texts.compareNoChanges}</span> : null}
          </div>

          <div className="compare-actions">
            <button type="button" className="secondary icon-text-action" onClick={() => void copySummary()} disabled={!hasChanges}>
              <CopyIcon />
              <span>{texts.compareCopySummary}</span>
            </button>
            <button type="button" className="secondary icon-text-action" onClick={() => void copyRevised()} disabled={!newText}>
              <CopyIcon />
              <span>{texts.compareCopyRevised}</span>
            </button>
            <button type="button" className="secondary icon-text-action" onClick={swap} disabled={!hasInput}>
              <SwapIcon />
              <span>{texts.compareSwap}</span>
            </button>
            <button type="button" className="secondary icon-text-action" onClick={clear} disabled={!hasInput}>
              <ClearIcon />
              <span>{texts.compareClear}</span>
            </button>
          </div>
        </div>

        <div className="compare-options" aria-label={texts.compareStatsLabel}>
          <div className="compare-segment" role="group" aria-label={texts.compareViewMode}>
            <span className="compare-segment-label">{texts.compareViewMode}</span>
            <div className="compare-segment-buttons">
              <button
                type="button"
                className={viewMode === "row" ? "active" : ""}
                aria-pressed={viewMode === "row"}
                onClick={() => setViewMode("row")}
              >
                {texts.compareViewRow}
              </button>
              <button
                type="button"
                className={viewMode === "column" ? "active" : ""}
                aria-pressed={viewMode === "column"}
                onClick={() => setViewMode("column")}
              >
                {texts.compareViewColumn}
              </button>
            </div>
          </div>
          <div className="compare-segment" role="group" aria-label={texts.comparePrecisionMode}>
            <span className="compare-segment-label">{texts.comparePrecisionMode}</span>
            <div className="compare-segment-buttons">
              <button
                type="button"
                className={precision === "line" ? "active" : ""}
                aria-pressed={precision === "line"}
                onClick={() => setPrecision("line")}
              >
                {texts.comparePrecisionLine}
              </button>
              <button
                type="button"
                className={precision === "word" ? "active" : ""}
                aria-pressed={precision === "word"}
                onClick={() => setPrecision("word")}
              >
                {texts.comparePrecisionWord}
              </button>
              <button
                type="button"
                className={precision === "character" ? "active" : ""}
                aria-pressed={precision === "character"}
                onClick={() => setPrecision("character")}
              >
                {texts.comparePrecisionCharacter}
              </button>
            </div>
          </div>
          <label className="mini-toggle compare-toggle">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(event) => setIgnoreWhitespace(event.target.checked)}
            />
            <span>{texts.compareIgnoreWhitespace}</span>
          </label>
          <label className="mini-toggle compare-toggle">
            <input
              type="checkbox"
              checked={ignoreCase}
              onChange={(event) => setIgnoreCase(event.target.checked)}
            />
            <span>{texts.compareIgnoreCase}</span>
          </label>
          <label className="mini-toggle compare-toggle">
            <input
              type="checkbox"
              checked={onlyChanges}
              onChange={(event) => setOnlyChanges(event.target.checked)}
            />
            <span>{texts.compareOnlyChanges}</span>
          </label>
        </div>

        {copyMessage ? <div className="compare-copy-message">{copyMessage}</div> : null}

        <div className="compare-legend" aria-label={texts.compareLegendLabel}>
          <span><mark className="legend-mark legend-insert">+</mark>{texts.compareLegendAdded}</span>
          <span><mark className="legend-mark legend-delete">-</mark>{texts.compareLegendDeleted}</span>
          <span><mark className="legend-mark legend-change">~</mark>{texts.compareLegendChanged}</span>
        </div>

        {!hasInput ? (
          <div className="compare-empty-state">{texts.compareEmptyState}</div>
        ) : onlyChanges && !visibleDiffLines.length ? (
          <div className="compare-empty-state">{texts.compareOnlyChangesEmpty}</div>
        ) : (
          <div className="compare-diff-surface">
            {useSplitView ? (
              <div className="compare-split-view" aria-label={texts.compareSplitView}>
                <div className="diff-split-header">
                  <span>{texts.compareOldSide}</span>
                  <span>{texts.compareNewSide}</span>
                </div>
                {visibleDiffLines.map((line, index) => (
                  <div className={`diff-split-row diff-split-row-${line.type}`} key={`${line.type}-${index}`}>
                    {renderSplitCell(line, "old", texts)}
                    {renderSplitCell(line, "new", texts)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="compare-unified-view" aria-label={texts.compareUnifiedView}>
                {visibleDiffLines.flatMap((line) => renderUnifiedRows(line, texts))}
              </div>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
