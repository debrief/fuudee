/**
 * The playground's Catalogues panel, as the Catalogues panel model has it (webview/panels/catalogues.ts,
 * PAR-03): catalogue → plot → track, each row's label, detail, tooltip and what a screen reader hears,
 * its menu context (for its context menu, the action catalogue's), and choosing a plot opens it. A
 * branch opens and closes (the model says which start open, until the reader chooses otherwise).
 * With no catalogue, the welcome text. Only the artwork is the playground's own (host.css, by each
 * icon's codicon name). Nothing is added to what the model says, left out or reworded.
 */
import { inPlayground } from "../webview/panels/actions.js";
import { WELCOME, type CataloguesModel, type CataloguesNode, type CataloguesRow } from "../webview/panels/catalogues.js";

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

/** One row as a tree item, its children under it while it is open. */
function rowElement(model: CataloguesModel, node: CataloguesNode, level: number, open: Map<string, boolean>, choose: (row: CataloguesRow) => void): HTMLLIElement {
  const row = model.row(node);
  const li = document.createElement("li");
  li.setAttribute("role", "treeitem");
  li.className = `catalogues-${row.kind}${row.warning ? " warning" : ""}`;
  li.dataset.key = row.key;
  li.tabIndex = -1;
  li.setAttribute("aria-level", String(level));
  li.setAttribute("aria-label", row.aria);
  if (row.tooltip) li.title = row.tooltip;
  if (row.menu) li.dataset.menu = row.menu;
  const line = document.createElement("div");
  line.className = "row";
  const isOpen = row.branch && (open.get(row.key) ?? row.open);
  if (row.branch) {
    li.setAttribute("aria-expanded", String(isOpen));
    const fold = span("arrow", "");
    fold.setAttribute("aria-hidden", "true");
    fold.onclick = (event) => {
      event.stopPropagation();
      open.set(row.key, !isOpen);
      choose({ ...row, run: undefined });
    };
    line.append(fold);
  }
  const icon = span("icon", "");
  icon.dataset.icon = row.icon;
  icon.setAttribute("aria-hidden", "true"); // its artwork is host.css's, by its codicon's name
  line.append(icon, span("name", row.label));
  if (row.detail) line.append(" ", span("detail", row.detail));
  if (row.run) line.onclick = () => choose(row);
  li.append(line);
  if (isOpen) {
    const group = document.createElement("ul");
    group.setAttribute("role", "group");
    group.append(...model.children(node).map((child) => rowElement(model, child, level + 1, open, choose)));
    li.append(group);
  }
  return li;
}

/**
 * Fill the Catalogues' tree from the model. open: the branches the reader opened or closed, by key
 * (kept across fills); choose: a row chosen (its run, a plot opened), or a branch opened or closed
 * (no run: fill again). With no catalogue, the welcome text instead; act runs its links (those the
 * playground has: §5 keeps adding and creating catalogues to VS Code).
 */
export function fillCatalogues(list: HTMLElement, model: CataloguesModel, open: Map<string, boolean>, choose: (row: CataloguesRow) => void, act?: (action: string) => boolean): void {
  if (model.empty) {
    list.replaceChildren(
      ...WELCOME.filter((line) => !line.action || (act && inPlayground(line.action))).map((line) => {
        const li = document.createElement("li");
        li.className = "catalogues-welcome";
        if (line.action) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = line.text;
          button.onclick = () => act!(line.action!);
          li.append(button);
        } else li.textContent = line.text;
        return li;
      }),
    );
    return;
  }
  const rows = model.roots.map((node) => rowElement(model, node, 1, open, choose));
  // One tab stop: the first row, until another has the keyboard.
  if (rows[0]) rows[0].tabIndex = 0;
  list.replaceChildren(...rows);
}
