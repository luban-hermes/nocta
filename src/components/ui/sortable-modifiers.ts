import type { Modifier } from "@dnd-kit/core";
// tiny copies of @dnd-kit/modifiers (avoids one more dependency)
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
export const restrictToHorizontalAxis: Modifier = ({ transform }) => ({ ...transform, y: 0 });
