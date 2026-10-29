/**
 * A row of the playground's Outline, as the Outline panel model has it (webview/panels/outline.ts,
 * PAR-03): its icon, its label and its detail, its tooltip, what a screen reader hears and whether
 * it is selected. Only the artwork is the playground's own: a codicon's name drawn as a glyph.
 * Nothing is added to what the model says, left out or reworded.
 */
import type { OutlineRow } from "../webview/panels/outline.js";

/** The playground's artwork for each codicon the Outline names (cosmetic: VS Code draws the codicon). */
export const ICON_GLYPHS: Record<string, string> = {
  pulse: "〰",
  "radio-tower": "⌁",
  dash: "─",
  "primitive-square": "▢",
  "circle-large-outline": "◯",
  "circle-large": "⬭",
  "symbol-text": "T",
  location: "⌖",
  note: "✎",
  compass: "✦",
  circle: "○",
  "comment-discussion": "❝",
  lock: "⊝",
  file: "▤",
  "list-flat": "☰",
  "git-commit": "⊸",
  "circle-small-filled": "•",
  "eye-closed": "◌",
  question: "?",
  "arrow-small-right": "→",
};

/** Fill a row's element (its twisty already in it) with what the model says. */
export function fillOutlineRow(row: OutlineRow, li: HTMLLIElement): void {
  li.className = [row.feature ?? row.kind, row.kind === "cut" && row.hidden ? "hidden-cut" : "", row.selected ? "selected" : ""].filter(Boolean).join(" ");
  li.setAttribute("aria-selected", String(row.selected));
  li.setAttribute("aria-label", row.aria);
  if (row.tooltip) li.title = row.tooltip;
  else li.removeAttribute("title");
  if (row.icon) {
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.dataset.icon = row.icon;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ICON_GLYPHS[row.icon] ?? "";
    li.append(icon, " ");
  }
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = row.label;
  li.append(name);
  if (row.detail) {
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = row.detail;
    li.append(" ", detail);
  }
}
