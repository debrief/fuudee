/**
 * The Outline as a tree (product owner, 27 Oct 2026): what is in sight of a tree whose
 * branches open and close, and what its keys do, free of the DOM so it can be tested.
 *
 * A TMA solution opens to its legs and each leg to its fixes; a sensor to its cuts, thousands
 * of them. Only the rows of open branches are listed (flatten), each with its level, its place
 * among its siblings and how many they are (aria-level, aria-posinset, aria-setsize), so a
 * screen reader hears where it is though only the rows in sight are in the page (rowsInWindow).
 * The keys are the WAI-ARIA tree's: Up and Down move the keyboard, Right opens a branch or goes
 * into it, Left closes it or goes to its parent, Home and End, Page Up and Page Down; Shift with
 * them extends the selection from where it started; Enter or Space selects the row, Ctrl with
 * them adds or takes it away, Shift with them the rows from the anchor; Ctrl+A every row in sight.
 */

/** A row of the tree: its key, whether it opens, and its children (made only when it is open). */
export interface TreeNode<T = unknown> {
  key: string;
  data: T;
  /** Whether it can open: it has, or may have, children. */
  branch: boolean;
  /** Its children, asked for only while it is open (a sensor's thousands of cuts). */
  children?: () => TreeNode<T>[];
}

/** A row as it is listed: its node and where it is in the tree. */
export interface FlatRow<T = unknown> {
  node: TreeNode<T>;
  key: string;
  /** From 1, as aria-level. */
  level: number;
  /** Its place among its siblings, from 1, and how many they are (aria-posinset, aria-setsize). */
  posinset: number;
  setsize: number;
  expanded: boolean;
  /** The row of its parent, or -1 at the top. */
  parent: number;
}

/** The rows of the open branches, in order, each with its place in the tree. */
export function flatten<T>(roots: TreeNode<T>[], open: ReadonlySet<string>): FlatRow<T>[] {
  const out: FlatRow<T>[] = [];
  const walk = (nodes: TreeNode<T>[], level: number, parent: number) => {
    nodes.forEach((node, i) => {
      const expanded = node.branch && open.has(node.key);
      const index = out.length;
      out.push({ node, key: node.key, level, posinset: i + 1, setsize: nodes.length, expanded, parent });
      if (expanded && node.children) walk(node.children(), level + 1, index);
    });
  };
  walk(roots, 1, -1);
  return out;
}

/** Up to this many rows the tree is drawn whole: a plot's features and a sensor or two of a few hundred cuts. */
export const DRAWN_WHOLE = 600;

/**
 * The rows in the page: every one up to `whole` rows; beyond, those in sight and some either side,
 * and the row with the keyboard, wherever it is (a sensor of thousands of cuts open).
 */
export function rowsInWindow(scrollTop: number, height: number, rowHeight: number, count: number, focus: number, overscan = 100, whole = DRAWN_WHOLE): number[] {
  if (count <= 0 || rowHeight <= 0) return [];
  if (count <= whole) return Array.from({ length: count }, (_, i) => i);
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(count - 1, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i);
  if (focus >= 0 && focus < count && (focus < first || focus > last)) {
    if (focus < first) out.unshift(focus);
    else out.push(focus);
  }
  return out;
}

/** A key as the tree reads it. */
export interface TreeKey {
  key: string;
  shift?: boolean;
  ctrl?: boolean;
}

/** What a key does: where the keyboard goes, the anchor a range runs from, the selection (keys), a branch opened or closed. */
export interface TreeMove {
  focus: number;
  anchor: number;
  select?: string[];
  open?: string;
  close?: string;
}

/** The keys of the rows from a to b, either order. */
export function rangeKeys(rows: readonly FlatRow[], a: number, b: number): string[] {
  const lo = Math.max(0, Math.min(a, b));
  const hi = Math.min(rows.length - 1, Math.max(a, b));
  const out: string[] = [];
  for (let i = lo; i <= hi; i++) out.push(rows[i].key);
  return out;
}

/**
 * What a key does in the tree, given where the keyboard is (focus), where a range starts
 * (anchor), what is selected and how many rows a page holds; undefined for a key the tree
 * leaves alone (Tab above all, so the keyboard is never trapped).
 */
export function treeKey(rows: readonly FlatRow[], focus: number, anchor: number, selected: readonly string[], key: TreeKey, page = 10): TreeMove | undefined {
  if (!rows.length) return undefined;
  const at = Math.max(0, Math.min(rows.length - 1, focus < 0 ? 0 : focus));
  const from = anchor < 0 ? at : anchor;
  const moves: Record<string, number> = {
    ArrowDown: at + 1,
    ArrowUp: at - 1,
    Home: 0,
    End: rows.length - 1,
    PageDown: at + page,
    PageUp: at - page,
  };
  if (key.key in moves && !key.ctrl) {
    const to = Math.max(0, Math.min(rows.length - 1, focus < 0 ? 0 : moves[key.key]));
    // Shift extends the selection from the anchor; alone, the keyboard moves and the selection stays.
    return key.shift ? { focus: to, anchor: from, select: rangeKeys(rows, from, to) } : { focus: to, anchor: to };
  }
  const row = rows[at];
  if (key.key === "ArrowRight") {
    if (row.node.branch && !row.expanded) return { focus: at, anchor: at, open: row.key };
    if (row.expanded && rows[at + 1]?.parent === at) return { focus: at + 1, anchor: at + 1 };
    return { focus: at, anchor: from };
  }
  if (key.key === "ArrowLeft") {
    if (row.expanded) return { focus: at, anchor: at, close: row.key };
    if (row.parent >= 0) return { focus: row.parent, anchor: row.parent };
    return { focus: at, anchor: from };
  }
  if (key.key === "Enter" || key.key === " ") {
    if (key.shift) return { focus: at, anchor: from, select: rangeKeys(rows, from, at) };
    if (key.ctrl) return { focus: at, anchor: at, select: selected.includes(row.key) ? selected.filter((k) => k !== row.key) : [...selected, row.key] };
    return { focus: at, anchor: at, select: [row.key] };
  }
  if ((key.key === "a" || key.key === "A") && key.ctrl) return { focus: at, anchor: 0, select: rows.map((r) => r.key) };
  return undefined;
}

/**
 * What a click does: alone, the row; with Ctrl (or Cmd), the row added or taken away; with
 * Shift, the rows from the anchor to it, a range of cuts among them.
 */
export function treeClick(rows: readonly FlatRow[], index: number, anchor: number, selected: readonly string[], click: { shift?: boolean; ctrl?: boolean }): TreeMove {
  const key = rows[index].key;
  if (click.shift) return { focus: index, anchor: anchor < 0 ? index : anchor, select: rangeKeys(rows, anchor < 0 ? index : anchor, index) };
  if (click.ctrl) return { focus: index, anchor: index, select: selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key] };
  return { focus: index, anchor: index, select: [key] };
}
