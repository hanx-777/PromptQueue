import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import ts from "typescript";
import {
  calculateCollapsedDockPlacement,
  calculatePanelWidth,
  didCollapsedDockDrag,
  shouldSuppressCollapsedDockClick
} from "../src/utils/collapsedDock";
import { getTexts } from "../src/content/i18n";
import { DEFAULT_SETTINGS, loadSettings } from "../src/content/storage";

const SETTINGS_KEY = "chatgptQueueSteer.settings";
const COMPONENTS_DIR = path.join(process.cwd(), "src/components");
const STYLES_PATH = path.join(process.cwd(), "src/content/styles.css");

function setStoredSettings(settings: Record<string, unknown>): void {
  (globalThis as unknown as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: async () => ({ [SETTINGS_KEY]: settings }),
        set: async () => undefined
      },
      onChanged: {
        addListener: () => undefined,
        removeListener: () => undefined
      }
    }
  };
}

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("collapsed panel dock settings", () => {
  it("defaults old settings to a right-side dock below the page midpoint", async () => {
    const oldSettings = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete oldSettings.collapsedDockSide;
    delete oldSettings.collapsedDockYRatio;
    setStoredSettings(oldSettings);

    const settings = await loadSettings();

    assert.equal(settings.collapsedDockSide, "right");
    assert.equal(settings.collapsedDockYRatio, 0.72);
  });

  it("normalizes invalid dock settings into the visible safe range", async () => {
    setStoredSettings({
      ...DEFAULT_SETTINGS,
      collapsedDockSide: "center",
      collapsedDockYRatio: 4
    });

    const settings = await loadSettings();

    assert.equal(settings.collapsedDockSide, "right");
    assert.equal(settings.collapsedDockYRatio, 0.92);
  });
});

describe("run details settings", () => {
  it("defaults old settings to collapsed run details", async () => {
    const oldSettings = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete oldSettings.runDetailsExpanded;
    setStoredSettings(oldSettings);

    const settings = await loadSettings();

    assert.equal(settings.runDetailsExpanded, false);
  });

  it("preserves a stored run details expansion preference", async () => {
    setStoredSettings({
      ...DEFAULT_SETTINGS,
      runDetailsExpanded: true
    });

    const settings = await loadSettings();

    assert.equal(settings.runDetailsExpanded, true);
  });

  it("falls back to collapsed run details for invalid stored values", async () => {
    setStoredSettings({
      ...DEFAULT_SETTINGS,
      runDetailsExpanded: "yes"
    });

    const settings = await loadSettings();

    assert.equal(settings.runDetailsExpanded, false);
  });
});

describe("collapsed dock pointer behavior", () => {
  it("keeps small pointer movement as a click and starts dragging past six pixels", () => {
    assert.equal(didCollapsedDockDrag({ x: 100, y: 100 }, { x: 104, y: 104 }), false);
    assert.equal(didCollapsedDockDrag({ x: 100, y: 100 }, { x: 107, y: 100 }), true);
  });

  it("snaps to the nearest edge and clamps the vertical position", () => {
    assert.deepEqual(
      calculateCollapsedDockPlacement({ x: 20, y: 1 }, { width: 1200, height: 800 }),
      { side: "left", yRatio: 0.08 }
    );
    assert.deepEqual(
      calculateCollapsedDockPlacement({ x: 1100, y: 790 }, { width: 1200, height: 800 }),
      { side: "right", yRatio: 0.92 }
    );
  });

  it("keeps the whole tab visible in a short viewport", () => {
    assert.deepEqual(
      calculateCollapsedDockPlacement({ x: 20, y: 1 }, { width: 800, height: 240 }),
      { side: "left", yRatio: 0.1 }
    );
    assert.deepEqual(
      calculateCollapsedDockPlacement({ x: 780, y: 239 }, { width: 800, height: 240 }),
      { side: "right", yRatio: 0.9 }
    );
  });

  it("suppresses the synthetic click after pointerup but not after pointercancel", () => {
    assert.equal(shouldSuppressCollapsedDockClick(true, false), true);
    assert.equal(shouldSuppressCollapsedDockClick(true, true), false);
    assert.equal(shouldSuppressCollapsedDockClick(false, false), false);
  });

  it("mirrors resize calculations for left- and right-anchored panels", () => {
    assert.equal(calculatePanelWidth(380, 500, 450, "right", 1200), 430);
    assert.equal(calculatePanelWidth(380, 100, 150, "left", 1200), 430);
    assert.equal(calculatePanelWidth(700, 100, 400, "left", 700), 676);
  });
});

describe("provider health labels", () => {
  it("uses compact send and stop labels in both languages", () => {
    const zh = getTexts("zh");
    const en = getTexts("en");

    assert.equal(zh.providerHealthComposer, "输入框");
    assert.equal(zh.providerHealthSend, "发送");
    assert.equal(zh.providerHealthStop, "停止");
    assert.equal(zh.providerHealthBusy, "页面状态");
    assert.equal(en.providerHealthComposer, "Composer");
    assert.equal(en.providerHealthSend, "Send");
    assert.equal(en.providerHealthStop, "Stop");
    assert.equal(en.providerHealthBusy, "Page state");
  });
});

describe("run details labels", () => {
  it("provides localized labels for the persistent disclosure", () => {
    const zh = getTexts("zh");
    const en = getTexts("en");

    assert.equal(zh.runDetails, "\u8fd0\u884c\u8be6\u60c5");
    assert.equal(en.runDetails, "Run details");
  });
});

describe("run details panel structure", () => {
  it("keeps quick actions visible and limits disclosure state to run details", () => {
    const source = readFileSync(path.join(COMPONENTS_DIR, "QueuePanel.tsx"), "utf8");

    assert.doesNotMatch(source, /runQuickActionsOpen/);
    assert.match(source, /className="run-quick-actions"/);
    assert.match(source, /aria-expanded=\{settings\.runDetailsExpanded\}/);
    assert.match(
      source,
      /className="run-details-body"\s+id="promptqueue-run-details"\s+hidden=\{!settings\.runDetailsExpanded\}/
    );
  });
});

describe("top provider health strip", () => {
  it("moves the only provider health display above navigation and keeps settings in navigation", () => {
    const source = readFileSync(path.join(COMPONENTS_DIR, "QueuePanel.tsx"), "utf8");
    const styles = readFileSync(STYLES_PATH, "utf8");

    assert.doesNotMatch(source, /SettingsIcon/);
    assert.doesNotMatch(source, /className="status-bar"/);
    assert.doesNotMatch(source, /className="provider-health-panel"/);
    assert.match(source, /className="provider-health-strip"/);
    assert.match(source, /\{ id: "settings", label: texts\.navSettings \}/);

    const healthStripIndex = source.indexOf('className="provider-health-strip"');
    const navigationIndex = source.indexOf('<nav className="panel-nav"');
    assert.ok(healthStripIndex >= 0 && healthStripIndex < navigationIndex);
    assert.equal((source.match(/className=\{`provider-health-chip/g) ?? []).length, 4);
    assert.doesNotMatch(styles, /\.provider-tag|\.status-bar|\.provider-health-panel/);
  });
});

describe("icon button hover labels", () => {
  it("gives every aria-labelled component button a matching native tooltip", () => {
    const missingTitles: string[] = [];

    for (const fileName of readdirSync(COMPONENTS_DIR).filter((name) => name.endsWith(".tsx"))) {
      const source = readFileSync(path.join(COMPONENTS_DIR, fileName), "utf8");
      const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

      const visit = (node: ts.Node): void => {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sourceFile) === "button") {
          const attributes = node.openingElement.attributes.properties.filter(ts.isJsxAttribute);
          const ariaLabel = attributes.find((attribute) => attribute.name.getText(sourceFile) === "aria-label");
          const title = attributes.find((attribute) => attribute.name.getText(sourceFile) === "title");

          if (ariaLabel && ariaLabel.initializer?.getText(sourceFile) !== title?.initializer?.getText(sourceFile)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            missingTitles.push(`${fileName}:${line}`);
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }

    assert.deepEqual(missingTitles, []);
  });
});

describe("adaptive settings console", () => {
  it("surfaces a derived configuration overview and keeps core controls semantic", () => {
    const source = readFileSync(path.join(COMPONENTS_DIR, "SettingsPanel.tsx"), "utf8");
    const styles = readFileSync(STYLES_PATH, "utf8");

    assert.match(source, /const automationEnabledCount = \[/);
    assert.match(source, /const automaticModelCount = providerIds\.filter/);
    assert.match(source, /className="settings-overview"/);
    assert.match(source, /className="settings-switch"/);
    assert.match(source, /role="radiogroup"/);
    assert.match(source, /activePage === "advanced"/);
    assert.match(source, /className="advanced-settings"/);
    assert.doesNotMatch(source, /advancedOpen|settings-disclosure|promptqueue-advanced-settings/);
    assert.match(source, /className="settings-support"/);
    assert.match(source, /<img src=\{donateImageUrl\}/);
    assert.match(styles, /\.settings-overview \{/);
    assert.match(styles, /\.settings-switch \{/);
    assert.match(styles, /\.settings-choice-group \{/);
    assert.match(styles, /\.settings-support \{/);
    assert.doesNotMatch(styles, /\.settings-disclosure \{/);
  });

  it("provides localized labels for the settings summary and groups", () => {
    const zh = getTexts("zh") as Record<string, string>;
    const en = getTexts("en") as Record<string, string>;

    assert.equal(zh.settingsOverviewAutomation, "自动化");
    assert.equal(zh.settingsOverviewModels, "模型策略");
    assert.equal(zh.settingsOverviewData, "数据采集");
    assert.equal(en.settingsOverviewAutomation, "Automation");
    assert.equal(en.settingsOverviewModels, "Model routing");
    assert.equal(en.settingsOverviewData, "Data capture");
  });
});

describe("settings pagination", () => {
  it("keeps settings in three local, keyboard-accessible pages", () => {
    const source = readFileSync(path.join(COMPONENTS_DIR, "SettingsPanel.tsx"), "utf8");
    const styles = readFileSync(STYLES_PATH, "utf8");

    assert.match(source, /type SettingsPage = "general" \| "advanced" \| "support"/);
    assert.match(source, /useState<SettingsPage>\("general"\)/);
    assert.match(source, /className="settings-page-content"/);
    assert.match(source, /className="settings-pagination"/);
    assert.ok(
      source.indexOf('className="settings-pagination"') < source.indexOf('className="settings-page-content"'),
      "the settings page switcher should appear above the active page content"
    );
    assert.match(source, /aria-current=\{activePage === page\.id \? "page" : undefined\}/);
    assert.doesNotMatch(source, /settings-pagination-arrow/);
    assert.doesNotMatch(source, /settingsPreviousPage|settingsNextPage/);
    assert.match(styles, /\.settings-pagination \{/);
    assert.match(styles, /\.settings-page-button \{/);
    assert.doesNotMatch(styles, /\.settings-pagination-arrow \{/);
  });

  it("localizes the page controls", () => {
    const zh = getTexts("zh") as Record<string, string>;
    const en = getTexts("en") as Record<string, string>;

    assert.equal(zh.settingsPageGeneral, "常规");
    assert.equal(zh.settingsPageAdvanced, "高级");
    assert.equal(zh.settingsPageSupport, "支持");
    assert.equal(en.settingsPageGeneral, "General");
    assert.equal(en.settingsPageAdvanced, "Advanced");
    assert.equal(en.settingsPageSupport, "Support");
    assert.equal(zh.settingsPreviousPage, undefined);
    assert.equal(en.settingsNextPage, undefined);
  });
});
