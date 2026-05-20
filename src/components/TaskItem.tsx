import { useState } from "react";
import { statusLabel, type Texts } from "../content/i18n";
import type { QueueTask } from "../content/types";
import { GripIcon, MinusIcon, PlusIcon } from "./Icons";

interface TaskItemProps {
  task: QueueTask;
  index: number;
  total: number;
  texts: Texts;
  onEdit: (id: string, prompt: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onMoveTop: (id: string) => void;
  onSkip: (id: string) => void;
  onRetry: (id: string) => void;
  onDragStart: (id: string) => void;
  onDropOn: (id: string) => void;
}

function previewPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
}

export function TaskItem({
  task,
  index,
  total,
  texts,
  onEdit,
  onDelete,
  onMove,
  onMoveTop,
  onSkip,
  onRetry,
  onDragStart,
  onDropOn
}: TaskItemProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.prompt);
  const locked = task.status === "running";

  const saveEdit = (): void => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    onEdit(task.id, trimmed);
    setEditing(false);
  };

  return (
    <article
      className={`task-item task-${task.status}`}
      draggable={!locked}
      onDragStart={() => !locked && onDragStart(task.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDropOn(task.id)}
    >
      <div className="task-header">
        <button
          className="drag-handle icon-button"
          type="button"
          title={texts.dragToReorder}
          disabled={locked}
          aria-label={texts.dragTask}
        >
          <GripIcon />
        </button>
        <span className="task-index">#{index + 1}</span>
        <span className={`status-chip status-${task.status}`}>{statusLabel(task.status, texts)}</span>
        <button
          className="icon-button expand-button"
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? texts.collapseTask : texts.expandTask}
          title={expanded ? texts.collapseTask : texts.expandTask}
        >
          {expanded ? <MinusIcon /> : <PlusIcon />}
        </button>
      </div>

      {editing ? (
        <div className="task-edit">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className="task-actions">
            <button type="button" onClick={saveEdit} disabled={!draft.trim()}>
              {texts.save}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setDraft(task.prompt);
                setEditing(false);
              }}
            >
              {texts.cancel}
            </button>
          </div>
        </div>
      ) : (
        <p className="task-preview">{expanded ? task.prompt : previewPrompt(task.prompt)}</p>
      )}

      {task.error ? <p className="task-error">{task.error}</p> : null}

      <div className="task-actions task-actions-wrap">
        <button type="button" className="secondary" onClick={() => setEditing(true)} disabled={locked}>
          {texts.edit}
        </button>
        <button type="button" className="secondary" onClick={() => onDelete(task.id)} disabled={locked}>
          {texts.delete}
        </button>
        <button type="button" className="secondary" onClick={() => onMoveTop(task.id)} disabled={locked || index === 0}>
          {texts.top}
        </button>
        <button type="button" className="secondary" onClick={() => onMove(task.id, "up")} disabled={locked || index === 0}>
          {texts.up}
        </button>
        <button type="button" className="secondary" onClick={() => onMove(task.id, "down")} disabled={locked || index === total - 1}>
          {texts.down}
        </button>
        <button type="button" className="secondary" onClick={() => onSkip(task.id)} disabled={task.status === "done" || task.status === "skipped"}>
          {texts.skip}
        </button>
        <button type="button" className="secondary" onClick={() => onRetry(task.id)} disabled={task.status === "running"}>
          {texts.retry}
        </button>
      </div>
    </article>
  );
}
