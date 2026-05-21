import type { ReactNode } from "react";

interface IconProps {
  className?: string;
}

function IconShell({ className, children }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg className={className ?? "svg-icon"} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps): JSX.Element {
  return (
    <IconShell className={className}>
      <path d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z" />
      <path d="M19.2 13.3c.1-.4.1-.9.1-1.3s0-.9-.1-1.3l2-1.5-1.9-3.2-2.4 1a8.1 8.1 0 0 0-2.2-1.3L14.4 3h-4.8l-.4 2.7A8.1 8.1 0 0 0 7 7L4.7 6 2.8 9.2l2 1.5a8.9 8.9 0 0 0 0 2.6l-2 1.5L4.7 18l2.4-1a8.1 8.1 0 0 0 2.2 1.3l.4 2.7h4.8l.4-2.7A8.1 8.1 0 0 0 17 17l2.4 1 1.9-3.2-2.1-1.5Z" />
    </IconShell>
  );
}

export function CollapseIcon({ className }: IconProps): JSX.Element {
  return (
    <IconShell className={className}>
      <path d="m9 6 6 6-6 6" />
    </IconShell>
  );
}

export function ExpandIcon({ className }: IconProps): JSX.Element {
  return (
    <IconShell className={className}>
      <path d="M15 6 9 12l6 6" />
    </IconShell>
  );
}

export function CloseIcon({ className }: IconProps): JSX.Element {
  return (
    <IconShell className={className}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconShell>
  );
}

export function PlusIcon({ className }: IconProps): JSX.Element {
  return (
    <IconShell className={className}>
      <path d="M12 5v14M5 12h14" />
    </IconShell>
  );
}

export function MinusIcon({ className }: IconProps): JSX.Element {
  return (
    <IconShell className={className}>
      <path d="M5 12h14" />
    </IconShell>
  );
}

export function GripIcon({ className }: IconProps): JSX.Element {
  return (
    <IconShell className={className}>
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
    </IconShell>
  );
}
