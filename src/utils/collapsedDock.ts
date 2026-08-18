import type { CollapsedDockSide } from "../content/types";

const DRAG_THRESHOLD_PX = 6;
const MIN_DOCK_Y_RATIO = 0.08;
const MAX_DOCK_Y_RATIO = 0.92;
const COLLAPSED_DOCK_HEIGHT_PX = 48;

interface Point {
  x: number;
  y: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

export interface CollapsedDockPlacement {
  side: CollapsedDockSide;
  yRatio: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function didCollapsedDockDrag(start: Point, current: Point): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > DRAG_THRESHOLD_PX;
}

export function calculateCollapsedDockPlacement(
  pointer: Point,
  viewport: ViewportSize
): CollapsedDockPlacement {
  const safeWidth = Math.max(1, viewport.width);
  const safeHeight = Math.max(1, viewport.height);
  if (safeHeight <= COLLAPSED_DOCK_HEIGHT_PX) {
    return {
      side: pointer.x < safeWidth / 2 ? "left" : "right",
      yRatio: 0.5
    };
  }

  const tabHalfHeightRatio = COLLAPSED_DOCK_HEIGHT_PX / 2 / safeHeight;
  const minRatio = Math.max(MIN_DOCK_Y_RATIO, tabHalfHeightRatio);
  const maxRatio = Math.min(MAX_DOCK_Y_RATIO, 1 - tabHalfHeightRatio);
  return {
    side: pointer.x < safeWidth / 2 ? "left" : "right",
    yRatio: clamp(pointer.y / safeHeight, minRatio, maxRatio)
  };
}

export function shouldSuppressCollapsedDockClick(dragged: boolean, pointerCancelled: boolean): boolean {
  return dragged && !pointerCancelled;
}

export function calculatePanelWidth(
  startWidth: number,
  startX: number,
  currentX: number,
  side: CollapsedDockSide,
  viewportWidth: number
): number {
  const delta = side === "right" ? startX - currentX : currentX - startX;
  return clamp(startWidth + delta, 300, Math.min(720, viewportWidth - 24));
}
