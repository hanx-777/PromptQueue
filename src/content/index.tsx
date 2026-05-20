import React from "react";
import { createRoot } from "react-dom/client";
import { QueuePanel } from "../components/QueuePanel";
import { isEditableElement } from "../utils/dom";
import { logInfo, logWarn } from "../utils/logger";
import styles from "./styles.css?inline";

const HOST_ID = "promptqueue-extension-root";

function createHost(): HTMLElement | null {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    return null;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  return host;
}

function isInsideExtension(path: EventTarget[], host: HTMLElement): boolean {
  return path.includes(host);
}

function wireKeyboardShortcuts(host: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey) {
      return;
    }

    const key = event.key.toLowerCase();
    const path = event.composedPath();

    if (event.altKey && !event.shiftKey && key === "q") {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("gqs-toggle"));
      return;
    }

    if (event.altKey && event.shiftKey && event.key === "Enter") {
      if (!isInsideExtension(path, host) && isEditableElement(event.target)) {
        return;
      }
      if (!isInsideExtension(path, host)) {
        return;
      }
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("gqs-add"));
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}

function mount(): void {
  const host = createHost();
  if (!host) {
    return;
  }

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  const mountPoint = document.createElement("div");
  mountPoint.className = "shadow-app";

  shadow.append(style, mountPoint);
  wireKeyboardShortcuts(host);

  createRoot(mountPoint).render(
    <React.StrictMode>
      <QueuePanel />
    </React.StrictMode>
  );

  logInfo("Content script mounted.");
}

try {
  mount();
} catch (error) {
  logWarn("Failed to mount extension UI.", error);
}
