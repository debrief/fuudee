/**
 * The playground's History panel, as the History panel model has it (webview/panels/history.ts,
 * PAR-03): each step's name and detail (the step Ctrl+Z takes back next marked), its tooltip, and
 * its menu context, whose actions (Go back to this step, Redo up to this step) the host opens as
 * the row's context menu from the action catalogue, as VS Code does (PAR-07): right-click, press
 * and hold, Shift+F10 or the menu key. Only the artwork is the playground's own (host.css). Nothing is added
 * to what the model says, left out or reworded.
 */
import type { HistoryRow } from "../webview/panels/history.js";

/** One row as an element. */
export function historyRowElement(row: HistoryRow): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset.key = row.key;
  li.className = row.kind === "step" ? ["step", row.status, row.shown ? "shown" : "", row.muted ? "muted" : ""].filter(Boolean).join(" ") : "history-status";
  if (row.tooltip) li.title = row.tooltip;
  if (row.menu) {
    li.dataset.menu = row.menu;
    li.tabIndex = 0; // the keyboard reaches it, to open its menu
  }
  const icon = document.createElement("span");
  icon.className = "icon";
  icon.dataset.icon = row.icon;
  icon.setAttribute("aria-hidden", "true"); // its artwork is host.css's, by its codicon's name
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = row.label;
  li.append(icon, name);
  if (row.detail) {
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = row.detail;
    li.append(" ", detail);
  }
  return li;
}

/** Fill History's list from the model's rows. */
export function fillHistory(list: HTMLElement, rows: readonly HistoryRow[]): void {
  list.replaceChildren(...rows.map(historyRowElement));
}
