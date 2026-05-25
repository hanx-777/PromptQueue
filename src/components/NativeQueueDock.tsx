import { useCallback, useEffect, useState, type CSSProperties, type DragEvent } from "react";
import { statusLabel, type Texts } from "../content/i18n";
import type { ProviderAdapter } from "../content/providers";
import type { QueueSettings, QueueState, QueueTask } from "../content/types";
import { clamp, previewPrompt } from "../utils/dom";
import { GripIcon } from "./Icons";

type ResolvedTheme = Exclude<QueueSettings["theme"], "page">;

interface DockGeometry {
  visible: boolean;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

interface NativeQueueDockProps {
  provider: ProviderAdapter;
  providerClass: string;
  theme: ResolvedTheme;
  state: QueueState;
  texts: Texts;
  providerBusy: boolean;
  onEdit: (id: string, prompt: string) => void;
  onDelete: (id: string) => void;
  onSteer: (id: string) => void;
  onDragStart: (id: string) => void;
  onDropOn: (id: string) => void;
  onDragEnd: () => void;
}

function getVisibleTasks(tasks: QueueTask[]): QueueTask[] {
  return tasks.filter((task) => task.status !== "done");
}

function isReorderable(task: QueueTask): boolean {
  return task.status === "pending";
}

export function NativeQueueDock({
  provider,
  providerClass,
  theme,
  state,
  texts,
  providerBusy,
  onEdit,
  onDelete,
  onSteer,
  onDragStart,
  onDropOn,
  onDragEnd
}: NativeQueueDockProps): JSX.Element | null {
  const [geometry, setGeometry] = useState<DockGeometry>({
    visible: false,
    left: 0,
    top: 0,
    width: 360,
    maxHeight: 260
  });
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const visibleTasks = getVisibleTasks(state.tasks);
  const pendingCount = state.tasks.filter((task) => task.status === "pending").length;
  const hasActiveQueue = visibleTasks.length > 0;
  const dockStatusText = state.isRunning && !state.currentTaskId && providerBusy
      ? texts.waitingForCurrentReply
      : state.isRunning
        ? texts.currentlyRunningQueue
        : `${texts.pending}: ${pendingCount}`;

  const syncGeometry = useCallback((): void => {
    const anchor = provider.findComposerAnchor();
    if (!anchor) {
      setGeometry((current) => ({ ...current, visible: false }));
      return;
    }

    const rect = anchor.getBoundingClientRect();
    if (rect.width < 160 || rect.height < 24 || rect.bottom < 0 || rect.top > window.innerHeight || rect.top < 120) {
      setGeometry((current) => ({ ...current, visible: false }));
      return;
    }

    const width = clamp(rect.width, 300, Math.min(720, window.innerWidth - 16));
    const left = clamp(rect.left + (rect.width - width) / 2, 8, window.innerWidth - width - 8);
    const maxHeight = clamp(rect.top - 24, 120, Math.min(360, window.innerHeight * 0.46));

    setGeometry({
      visible: true,
      left,
      top: rect.top - 8,
      width,
      maxHeight
    });
  }, [provider]);

  useEffect(() => {
    const sync = (): void => {
      syncGeometry();
    };
    let frameId: number | null = null;
    const scheduleSync = (): void => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        sync();
      });
    };

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true
    });

    window.addEventListener("resize", scheduleSync);
    window.addEventListener("scroll", scheduleSync, true);
    const intervalId = window.setInterval(sync, 1200);
    sync();

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync, true);
      window.clearInterval(intervalId);
    };
  }, [syncGeometry]);

  const startEdit = (task: QueueTask): void => {
    setEditingTaskId(task.id);
    setEditDraft(task.prompt);
  };

  const saveEdit = (): void => {
    const trimmed = editDraft.trim();
    if (!editingTaskId || !trimmed) {
      return;
    }
    onEdit(editingTaskId, trimmed);
    setEditingTaskId(null);
    setEditDraft("");
  };

  if (!geometry.visible || !hasActiveQueue) {
    return null;
  }

  const style: CSSProperties = {
    left: geometry.left,
    top: geometry.top,
    width: geometry.width,
    maxHeight: geometry.maxHeight
  };

  return (
    <aside
      className={`queue-shell native-queue-dock theme-${theme} ${providerClass}`}
      style={style}
      aria-label={texts.nativeQueueDockLabel}
    >
      <header className="native-dock-header">
        <div className="native-dock-title">
          <strong>{texts.queueMessages}</strong>
          <span>{dockStatusText}</span>
        </div>
      </header>

      <div className="native-task-list" role="list">
        {visibleTasks.map((task, index) => {
          const canReorder = isReorderable(task);
          const isEditing = editingTaskId === task.id;
          const isRunning = task.status === "running";

          return (
            <article
              key={task.id}
              className={`native-task-row task-${task.status}`}
              draggable={canReorder}
              role="listitem"
              onDragStart={() => canReorder && onDragStart(task.id)}
              onDragOver={(event: DragEvent<HTMLElement>) => {
                if (canReorder) {
                  event.preventDefault();
                }
              }}
              onDrop={() => canReorder && onDropOn(task.id)}
              onDragEnd={onDragEnd}
            >
              <div className="native-task-head">
                <button
                  className="drag-handle icon-button"
                  type="button"
                  title={texts.dragToReorder}
                  disabled={!canReorder}
                  aria-label={texts.dragTask}
                >
                  <GripIcon />
                </button>
                <span className="task-index">#{index + 1}</span>
                <span className={`status-chip status-${task.status}`}>{statusLabel(task.status, texts)}</span>
              </div>

              {isEditing ? (
                <div className="native-task-edit">
                  <textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} rows={2} />
                  <div className="native-task-actions">
                    <button type="button" onClick={saveEdit} disabled={!editDraft.trim()}>
                      {texts.save}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setEditingTaskId(null);
                        setEditDraft("");
                      }}
                    >
                      {texts.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="native-task-preview">{previewPrompt(task.prompt, 96)}</p>
              )}

              {task.error ? <p className="task-error">{task.error}</p> : null}

              <div className="native-task-actions">
                <button type="button" className="secondary" onClick={() => startEdit(task)} disabled={isRunning}>
                  {texts.edit}
                </button>
                <button type="button" className="secondary" onClick={() => onDelete(task.id)} disabled={isRunning}>
                  {texts.delete}
                </button>
                {task.status === "pending" ? (
                  <button type="button" className="warning" onClick={() => onSteer(task.id)}>
                    {texts.prioritizeSteer}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
