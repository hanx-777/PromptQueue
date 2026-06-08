import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffTexts, getDiffStats } from "../src/utils/textDiff";

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
