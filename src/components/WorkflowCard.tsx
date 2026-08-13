import { useEffect, useState, type DragEvent } from "react";
import type { Texts } from "../content/i18n";
import type { QueueWorkflow, WorkflowMessage } from "../content/types";
import { createId, previewPrompt } from "../utils/dom";
import { CloseIcon, GripIcon } from "./Icons";

interface WorkflowCardProps {
  workflow: QueueWorkflow;
  expanded: boolean;
  texts: Texts;
  onToggle: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  onRun: (id: string) => void;
  onExport: (id: string) => void;
  runDisabled: boolean;
  onUpdateMessages: (id: string, messages: WorkflowMessage[]) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
  onWorkflowDragStart: (id: string) => void;
  onWorkflowDrop: (id: string) => void;
  onWorkflowDragEnd: () => void;
}

function now(): number {
  return Date.now();
}

function makeWorkflowMessage(prompt: string): WorkflowMessage {
  const timestamp = now();
  return {
    id: createId(),
    prompt,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function reorderMessages(messages: WorkflowMessage[], draggedId: string, targetId: string): WorkflowMessage[] {
  if (draggedId === targetId) {
    return messages;
  }

  const draggedIndex = messages.findIndex((message) => message.id === draggedId);
  const targetIndex = messages.findIndex((message) => message.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) {
    return messages;
  }

  const next = [...messages];
  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next.map((message) => (
    message.id === draggedId ? { ...message, updatedAt: now() } : message
  ));
}

export function WorkflowCard({
  workflow,
  expanded,
  texts,
  onToggle,
  onRename,
  onDelete,
  onCopy,
  onRun,
  onExport,
  runDisabled,
  onUpdateMessages,
  onAddTag,
  onRemoveTag,
  onWorkflowDragStart,
  onWorkflowDrop,
  onWorkflowDragEnd
}: WorkflowCardProps): JSX.Element {
  const [nameDraft, setNameDraft] = useState(workflow.name);
  const [newMessageDraft, setNewMessageDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [draggedMessageId, setDraggedMessageId] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(workflow.name);
  }, [workflow.name]);

  const updateMessages = (messages: WorkflowMessage[]): void => {
    onUpdateMessages(workflow.id, messages);
  };

  const saveRename = (): void => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      return;
    }
    onRename(workflow.id, trimmed);
  };

  const addMessage = (): void => {
    const prompts = newMessageDraft
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!prompts.length) {
      return;
    }

    updateMessages([
      ...workflow.messages,
      ...prompts.map((prompt) => makeWorkflowMessage(prompt))
    ]);
    setNewMessageDraft("");
  };

  const startMessageEdit = (message: WorkflowMessage): void => {
    setEditingMessageId(message.id);
    setMessageDraft(message.prompt);
  };

  const saveMessageEdit = (): void => {
    const trimmed = messageDraft.trim();
    if (!editingMessageId || !trimmed) {
      return;
    }
    updateMessages(workflow.messages.map((message) => (
      message.id === editingMessageId
        ? { ...message, prompt: trimmed, updatedAt: now() }
        : message
    )));
    setEditingMessageId(null);
    setMessageDraft("");
  };

  const moveMessage = (id: string, direction: "up" | "down"): void => {
    const index = workflow.messages.findIndex((message) => message.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= workflow.messages.length) {
      return;
    }
    const next = [...workflow.messages];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    updateMessages(next);
  };

  const moveMessageTop = (id: string): void => {
    const index = workflow.messages.findIndex((message) => message.id === id);
    if (index <= 0) {
      return;
    }
    const next = [...workflow.messages];
    const [message] = next.splice(index, 1);
    next.unshift(message);
    updateMessages(next);
  };

  const deleteMessage = (id: string): void => {
    updateMessages(workflow.messages.filter((message) => message.id !== id));
  };

  const addTag = (): void => {
    const trimmed = tagDraft.trim();
    if (!trimmed) {
      return;
    }
    onAddTag(workflow.id, trimmed);
    setTagDraft("");
  };

  const dropOnMessage = (event: DragEvent<HTMLLIElement>, targetId: string): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedMessageId) {
      return;
    }
    updateMessages(reorderMessages(workflow.messages, draggedMessageId, targetId));
    setDraggedMessageId(null);
  };

  return (
    <article
      className="workflow-card"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onWorkflowDrop(workflow.id);
      }}
    >
      <div className="workflow-card-header">
        <button
          type="button"
          className="icon-button workflow-card-drag-button"
          draggable
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = "move";
            onWorkflowDragStart(workflow.id);
          }}
          onDragEnd={onWorkflowDragEnd}
          aria-label={texts.dragWorkflow}
          title={texts.dragWorkflow}
        >
          <GripIcon />
        </button>

        <div className="workflow-card-title">
          <h3>{workflow.name}</h3>
          <p>
            {workflow.messages.length} {texts.workflowMessageUnit} · {texts.updatedAt}:{" "}
            {new Date(workflow.updatedAt).toLocaleString()}
          </p>
          {workflow.tags?.length ? (
            <div className="workflow-tag-list" aria-label={texts.workflowTagsLabel}>
              {workflow.tags.map((tag) => <span className="workflow-tag" key={tag}>{tag}</span>)}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="icon-button workflow-delete-button"
          onClick={() => onDelete(workflow.id)}
          aria-label={texts.deleteWorkflow}
          title={texts.deleteWorkflow}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="workflow-card-actions">
        <button type="button" onClick={() => onRun(workflow.id)} disabled={runDisabled}>
          {texts.runWorkflow}
        </button>
        <button type="button" className="secondary" onClick={() => onToggle(workflow.id)}>
          {texts.edit}
        </button>
        <button type="button" className="secondary" onClick={() => onCopy(workflow.id)}>
          {texts.copyWorkflow}
        </button>
        <button type="button" className="secondary" onClick={() => onExport(workflow.id)}>
          {texts.exportWorkflow}
        </button>
      </div>

      {expanded ? (
        <div className="workflow-editor">
          <div className="workflow-name-editor">
            <label>{texts.workflowNameLabel}</label>
            <div className="workflow-rename-row">
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder={texts.workflowNamePlaceholder}
              />
              <button type="button" onClick={saveRename} disabled={!nameDraft.trim() || nameDraft.trim() === workflow.name}>
                {texts.save}
              </button>
            </div>
          </div>

          <div className="workflow-add-message">
            <textarea
              value={newMessageDraft}
              onChange={(event) => setNewMessageDraft(event.target.value)}
              placeholder={texts.addWorkflowMessagePlaceholder}
              rows={2}
            />
            <button type="button" onClick={addMessage} disabled={!newMessageDraft.trim()}>
              {texts.addWorkflowMessage}
            </button>
          </div>

          <div className="workflow-tag-editor">
            <span>{texts.workflowTagsLabel}</span>
            {workflow.tags?.length ? (
              <div className="workflow-tag-list editable">
                {workflow.tags.map((tag) => (
                  <button
                    type="button"
                    className="workflow-tag removable"
                    key={tag}
                    onClick={() => onRemoveTag(workflow.id, tag)}
                    title={`${texts.delete} ${tag}`}
                  >
                    {tag} x
                  </button>
                ))}
              </div>
            ) : null}
            <div className="workflow-tag-input-row">
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                placeholder={texts.workflowTagPlaceholder}
              />
              <button type="button" className="secondary" onClick={addTag} disabled={!tagDraft.trim()}>
                {texts.addWorkflowTag}
              </button>
            </div>
          </div>

          {workflow.messages.length ? (
            <ol className="workflow-message-list">
              {workflow.messages.map((message, index) => (
                <li
                  key={message.id}
                  className="workflow-message-item"
                  draggable
                  onDragStart={(event) => {
                    event.stopPropagation();
                    setDraggedMessageId(message.id);
                  }}
                  onDragEnd={() => setDraggedMessageId(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDrop={(event) => dropOnMessage(event, message.id)}
                >
                  <div className="workflow-message-head">
                    <button
                      type="button"
                      className="drag-handle icon-button"
                      title={`${texts.dragToReorder} (↑ / ↓)`}
                      aria-label={texts.dragToReorder}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp" && index > 0) {
                          event.preventDefault();
                          moveMessage(message.id, "up");
                        } else if (event.key === "ArrowDown" && index < workflow.messages.length - 1) {
                          event.preventDefault();
                          moveMessage(message.id, "down");
                        }
                      }}
                    >
                      <GripIcon />
                    </button>
                    <span className="task-index">#{index + 1}</span>
                  </div>

                  {editingMessageId === message.id ? (
                    <div className="task-edit">
                      <textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} />
                      <div className="task-actions">
                        <button type="button" onClick={saveMessageEdit} disabled={!messageDraft.trim()}>
                          {texts.save}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setEditingMessageId(null);
                            setMessageDraft("");
                          }}
                        >
                          {texts.cancel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p>{previewPrompt(message.prompt, 84)}</p>
                  )}

                  <div className="task-actions task-actions-wrap">
                    <button type="button" className="secondary" onClick={() => startMessageEdit(message)}>
                      {texts.edit}
                    </button>
                    <button type="button" className="secondary" onClick={() => deleteMessage(message.id)}>
                      {texts.delete}
                    </button>
                    <button type="button" className="secondary" onClick={() => moveMessageTop(message.id)} disabled={index === 0}>
                      {texts.top}
                    </button>
                    <button type="button" className="secondary" onClick={() => moveMessage(message.id, "up")} disabled={index === 0}>
                      {texts.up}
                    </button>
                    <button type="button" className="secondary" onClick={() => moveMessage(message.id, "down")} disabled={index === workflow.messages.length - 1}>
                      {texts.down}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state compact-empty">{texts.workflowNoMessages}</div>
          )}
        </div>
      ) : null}
    </article>
  );
}
