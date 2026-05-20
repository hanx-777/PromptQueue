import { useEffect, useState } from "react";
import type { Texts } from "../content/i18n";
import type { QueueWorkflow, WorkflowMessage } from "../content/types";
import { createId } from "../utils/dom";
import { GripIcon, MinusIcon, PlusIcon } from "./Icons";

interface WorkflowCardProps {
  workflow: QueueWorkflow;
  expanded: boolean;
  texts: Texts;
  onToggle: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onLoad: (id: string) => void;
  onAppend: (id: string) => void;
  onExport: (id: string) => void;
  onUpdateMessages: (id: string, messages: WorkflowMessage[]) => void;
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

function previewPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 84 ? `${normalized.slice(0, 84)}...` : normalized;
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
  onLoad,
  onAppend,
  onExport,
  onUpdateMessages
}: WorkflowCardProps): JSX.Element {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(workflow.name);
  const [newMessageDraft, setNewMessageDraft] = useState("");
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
    setRenaming(false);
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

  const dropOnMessage = (targetId: string): void => {
    if (!draggedMessageId) {
      return;
    }
    updateMessages(reorderMessages(workflow.messages, draggedMessageId, targetId));
    setDraggedMessageId(null);
  };

  return (
    <article className="workflow-card">
      <div className="workflow-card-header">
        <button
          type="button"
          className="icon-button"
          onClick={() => onToggle(workflow.id)}
          aria-label={expanded ? texts.collapseWorkflow : texts.expandWorkflow}
          title={expanded ? texts.collapseWorkflow : texts.expandWorkflow}
        >
          {expanded ? <MinusIcon /> : <PlusIcon />}
        </button>

        <div className="workflow-card-title">
          {renaming ? (
            <div className="workflow-rename-row">
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder={texts.workflowNamePlaceholder}
              />
              <button type="button" onClick={saveRename} disabled={!nameDraft.trim()}>
                {texts.save}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setNameDraft(workflow.name);
                  setRenaming(false);
                }}
              >
                {texts.cancel}
              </button>
            </div>
          ) : (
            <>
              <h3>{workflow.name}</h3>
              <p>
                {workflow.messages.length} {texts.workflowMessageUnit} · {texts.updatedAt}:{" "}
                {new Date(workflow.updatedAt).toLocaleString()}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="workflow-card-actions">
        <button type="button" onClick={() => onLoad(workflow.id)}>
          {texts.loadToQueue}
        </button>
        <button type="button" className="secondary" onClick={() => onAppend(workflow.id)}>
          {texts.appendToQueue}
        </button>
        <button type="button" className="secondary" onClick={() => setRenaming(true)}>
          {texts.rename}
        </button>
        <button type="button" className="secondary" onClick={() => onToggle(workflow.id)}>
          {texts.edit}
        </button>
        <button type="button" className="secondary" onClick={() => onExport(workflow.id)}>
          {texts.exportWorkflow}
        </button>
        <button type="button" className="secondary" onClick={() => onDelete(workflow.id)}>
          {texts.delete}
        </button>
      </div>

      {expanded ? (
        <div className="workflow-editor">
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

          {workflow.messages.length ? (
            <ol className="workflow-message-list">
              {workflow.messages.map((message, index) => (
                <li
                  key={message.id}
                  className="workflow-message-item"
                  draggable
                  onDragStart={() => setDraggedMessageId(message.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropOnMessage(message.id)}
                >
                  <div className="workflow-message-head">
                    <button type="button" className="drag-handle icon-button" title={texts.dragToReorder}>
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
                    <p>{previewPrompt(message.prompt)}</p>
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
