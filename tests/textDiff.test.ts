import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffTexts, filterDiffLinesWithContext, formatDiffSummary, getDiffStats } from "../src/utils/textDiff";

describe("diffTexts", () => {
  it("handles empty input", () => {
    assert.deepEqual(diffTexts("", ""), []);

    const inserted = diffTexts("", "created");
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]?.type, "insert");
    assert.equal(inserted[0]?.newText, "created");

    const deleted = diffTexts("removed", "");
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0]?.type, "delete");
    assert.equal(deleted[0]?.oldText, "removed");
  });

  it("marks identical lines as equal", () => {
    const lines = diffTexts("hello\nworld", "hello\nworld");

    assert.deepEqual(lines.map((line) => line.type), ["equal", "equal"]);
    assert.equal(getDiffStats(lines).added, 0);
    assert.equal(getDiffStats(lines).deleted, 0);
    assert.equal(getDiffStats(lines).changed, 0);
  });

  it("can ignore whitespace and case while preserving original display text", () => {
    const whitespace = diffTexts("hello   world", "hello world", { ignoreWhitespace: true });
    assert.deepEqual(whitespace.map((line) => line.type), ["equal"]);
    assert.equal(whitespace[0]?.oldText, "hello   world");
    assert.equal(whitespace[0]?.newText, "hello world");

    const caseOnly = diffTexts("Alpha", "alpha", { ignoreCase: true });
    assert.deepEqual(caseOnly.map((line) => line.type), ["equal"]);
    assert.equal(getDiffStats(caseOnly).changed, 0);
  });

  it("marks inserted and deleted lines", () => {
    const lines = diffTexts("alpha\nbeta", "alpha\ngamma\nbeta");

    assert.deepEqual(lines.map((line) => line.type), ["equal", "insert", "equal"]);
    assert.equal(lines[1]?.newText, "gamma");
    assert.equal(getDiffStats(lines).added, 1);

    const deleted = diffTexts("alpha\ngamma\nbeta", "alpha\nbeta");
    assert.deepEqual(deleted.map((line) => line.type), ["equal", "delete", "equal"]);
    assert.equal(deleted[1]?.oldText, "gamma");
    assert.equal(getDiffStats(deleted).deleted, 1);
  });

  it("marks changed lines and highlights changed English words", () => {
    const lines = diffTexts("write a short summary", "write a concise summary");

    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.type, "replace");
    assert.deepEqual(lines[0]?.oldParts.map((part) => part.type), ["equal", "delete", "equal"]);
    assert.deepEqual(lines[0]?.newParts.map((part) => part.type), ["equal", "insert", "equal"]);
    assert.equal(lines[0]?.oldParts.find((part) => part.type === "delete")?.text, "short");
    assert.equal(lines[0]?.newParts.find((part) => part.type === "insert")?.text, "concise");
    assert.equal(getDiffStats(lines).changed, 1);
  });

  it("defaults to word precision while allowing line and character precision", () => {
    const wordPrecision = diffTexts("This is a good test.", "This is a great test.");
    assert.equal(wordPrecision[0]?.type, "replace");
    assert.equal(wordPrecision[0]?.oldParts.find((part) => part.type === "delete")?.text, "good");
    assert.equal(wordPrecision[0]?.newParts.find((part) => part.type === "insert")?.text, "great");

    const linePrecision = diffTexts("我们先从哪里开始呢?", "我们先从哪里弄开呢?", { precision: "line" });
    assert.equal(linePrecision[0]?.type, "replace");
    assert.deepEqual(linePrecision[0]?.oldParts, [{ type: "delete", text: "我们先从哪里开始呢?" }]);
    assert.deepEqual(linePrecision[0]?.newParts, [{ type: "insert", text: "我们先从哪里弄开呢?" }]);

    const chineseWordPrecision = diffTexts("我们先从哪里开始呢?", "我们先从哪里弄开呢?", { precision: "word" });
    assert.equal(chineseWordPrecision[0]?.oldParts.find((part) => part.type === "delete")?.text, "始");
    assert.equal(chineseWordPrecision[0]?.newParts.find((part) => part.type === "insert")?.text, "弄");

    const characterPrecision = diffTexts("我们先从哪里开始呢?", "我们先从哪里弄开呢?", { precision: "character" });
    assert.equal(characterPrecision[0]?.type, "replace");
    assert.equal(characterPrecision[0]?.oldParts.find((part) => part.type === "delete")?.text, "始");
    assert.equal(characterPrecision[0]?.newParts.find((part) => part.type === "insert")?.text, "弄");
  });

  it("keeps one equal context line around change-only results", () => {
    const lines = diffTexts("alpha\nbeta\ngamma\ndelta", "alpha\nbetter\ngamma\ndelta");
    const visible = filterDiffLinesWithContext(lines, 1);

    assert.deepEqual(visible.map((line) => line.oldText || line.newText), ["alpha", "beta", "gamma"]);
  });

  it("includes compare options in markdown summaries without changing stats", () => {
    const lines = diffTexts("Alpha", "alpha", { ignoreCase: true });
    const summary = formatDiffSummary(lines, "en", {
      ignoreCase: true,
      ignoreWhitespace: true,
      precision: "word",
      onlyChanges: true
    });

    assert.match(summary, /Options:/);
    assert.match(summary, /Ignore case: yes/);
    assert.match(summary, /Ignore whitespace: yes/);
    assert.match(summary, /Precision: word/);
    assert.match(summary, /Only changes: yes/);
    assert.match(summary, /Changed: 0/);
  });

  it("keeps context around multi-line replacements", () => {
    const lines = diffTexts("alpha\nshort line\nomega", "alpha\nlonger line\nomega");

    assert.deepEqual(lines.map((line) => line.type), ["equal", "replace", "equal"]);
    assert.equal(lines[1]?.oldLineNumber, 2);
    assert.equal(lines[1]?.newLineNumber, 2);
    assert.equal(lines[1]?.oldParts.find((part) => part.type === "delete")?.text, "short");
    assert.equal(lines[1]?.newParts.find((part) => part.type === "insert")?.text, "longer");
  });

  it("highlights inserted Chinese characters within a changed line", () => {
    const lines = diffTexts("加入文本对比模块", "加入实时文本对比模块");

    assert.equal(lines[0]?.type, "replace");
    assert.equal(lines[0]?.newParts.find((part) => part.type === "insert")?.text, "实时");
  });
});
