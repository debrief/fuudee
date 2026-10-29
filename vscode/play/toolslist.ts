/**
 * The playground's Tools panel, as the Tools panel model has it (webview/panels/tools.ts, PAR-03):
 * the status row, the sections with their counts (each a button that opens and closes it, open as
 * the model says it starts until the reader chooses otherwise), and each row's label, detail,
 * tooltip and what a screen reader hears. A tool offered and each of the Outline's entries are
 * buttons; an entry that cannot act stays reachable (aria-disabled), to say why when chosen; a tool
 * not offered is disabled. Only the artwork is the playground's own (host.css, by each icon's codicon name). Nothing is added to what the
 * model says, left out or reworded.
 */
import type { ToolsModel, ToolsNode, ToolsRow } from "../webview/panels/tools.js";

function iconOf(row: ToolsRow): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = "icon";
  icon.dataset.icon = row.icon;
  icon.setAttribute("aria-hidden", "true"); // its artwork is host.css's, by its codicon's name
  return icon;
}
function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

/** One row (not a section) as an element. */
export function toolsRowElement(row: ToolsRow, run: (row: ToolsRow) => void): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset.key = row.key;
  li.className = `tools-${row.kind}`;
  if (row.kind === "operation") {
    li.className = "outline-op";
    li.dataset.op = row.key.slice("operation:".length);
  }
  if (row.tooltip) li.title = row.tooltip;
  li.append(iconOf(row));
  if (row.kind === "operation" || row.kind === "tool") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = row.label;
    if (row.aria !== row.label) button.setAttribute("aria-label", row.aria);
    if (row.kind === "operation") {
      // Disabled with its reason, still reachable from the keyboard so the reason is read.
      button.setAttribute("aria-disabled", String(!row.enabled));
      if (!row.enabled) button.classList.add("disabled");
    } else button.disabled = !row.enabled;
    if (row.run) button.onclick = () => run(row);
    li.append(button);
  } else {
    li.append(span("name", row.label));
    if (row.aria !== row.label) li.setAttribute("aria-label", row.aria);
  }
  if (row.detail) li.append(" ", span("detail", row.detail));
  return li;
}

/**
 * Fill the Tools' list from the model. open: the sections the reader opened or closed, by key
 * (kept across fills); run: what choosing a row runs (its catalogued action).
 */
export function fillTools(list: HTMLElement, model: ToolsModel, open: Map<string, boolean>, run: (row: ToolsRow) => void): void {
  const section = (node: ToolsNode): HTMLLIElement => {
    const row = model.row(node);
    const li = document.createElement("li");
    li.className = "tools-section";
    li.dataset.key = row.key;
    const isOpen = open.get(row.key) ?? row.open;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "fold";
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", row.aria);
    toggle.append(span("arrow", ""), span("name", row.label), " ", span("detail", row.detail));
    const rows = document.createElement("ul");
    rows.className = "list tools-rows";
    rows.hidden = !isOpen;
    rows.append(...model.children(node).map((child) => toolsRowElement(model.row(child), run)));
    toggle.onclick = () => {
      const now = toggle.getAttribute("aria-expanded") !== "true";
      open.set(row.key, now);
      toggle.setAttribute("aria-expanded", String(now));
      rows.hidden = !now;
    };
    li.append(toggle, rows);
    return li;
  };
  list.replaceChildren(...model.roots.map((node) => (node.kind === "section" ? section(node) : toolsRowElement(model.row(node), run))));
}
