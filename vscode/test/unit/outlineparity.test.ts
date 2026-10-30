/**
 * The panels' parity (PAR-16, docs/panel-parity-srd.md Appendix C): the Outline, the Tools and History.
 *
 * The Outline's: for each sample plot, serial 1
 * and serial 1 after Bearings and TMA's steps, in each state that applies to the Outline, the
 * panel model is built and rendered by both front ends: VS Code's OutlineProvider (its tree items:
 * label, description, tooltip, screen reader's label, collapsible state) and the playground's
 * (the tree's rows: aria-level, aria-posinset, aria-setsize, aria-expanded, and fillOutlineRow's
 * text, title, aria-label and aria-selected). Both shall describe the same rows, in the same order.
 *
 * The Tools' and History's (panel parity phase 3): in each state of Appendix C that applies to them,
 * the Tools panel model and the History panel model are built and rendered by VS Code's
 * ToolsProvider and HistoryProvider (label, description, tooltip, screen reader's label, icon,
 * collapsible state, command, context menu) and by the playground's renderers (play/toolslist.ts,
 * play/historylist.ts: the same, from the list's elements). Both shall describe the same rows.
 *
 * The Catalogues' (panel parity phase 4): in each state of Appendix C that applies to them (no plot
 * open with catalogues listed, a plot open, an earlier revision shown, Python or the service
 * starting) and with collation's marks (new data, a link proposed, a plot flagged for review), the
 * Catalogues panel model is built from the catalogues on disk and rendered by VS Code's
 * CataloguesProvider and the playground's renderer (play/cataloguelist.ts): the same rows, menus and
 * title bar, but what §5 keeps to VS Code (adding, creating and refreshing catalogues).
 *
 * The samples are built by the sample's own Python (debrief_sample), as the extension's tests read
 * a catalogue Python wrote; the tools, which are offered for each selection, and each plot's
 * history are Python's too (debrief_tools.entries, PAR-15).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DebriefFeatureCollection, StacItem } from "@debrief/schemas";

// VS Code's tree item, as much of it as the Outline sets.
vi.mock("vscode", () => {
  class TreeItem {
    id?: string;
    description?: string;
    tooltip?: string;
    iconPath?: unknown;
    contextValue?: string;
    command?: { command: string; arguments?: unknown[] };
    resourceUri?: unknown;
    accessibilityInformation?: { label: string };
    constructor(
      public label: string,
      public collapsibleState = 0,
    ) {}
  }
  class EventEmitter<T> {
    private listeners: ((e: T) => void)[] = [];
    event = (listener: (e: T) => void) => this.listeners.push(listener);
    fire(e: T) {
      for (const l of this.listeners) l(e);
    }
  }
  class ThemeIcon {
    constructor(
      public id: string,
      public color?: unknown,
    ) {}
  }
  class ThemeColor {
    constructor(public id: string) {}
  }
  class MarkdownString {
    constructor(public value: string) {}
  }
  return { TreeItem, EventEmitter, ThemeIcon, ThemeColor, MarkdownString, TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 }, Uri: { file: (p: string) => ({ fsPath: p }) } };
});

const { OutlineProvider } = await import("../../src/views/outline.js");
const { filesOf, NO_PLOT, OutlineModel, CUT_PAGE } = await import("../../webview/panels/outline.js");
const { fillOutlineRow } = await import("../../play/outlinerow.js");
const { flatten } = await import("../../webview/outlinetree.js");
const { rowMenu } = await import("../../webview/panels/actions.js");
const { toteMenu, toteOf } = await import("../../webview/totelogic.js");
type OutlineNode = import("../../webview/panels/outline.js").OutlineNode;
type OutlineInput = import("../../webview/panels/outline.js").OutlineInput;
type TreeNode = import("../../webview/outlinetree.js").TreeNode<OutlineNode>;

// --- A page, as much of one as fillOutlineRow writes to -------------------------------------------

class FakeElement {
  className = "";
  hidden = false;
  disabled = false;
  type = "";
  tabIndex = -1;
  onclick: unknown = null;
  readonly classList = { add: (c: string) => void (this.className = `${this.className} ${c}`.trim()) };
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: (FakeElement | string)[] = [];
  private text = "";
  constructor(readonly tagName: string) {}
  get title() {
    return this.attributes.get("title") ?? "";
  }
  set title(value: string) {
    this.attributes.set("title", value);
  }
  get textContent(): string {
    return this.text + this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join("");
  }
  set textContent(value: string) {
    this.text = value;
    this.children.length = 0;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  append(...nodes: (FakeElement | string)[]) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: (FakeElement | string)[]) {
    this.children.length = 0;
    this.text = "";
    this.children.push(...nodes);
  }
  /** Its element children. */
  get elements(): FakeElement[] {
    return this.children.filter((c): c is FakeElement => typeof c !== "string");
  }
  find(className: string): FakeElement | undefined {
    for (const c of this.children) {
      if (typeof c === "string") continue;
      if (c.className.split(" ").includes(className)) return c;
      const inner = c.find(className);
      if (inner) return inner;
    }
    return undefined;
  }
}
(globalThis as unknown as { document: unknown }).document = { createElement: (tag: string) => new FakeElement(tag) };

// --- The samples ---------------------------------------------------------------------------------

const repo = path.resolve(__dirname, "..", "..", "..");
const python = process.env.DEBRIEF_PYTHON || path.join(repo, ".venv", "bin", "python");
const work = mkdtempSync(path.join(tmpdir(), "debrief-parity-"));
execFileSync(python, [
  "-c",
  "import sys; from pathlib import Path; from debrief_stac import Catalogue; " +
    "from debrief_sample.walkthrough import copy_for_tour, play_tma; root = Path(sys.argv[1]); " +
    "import subprocess; subprocess.run([sys.executable, '-m', 'debrief_sample', 'build', str(root / 'sample')], check=True, stdout=subprocess.DEVNULL); " +
    "t = Catalogue.create(root / 'tma', 'tma', 'TMA', 'Parity'); item = copy_for_tour(t, root / 'sample', 'tma'); play_tma(t, item); print(item)",
  work,
]);
const read = (folder: string, item: string): OutlineInput => {
  const stac = JSON.parse(readFileSync(path.join(work, folder, item, `${item}.json`), "utf8")) as StacItem;
  const plot = JSON.parse(readFileSync(path.join(work, folder, item, "plot.geojson"), "utf8")) as DebriefFeatureCollection;
  return { plot, files: filesOf(stac, (asset) => asset.href) };
};
const SAMPLES: Record<string, OutlineInput> = { "serial-1": read("sample", "serial-1"), "the TMA sample": read("tma", "serial-1-tma") };

type Feature = DebriefFeatureCollection["features"][number];
const withFeatures = (input: OutlineInput, change: (features: Feature[]) => Feature[]): OutlineInput => ({ ...input, plot: { ...input.plot, features: change(structuredClone(input.plot.features)) } });
const hide = (input: OutlineInput, ids: string[]) =>
  withFeatures(input, (fs) => fs.map((f) => (ids.includes(f.id) ? ({ ...f, properties: { ...f.properties, hidden: true } } as Feature) : f)));
/** A sensor of more than CUT_PAGE cuts on BLUE ONE: the Bow sonar's cuts, again and again, a second apart. */
const BIG = "sensor-blue-one-big";
const withBigSensor = (input: OutlineInput) =>
  withFeatures(input, (fs) => {
    const bow = fs.find((f) => f.id === "sensor-blue-one-bow-sonar")!;
    const cuts = fs.filter((f) => f.properties.kind === "sensor_cut" && (f.properties as { sensor_id: string }).sensor_id === bow.id);
    const start = Date.parse((cuts[0].properties as { time: string }).time);
    const big = Array.from({ length: 2 * CUT_PAGE + 200 }, (_, i) => {
      const cut = structuredClone(cuts[i % cuts.length]) as Feature & { properties: { time: string; sensor_id: string } };
      return { ...cut, id: `${BIG}-cut-${i}`, properties: { ...cut.properties, sensor_id: BIG, time: new Date(start + i * 1000).toISOString() } } as Feature;
    });
    return [...fs, { ...structuredClone(bow), id: BIG, properties: { ...bow.properties, name: "Big array" } } as Feature, ...big];
  });

interface State {
  input?: OutlineInput;
  selected?: string[];
  /** Rows to bring into sight: their branches opened, as revealing a selection does. */
  reveal?: string[];
  /** Branches opened by the analyst. */
  open?: string[];
}

/** Appendix C's states, for a sample: those that apply to the Outline (menus and enablement are Phase 2's). */
function statesOf(sample: OutlineInput): Record<string, State | undefined> {
  const index = new OutlineModel(sample).index!;
  const solution = [...index.solutions.keys()][0];
  const towed = index.sensors.get("sensor-blue-one-towed-array")!;
  const big = withBigSensor(sample);
  return {
    "1. no plot open": {},
    "2. a plot open, nothing selected": { input: sample },
    "3. one track selected": { input: sample, selected: ["track-blue-one"] },
    "4. two tracks selected": { input: sample, selected: ["track-blue-one", "track-red-one"] },
    "5. a sensor of more than 500 cuts, opened": { input: big, open: [BIG, `${BIG}#page${CUT_PAGE}`], selected: [`${BIG}-cut-${CUT_PAGE + 3}`], reveal: [`${BIG}-cut-${CUT_PAGE + 3}`] },
    "6. a cut selected": { input: sample, selected: [towed.cuts[2].id], reveal: [towed.cuts[2].id] },
    "7. a TMA solution's leg selected": solution ? { input: sample, selected: [`${solution}#leg2`], reveal: [`${solution}#fix0`, `${solution}#leg2`] } : undefined,
    "8. an annotation selected": { input: sample, selected: ["annotation-exercise-area"] },
    "9. a hidden feature selected": { input: hide(sample, ["track-ais-cargo-01"]), selected: ["track-ais-cargo-01"] },
    "10. hidden and shown features selected": { input: hide(sample, ["track-ais-cargo-01"]), selected: ["track-ais-cargo-01", "track-red-one"] },
    // An earlier revision is a plot like any other to the Outline: what it may do is Phase 2's (menus).
    "11. an earlier revision shown": { input: sample, selected: ["track-blue-one"] },
    // Python (the playground) or the service (VS Code) still starting: no plot open yet.
    "12. Python or the service still starting": {},
  };
}

// --- The two renderers ---------------------------------------------------------------------------

interface Said {
  key: string;
  level: number;
  label: string;
  description: string;
  tooltip: string;
  aria: string;
  expanded?: boolean;
  selected: boolean;
  /** Its context menu: each entry's title, "(disabled)" where it cannot run, and "—" between groups. */
  menu: string[];
}

// --- Menus: VS Code's from package.json as shipped, the playground's from the action catalogue --------

const manifest = JSON.parse(readFileSync(path.join(repo, "vscode", "package.json"), "utf8")) as {
  contributes: { commands: { command: string; title: string; enablement?: string }[]; menus: Record<string, { command: string; when?: string; group?: string }[]> };
};
/** The context keys VS Code sets for a state (the plot open, the Tote's entries for the selection). */
function contextOf(state: State): Record<string, string | boolean> {
  if (!state.input) return {};
  const tote = toteMenu(toteOf(state.input.plot), (state.selected ?? []).filter((id) => state.input!.plot.features.some((f) => f.id === id && f.properties.kind === "track")));
  return { "debrief.plotOpen": true, "debrief.toteCanAdd": tote.canAdd, "debrief.toteCanRemove": tote.canRemove, "debrief.toteCanSetPrimary": !tote.primaryReason };
}
/** A when clause, read as VS Code reads the forms package.json uses: terms joined by &&. */
function whenHolds(clause: string | undefined, context: Record<string, string | boolean | undefined>): boolean {
  if (!clause) return true;
  return clause.split(" && ").every((term) => {
    let m: RegExpExecArray | null;
    if (term === "false") return false;
    if ((m = /^!(\S+)$/.exec(term))) return !context[m[1]];
    if ((m = /^(\S+) == (.+)$/.exec(term))) return String(context[m[1]]) === m[2].replace(/^'(.*)'$/, "$1");
    if ((m = /^(\S+) != (.+)$/.exec(term))) return String(context[m[1]]) !== m[2].replace(/^'(.*)'$/, "$1");
    if ((m = /^(\S+) =~ \/(.+)\/$/.exec(term))) return context[m[1]] !== undefined && new RegExp(m[2]).test(String(context[m[1]]));
    return !!context[term];
  });
}
/** A row's menu as VS Code draws it: the view/item/context entries whose when holds, sorted by group, order and title. */
function vscodeMenu(contextValue: string | undefined, context: Record<string, string | boolean>, view = "debrief.outline"): string[] {
  const keys = { ...context, view, viewItem: contextValue };
  const entries = manifest.contributes.menus["view/item/context"]
    .filter((e) => contextValue !== undefined && whenHolds(e.when, keys))
    .map((e) => {
      const command = manifest.contributes.commands.find((c) => c.command === e.command)!;
      const [group = "", order = "0"] = (e.group ?? "").split("@");
      return { group, order: Number(order), title: command.title, enabled: whenHolds(command.enablement, keys) };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.order - b.order || a.title.localeCompare(b.title));
  return said(entries);
}
/** A view's title bar as VS Code draws it: the view/title entries whose when holds, buttons first, then by group, order and title. */
function vscodeTitle(view: string, context: Record<string, string | boolean>): string[] {
  const keys = { ...context, view };
  const rank = (g: string) => (g === "navigation" ? "" : g || "~");
  const entries = manifest.contributes.menus["view/title"]
    .filter((e) => whenHolds(e.when, keys))
    .map((e) => {
      const command = manifest.contributes.commands.find((c) => c.command === e.command)!;
      const [group = "", order = "0"] = (e.group ?? "").split("@");
      return { group, order: Number(order), title: command.title, enabled: whenHolds(command.enablement, keys) };
    })
    .sort((a, b) => rank(a.group).localeCompare(rank(b.group)) || a.order - b.order || a.title.localeCompare(b.title));
  return said(entries);
}
const said = (entries: { group: string; title: string; enabled: boolean }[]) =>
  entries.flatMap((e, i) => [...(i > 0 && e.group !== entries[i - 1].group ? ["—"] : []), `${e.title}${e.enabled ? "" : " (disabled)"}`]);

/** VS Code: the tree items of the open branches, as the native tree shows them. */
function vscodeRows(state: State): Said[] {
  let fire: ((opened: unknown) => void) | undefined;
  const session = { onPlot: (listener: (opened: unknown) => void) => (fire = listener) };
  const provider = new OutlineProvider(session as never);
  fire!(state.input);
  for (const key of [...(state.open ?? []), ...(state.reveal ?? []).flatMap((k) => [...new OutlineModel(state.input).ancestors(k)])]) {
    const node = provider.nodeOf(key);
    if (node) provider.setExpanded(node, true);
  }
  provider.markKeys(state.selected ?? []);
  const out: Said[] = [];
  const walk = (nodes: OutlineNode[], level: number) => {
    for (const node of nodes) {
      const item = provider.getTreeItem(node);
      const expanded = item.collapsibleState === 2;
      const icon = item.iconPath as { color?: unknown } | undefined;
      out.push({
        key: String(item.id),
        level,
        label: String(item.label),
        description: String(item.description ?? ""),
        tooltip: String(item.tooltip ?? ""),
        aria: item.accessibilityInformation!.label,
        ...(item.collapsibleState !== 0 && { expanded }),
        // A selected row is marked in its description and its icon's colour.
        selected: / ?selected( · |$)/.test(String(item.description)) && (!icon || !!icon.color),
        menu: vscodeMenu(item.contextValue, contextOf(state)),
      });
      if (expanded) walk(provider.getChildren(node), level + 1);
    }
  };
  walk(provider.getChildren(), 1);
  return out;
}

/** The playground: the tree's rows of the open branches, each filled by fillOutlineRow. */
function playgroundRows(state: State): Said[] {
  const model = new OutlineModel(state.input);
  const nodes = new Map<string, TreeNode>();
  const treeNode = (node: OutlineNode): TreeNode => {
    let made = nodes.get(node.key);
    if (!made) nodes.set(node.key, (made = { key: node.key, data: node, branch: model.row(node, new Set()).branch, children: () => model.children(node).map(treeNode) }));
    return made;
  };
  const open = new Set([...model.startOpen(), ...(state.open ?? []), ...(state.reveal ?? []).flatMap((k) => model.ancestors(k))]);
  const chosen = new Set(state.selected ?? []);
  return flatten(model.roots.map(treeNode), open).map((row) => {
    const li = new FakeElement("li");
    // What OutlineTree sets on each row before the host fills it.
    li.setAttribute("aria-level", String(row.level));
    li.setAttribute("aria-posinset", String(row.posinset));
    li.setAttribute("aria-setsize", String(row.setsize));
    if (row.node.branch) li.setAttribute("aria-expanded", String(row.expanded));
    fillOutlineRow(model.row(row.node.data, chosen), li as unknown as HTMLLIElement);
    return {
      key: row.key,
      level: Number(li.getAttribute("aria-level")),
      label: li.find("name")!.textContent,
      description: li.find("detail")?.textContent ?? "",
      tooltip: li.title,
      aria: li.getAttribute("aria-label")!,
      ...(li.getAttribute("aria-expanded") && { expanded: li.getAttribute("aria-expanded") === "true" }),
      selected: li.getAttribute("aria-selected") === "true" && li.className.split(" ").includes("selected"),
      // The menu the playground opens on it (host.ts outlineRowMenu): the catalogue's for its menu context.
      menu: said(rowMenu("debrief.outline", model.row(row.node.data, chosen).menu, contextOf(state))),
    };
  });
}

// --- Parity --------------------------------------------------------------------------------------

describe("the Outline in both front ends (PAR-16)", { timeout: 60_000 }, () => {
  for (const [name, sample] of Object.entries(SAMPLES)) {
    describe(name, () => {
      for (const [stateName, state] of Object.entries(statesOf(sample))) {
        if (!state) continue;
        it(stateName, () => {
          const vscode = vscodeRows(state);
          const play = playgroundRows(state);
          expect(play).toEqual(vscode);
          // Every selected row is said selected in both, and only those.
          expect(vscode.filter((r) => r.selected).map((r) => r.key)).toEqual(
            vscode.map((r) => r.key).filter((k) => (state.selected ?? []).includes(k)),
          );
          if (!state.input) expect(vscode).toEqual([]);
        });
      }
    });
  }

  it("says the same with no plot open: VS Code's welcome view is the model's", () => {
    const manifest = JSON.parse(readFileSync(path.join(repo, "vscode", "package.json"), "utf8")) as { contributes: { viewsWelcome: { view: string; contents: string }[] } };
    expect(manifest.contributes.viewsWelcome.find((w) => w.view === "debrief.outline")?.contents).toBe(NO_PLOT);
    expect(new OutlineModel().emptyText).toBe(NO_PLOT);
  });
});

// --- What the model decides ----------------------------------------------------------------------

describe("the Outline panel model", () => {
  const serial = SAMPLES["serial-1"];
  const tma = SAMPLES["the TMA sample"];
  const said = (input: OutlineInput, key: string, selected: string[] = []) => {
    const model = new OutlineModel(input);
    return model.row(model.node(key)!, new Set(selected));
  };

  it("has three sections; the plot's features in groups with counts, then the narrative", () => {
    const model = new OutlineModel(serial);
    expect(model.roots.map((n) => model.row(n, new Set()).label)).toEqual(["Plot features", "Supporting files", "Reference data"]);
    const groups = model.children(model.roots[0]).map((n) => model.row(n, new Set()));
    expect(groups.map((r) => [r.label, r.detail])).toEqual([
      ["Tracks", "10"],
      ["Annotations", "1"],
      ["Narrative", expect.stringMatching(/^33 entries from \d+ sources?$/)],
    ]);
    expect(model.children(model.roots[2]).map((n) => model.row(n, new Set()).label)).toEqual(["None yet"]);
    expect(model.children(model.roots[1]).map((n) => model.row(n, new Set()).detail)).toContain("source");
  });

  it("puts a sensor under its host track, the track open, the sensor closed until opened", () => {
    const model = new OutlineModel(serial);
    const blue = model.node("track-blue-one")!;
    expect(model.children(blue).map((n) => n.key)).toEqual(["sensor-blue-one-bow-sonar", "sensor-blue-one-towed-array"]);
    expect(model.row(blue, new Set()).open).toBe(true);
    expect(model.row(model.node("sensor-blue-one-bow-sonar")!, new Set())).toMatchObject({ branch: true, lazy: true, open: false, detail: expect.stringMatching(/^261 cuts/) });
    expect(model.ancestors("sensor-blue-one-bow-sonar")).toEqual(["section:features", "group:tracks", "track-blue-one"]);
  });

  it("opens a sensor of more than 500 cuts to pages of 500, by time", () => {
    const model = new OutlineModel(withBigSensor(serial));
    const pages = model.children(model.node(BIG)!);
    expect(pages.map((p) => model.row(p, new Set()).detail)).toEqual(["cuts 1–500 of 1,200", "cuts 501–1,000 of 1,200", "cuts 1,001–1,200 of 1,200"]);
    expect(model.ancestors(`${BIG}-cut-700`)).toEqual(["section:features", "group:tracks", "track-blue-one", BIG, `${BIG}#page500`]);
  });

  it("tags a row in one order: TMA · contact · DR · selected · hidden on map · when", () => {
    const solution = [...new OutlineModel(tma).index!.solutions.keys()][0];
    const row = said(hide(tma, [solution]), solution, [solution]);
    expect(row.tags).toEqual(["TMA", "Contact 1", "selected", "hidden on map"]);
    expect(row.detail).toMatch(/^TMA · Contact 1 · selected · hidden on map · \d\d:\d\d:\d\dZ – \d\d:\d\dZ?/);
    expect(row.menu).toBe("feature-track-tma-hidden");
    const legs = new OutlineModel(tma).children(new OutlineModel(tma).node(solution)!);
    expect(legs.map((l) => l.kind)).toEqual(legs.map(() => "leg"));
  });

  it("says an annotation's time or period when it has no times", () => {
    const note = withFeatures(serial, (fs) => [
      ...fs,
      { type: "Feature", id: "annotation-note", geometry: null, properties: { kind: "annotation", name: "Wheel over", shape: "note", time: "2023-06-15T09:30:00.000Z" } } as unknown as Feature,
    ]);
    expect(said(note, "annotation-note").detail).toBe("09:30:00Z");
  });

  it("keeps a track's labels, symbols and arrows in its tooltip, for both front ends, not a line of its own", () => {
    expect(said(serial, "track-blue-one").tooltip).toMatch(/\nLabels .* · Symbols .* · Arrows /);
  });
});

// --- The Tools and History (panel parity phase 3) ------------------------------------------------------

const { ToolsProvider } = await import("../../src/views/tools.js");
const { HistoryProvider } = await import("../../src/views/history.js");
const { NEEDS_SERVICE } = await import("../../webview/panels/history.js");
const { fillTools } = await import("../../play/toolslist.js");
const { fillHistory } = await import("../../play/historylist.js");
const { operationsFor } = await import("../../webview/panels/flows/operation.js");
const { featureIdsOfPicks, pickOf } = await import("../../webview/outlinemodel.js");
const { titleMenu } = await import("../../webview/panels/actions.js");
type ToolDeclaration = import("@debrief/schemas").ToolDeclaration;
type HistoryStep = import("../../src/service.js").HistoryStep;
type OutlinePick = import("../../webview/outlinemodel.js").OutlinePick;

/** Python's: the tools (as the playground and the service list them), which are offered for each selection asked, and each sample's history (debrief_tools.entries, PAR-15). */
function fromPython(kinds: string[][]): { tools: ToolDeclaration[]; offered: string[][]; history: Record<string, HistoryStep[]> } {
  const script = `
import json, sys
from pathlib import Path
from debrief_schemas import DocumentKind, dump_document
from debrief_stac import Catalogue
from debrief_tools import Registry
from debrief_tools.entries import history_steps, offered_tools
registry = Registry.discover()
if not registry.tools:
    registry = Registry.discover(["debrief_tools.core"])
declarations = {n: t.declaration for n, t in registry.tools.items()}
root = Path(sys.argv[1])
print(json.dumps({
    "tools": [json.loads(dump_document(DocumentKind.TOOL_DECLARATION, d)) for d in declarations.values()],
    "offered": [offered_tools(declarations, k) for k in json.loads(sys.argv[2])],
    "history": {
        "serial-1": history_steps(Catalogue.open(root / "sample").history("serial-1")),
        "the TMA sample": history_steps(Catalogue.open(root / "tma").history("serial-1-tma")),
    },
}))`;
  return JSON.parse(execFileSync(python, ["-c", script, work, JSON.stringify(kinds)], { encoding: "utf8" }));
}

interface PanelState {
  input?: OutlineInput;
  /** The Outline's rows chosen. */
  selected?: string[];
  readOnly?: boolean;
  /** The tool service (or Python) still starting. */
  starting?: boolean;
  problem?: string;
}

/** Appendix C's states that apply to the Tools, for a sample. */
function toolsStatesOf(sample: OutlineInput): Record<string, PanelState | undefined> {
  const index = new OutlineModel(sample).index!;
  const solution = [...index.solutions.keys()][0];
  const towed = index.sensors.get("sensor-blue-one-towed-array")!;
  const hidden = hide(sample, ["track-ais-cargo-01"]);
  return {
    "1. no plot open": {},
    "2. a plot open, nothing selected": { input: sample },
    "3. one track selected": { input: sample, selected: ["track-blue-one"] },
    "4. two tracks selected": { input: sample, selected: ["track-blue-one", "track-red-one"] },
    "6. a cut selected": { input: sample, selected: [towed.cuts[2].id] },
    "7. a TMA solution's leg selected": solution ? { input: sample, selected: [`${solution}#leg2`] } : undefined,
    "8. an annotation selected": { input: sample, selected: ["annotation-exercise-area"] },
    "9. a hidden feature selected": { input: hidden, selected: ["track-ais-cargo-01"] },
    "10. hidden and shown features selected": { input: hidden, selected: ["track-ais-cargo-01", "track-red-one"] },
    "11. an earlier revision shown": { input: sample, selected: [towed.cuts[2].id], readOnly: true },
    "12. Python or the service still starting": { input: sample, starting: true },
    "the tool service stopped": { input: sample, problem: "The tool service stopped. Run 'Debrief: Restart tool service'." },
  };
}

/** A tool library found but not offered, as tools/list reports one: "Not available" lists it, with why. */
const BROKEN = { library: "scientist_library", tool: null, reason: "The library could not be loaded: No module named 'numpy'" };

interface ToolsSaid {
  level: number;
  label: string;
  description: string;
  tooltip: string;
  aria: string;
  icon: string;
  expanded?: boolean;
  /** What choosing it runs: the command and its arguments, or "". */
  run: string;
}

/** The Tools as each front end is given them: the selection's features, the tools offered for their kinds (Python's), the Outline's entries. */
function selectionOf(state: PanelState): { ids: string[]; kinds: string[] } {
  const index = state.input ? new OutlineModel(state.input).index! : undefined;
  const picks = index ? (state.selected ?? []).map((k) => pickOf(index, k)).filter((p): p is OutlinePick => !!p) : [];
  const ids = featureIdsOfPicks(picks);
  return { ids, kinds: ids.map((id) => state.input!.plot.features.find((f) => f.id === id)?.properties.kind ?? "") };
}
function toolsInputOf(state: PanelState, python: (kinds: string[]) => string[]) {
  const index = state.input ? new OutlineModel(state.input).index! : undefined;
  const { ids, kinds } = selectionOf(state);
  return {
    ids,
    listing: state.starting ? undefined : { tools: TOOLS, unavailable: [BROKEN] },
    offered: python(kinds),
    operations: state.starting ? [] : operationsFor({ index, keys: state.selected ?? [], readOnly: state.readOnly }),
  };
}

/** VS Code: the tree items of the open sections. */
function vscodeTools(state: PanelState, python: (kinds: string[]) => string[]): ToolsSaid[] {
  const given = toolsInputOf(state, python);
  const session = { current: state.input, selection: given.ids };
  const provider = new ToolsProvider(session as never, () => given.operations);
  provider.update(given.listing, given.offered, state.problem);
  const out: ToolsSaid[] = [];
  const walk = (nodes: ReturnType<typeof provider.getChildren>, level: number) => {
    for (const node of nodes) {
      const item = provider.getTreeItem(node);
      const tooltip = item.tooltip as unknown as string | { value: string } | undefined;
      // A tool's tooltip is Markdown: its title in bold, its judgement in italics (cosmetic), the words the same.
      const words = typeof tooltip === "object" ? tooltip.value.replace(/^\*\*(.*?)\*\*/, "$1").replace(/\n\n_(.*)_$/s, "\n\n$1") : (tooltip ?? "");
      const expanded = item.collapsibleState === 2;
      out.push({
        level,
        label: String(item.label),
        description: String(item.description ?? ""),
        tooltip: words,
        aria: item.accessibilityInformation!.label,
        icon: (item.iconPath as { id: string } | undefined)?.id ?? "",
        ...(item.collapsibleState !== 0 && { expanded }),
        run: item.command ? `${item.command.command}(${(item.command.arguments ?? []).join()})` : "",
      });
      if (expanded) walk(provider.getChildren(node), level + 1);
    }
  };
  walk(provider.getChildren(), 1);
  return out;
}

/** The playground: the Tools' list as fillTools fills it, the closed sections' rows not shown. */
function playgroundTools(state: PanelState, python: (kinds: string[]) => string[]): ToolsSaid[] {
  const given = toolsInputOf(state, python);
  const { ToolsModel } = toolsModule;
  const model = new ToolsModel({ listing: given.listing, problem: state.problem, plotOpen: !!state.input, selected: given.ids.length, offered: given.offered, operations: given.operations });
  const list = new FakeElement("ul");
  const runs: string[] = [];
  fillTools(list as unknown as HTMLElement, model, new Map(), (row) => runs.push(row.key));
  const out: ToolsSaid[] = [];
  const rowOf = (li: FakeElement, level: number): ToolsSaid => {
    const button = li.elements.find((e) => e.tagName === "button");
    const icon = li.find("icon");
    // Choosing it: the row's run, if its button acts (a disabled entry still acts, to say why; a tool not offered does not).
    let run = "";
    if (button?.onclick && !button.disabled) {
      runs.length = 0;
      (button.onclick as () => void)();
      const row = model.rows().find((r) => r.key === runs[0]);
      run = row?.run ? `${row.run.action}(${row.run.args.join()})` : "";
    }
    return {
      level,
      label: button ? button.textContent : li.find("name")!.textContent,
      description: li.find("detail")?.textContent ?? "",
      tooltip: li.title,
      aria: button?.getAttribute("aria-label") ?? li.getAttribute("aria-label") ?? (button ? button.textContent : li.find("name")!.textContent),
      icon: icon?.dataset.icon ?? "",
      run,
    };
  };
  for (const li of list.elements) {
    if (li.className !== "tools-section") {
      out.push(rowOf(li, 1));
      continue;
    }
    const toggle = li.elements.find((e) => e.tagName === "button")!;
    const rows = li.elements.find((e) => e.tagName === "ul")!;
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    expect(rows.hidden).toBe(!expanded);
    out.push({ level: 1, label: toggle.find("name")!.textContent, description: toggle.find("detail")!.textContent, tooltip: "", aria: toggle.getAttribute("aria-label")!, icon: "", expanded, run: "" });
    if (expanded) for (const row of rows.elements) out.push(rowOf(row, 2));
  }
  return out;
}

const toolsModule = await import("../../webview/panels/tools.js");

// What Python says: computed once for every state's selection, before the tests run.
const ALL_STATES = Object.entries(SAMPLES).flatMap(([, sample]) => Object.values(toolsStatesOf(sample)).filter((s): s is PanelState => !!s));
const kindsKey = (kinds: string[]) => JSON.stringify(kinds);
const asked = [...new Set(ALL_STATES.map((s) => kindsKey(selectionOf(s).kinds)))].map((k) => JSON.parse(k) as string[]);
const PYTHON = fromPython(asked);
const TOOLS = PYTHON.tools;
const offeredFor = (kinds: string[]) => PYTHON.offered[asked.findIndex((k) => kindsKey(k) === kindsKey(kinds))] ?? [];

describe("the Tools in both front ends (PAR-16)", { timeout: 60_000 }, () => {
  for (const [name, sample] of Object.entries(SAMPLES)) {
    describe(name, () => {
      for (const [stateName, state] of Object.entries(toolsStatesOf(sample))) {
        if (!state) continue;
        it(stateName, () => {
          const vscode = vscodeTools(state, offeredFor);
          expect(playgroundTools(state, offeredFor)).toEqual(vscode);
          // Both say the same of what there is to list.
          if (state.problem) expect(vscode.map((r) => r.label)).toEqual([state.problem]);
          else if (state.starting) expect(vscode.map((r) => r.label)).toEqual(["Starting tools…"]);
          else if (!state.input) expect(vscode.map((r) => r.label)).toEqual(["Open a plot to use tools."]);
          else {
            const count = toolsInputOf(state, offeredFor).ids.length;
            expect(vscode[0].label).toBe(count ? `${count} selected` : "Nothing selected");
            expect(vscode.filter((r) => r.level === 1 && r.expanded !== undefined).map((r) => r.label)).toEqual([
              ...(toolsInputOf(state, offeredFor).operations.length ? ["For the Outline's selection"] : []),
              "For this selection",
              "Other tools",
              "Not available",
            ]);
          }
        });
      }
    });
  }

  it("lists the tools offered by Python's rule, an entry that cannot act with its reason, and a library not available with why", () => {
    const state = toolsStatesOf(SAMPLES["serial-1"])["4. two tracks selected"]!;
    const rows = vscodeTools(state, offeredFor);
    expect(rows.find((r) => r.label === "Closest approach")).toMatchObject({ level: 2, icon: "play", run: "debrief.showToolForm(core.closest_approach)" });
    const revision = vscodeTools(toolsStatesOf(SAMPLES["serial-1"])["11. an earlier revision shown"]!, offeredFor);
    const hideCuts = revision.find((r) => r.label.startsWith("Hide "))!;
    expect(hideCuts).toMatchObject({ icon: "circle-slash", run: "debrief.hideCuts()" });
    expect(hideCuts.description).not.toBe("");
    const closed = playgroundTools({ ...state }, offeredFor).find((r) => r.label === "Not available")!;
    expect(closed).toMatchObject({ description: "1", expanded: false });
  });
});

/** Appendix C's states that apply to History, for a sample's history. */
function historyStatesOf(steps: HistoryStep[]): Record<string, { open: boolean; steps: HistoryStep[]; current: number; shown?: number; problem?: string }> {
  const latest = steps[steps.length - 1]?.seq ?? 0;
  // The last two steps undone: Ctrl+Z's next and Redo's both to show.
  const undone = steps.map((s, i) => (i >= steps.length - 2 && i > 0 ? { ...s, status: "undone" as const } : s));
  const back = undone.filter((s) => s.status === "applied").pop()?.seq ?? latest;
  return {
    "1. no plot open": { open: false, steps: [], current: 0 },
    "2. a plot open": { open: true, steps, current: latest },
    "2. a plot open, steps undone": { open: true, steps: undone, current: back },
    "11. an earlier revision shown": { open: true, steps, current: latest, shown: steps[0]?.seq },
    "12. Python or the service still starting": { open: true, steps: [], current: 0, problem: NEEDS_SERVICE },
    "the history could not be read": { open: true, steps: [], current: 0, problem: "The plot's history could not be read." },
  };
}

interface HistorySaid {
  label: string;
  description: string;
  tooltip: string;
  icon: string;
  muted: boolean;
  menu: string[];
}
const historyMenuOf = (contextValue: string | undefined) => vscodeMenu(contextValue, {}, "debrief.history");
const toolTitle = (name: string) => TOOLS.find((t) => t.name === name)?.title;

describe("History in both front ends (PAR-16)", () => {
  for (const [name, steps] of Object.entries(PYTHON.history)) {
    describe(name, () => {
      for (const [stateName, state] of Object.entries(historyStatesOf(steps))) {
        it(stateName, () => {
          const provider = new HistoryProvider(toolTitle);
          provider.update(state.steps, state.current, state.open, state.problem, state.shown);
          const vscode: HistorySaid[] = provider.getChildren().map((row) => {
            const item = provider.getTreeItem(row);
            const icon = item.iconPath as { id: string; color?: unknown };
            return { label: String(item.label), description: String(item.description ?? ""), tooltip: String(item.tooltip ?? ""), icon: icon.id, muted: !!icon.color, menu: historyMenuOf(item.contextValue) };
          });
          const model = provider.model();
          const list = new FakeElement("ul");
          fillHistory(list as unknown as HTMLElement, model.rows());
          const play: HistorySaid[] = list.elements.map((li) => ({
            label: li.find("name")!.textContent,
            description: li.find("detail")?.textContent ?? "",
            tooltip: li.title,
            icon: li.find("icon")!.dataset.icon,
            muted: li.className.split(" ").includes("muted"),
            menu: li.dataset.menu ? said(rowMenu("debrief.history", li.dataset.menu, {})) : [],
          }));
          expect(play).toEqual(vscode);
          // The title bar: Go to latest revision, Undo and Redo, the same in both, enabled under the same rules.
          const keys = { "debrief.canUndo": model.canUndo, "debrief.canRedo": model.canRedo, "debrief.revisionShown": state.shown !== undefined };
          expect(said(titleMenu("debrief.history", keys))).toEqual(vscodeTitle("debrief.history", keys));

          if (state.problem) expect(vscode.map((r) => r.label)).toEqual([state.problem]);
          else if (!state.open) expect(vscode.map((r) => r.label)).toEqual(["Open a plot to see its history."]);
          else {
            expect(vscode).toHaveLength(state.steps.length);
            // Steps newest first, each told "Step n: name / status / By agent, when".
            expect(vscode[0].tooltip).toMatch(new RegExp(`^Step ${state.steps[state.steps.length - 1].seq}: .+\\n.+\\nBy .+, .+`));
            // Ctrl+Z's next marked, unless an earlier revision is shown; no step actions then either.
            const next = vscode.filter((r) => r.description.includes("next to undo"));
            if (state.shown !== undefined) expect(next).toEqual([]);
            if (state.shown !== undefined) expect(vscode.flatMap((r) => r.menu)).toEqual([]);
          }
        });
      }
    });
  }

  it("marks Ctrl+Z's next step, and offers Go back and Redo up to a step from the catalogue", () => {
    const steps = PYTHON.history["the TMA sample"];
    expect(steps.length).toBeGreaterThan(2);
    const state = historyStatesOf(steps)["2. a plot open, steps undone"];
    const provider = new HistoryProvider(toolTitle);
    provider.update(state.steps, state.current, true);
    const rows = provider.getChildren().map((r) => provider.getTreeItem(r));
    expect(rows.filter((r) => String(r.description).includes("next to undo")).length).toBeGreaterThan(0);
    expect(rows.flatMap((r) => historyMenuOf(r.contextValue))).toEqual(expect.arrayContaining(["Go back to this step", "Redo up to this step"]));
  });
});

// --- The Catalogues (panel parity phase 4) ----------------------------------------------------------

const { CataloguesProvider, treeItemOf: catalogueItemOf } = await import("../../src/views/catalogues.js");
const { CataloguesModel, STARTING: CATALOGUES_STARTING, WELCOME } = await import("../../webview/panels/catalogues.js");
const { fillCatalogues } = await import("../../play/cataloguelist.js");
const { inPlayground, actionOf } = await import("../../webview/panels/actions.js");
const { addStore, updateConfig } = await import("@debrief/config");
type CollationMarks = import("../../webview/panels/catalogues.js").CollationMarks;
type CataloguesModelT = import("../../webview/panels/catalogues.js").CataloguesModel;
type CoverageReportT = import("@debrief/schemas").CoverageReport;
type ReviewFlagT = import("@debrief/schemas").ReviewFlag;

// The analyst's catalogues: the sample, the TMA copy's, a read-only one, and one that cannot be read.
const configFile = path.join(work, "debrief-config.json");
const sampleStore = updateConfig((c) => addStore(c, { title: "Sample", location: path.join(work, "sample") })[0], configFile).stores[0];
updateConfig((c) => addStore(c, { title: "TMA", location: path.join(work, "tma"), read_only: true })[0], configFile);
updateConfig((c) => addStore(c, { title: "Gone", location: path.join(work, "gone") })[0], configFile);
// What collation says of serial 1 (debrief/coverage), Python's.
const COVERAGE: CoverageReportT = JSON.parse(
  execFileSync(python, ["-c", "import sys, json; from pathlib import Path; from debrief_stac import Catalogue; print(Catalogue.open(Path(sys.argv[1])).coverage('serial-1').model_dump_json(exclude_none=True))", path.join(work, "sample")], { encoding: "utf8" }),
);
/** The coverage with serial 2 marked as new data for serial 1, and its BLUE ONE proposed as the open plot's. */
const withNewData = (): CoverageReportT => {
  const report = structuredClone(COVERAGE);
  const item = report.items.find((i) => i.item === "serial-2")!;
  item.role = "other";
  item.new_data = { revision: item.revision ?? "sha256:2", note: "New data for Serial 1: BLUE ONE, within its period" } as never;
  return report;
};
const FLAG = { catalogue: COVERAGE.items[0].catalogue, item: "serial-3", title: "Serial 3", note: "May need review: serial-2 was revised since Serial 3 took data from it", revised: [{ catalogue: COVERAGE.items[0].catalogue, item: "serial-2", title: "Serial 2", revision: "sha256:2" }] } as unknown as ReviewFlagT;
const openOn = { store: sampleStore.id, item: "serial-1" };

/** Appendix C's states that apply to the Catalogues, and those of collation's marks. */
const CATALOGUE_STATES: Record<string, { marks: CollationMarks; starting?: boolean; none?: boolean }> = {
  "1. no plot open, catalogues listed": { marks: { flags: [] } },
  "1. no plot open, a plot flagged for review": { marks: { flags: [FLAG] } },
  "2. a plot open": { marks: { open: openOn, coverage: COVERAGE, flags: [] } },
  "2. a plot open, new data, a link proposed and a plot flagged": { marks: { open: openOn, coverage: withNewData(), flags: [FLAG] } },
  // An earlier revision is a plot like any other to the Catalogues: its marks are the plot's.
  "11. an earlier revision shown": { marks: { open: openOn, coverage: COVERAGE, flags: [] } },
  "12. Python or the service still starting": { marks: { flags: [] }, starting: true },
  "no catalogue: the welcome": { marks: { flags: [] }, none: true },
};

interface CatalogueSaid {
  level: number;
  label: string;
  description: string;
  tooltip: string;
  aria: string;
  icon: string;
  expanded?: boolean;
  /** Its context menu, VS Code's without what §5 keeps to it. */
  menu: string[];
  run: string;
}
/** The titles §5 keeps to VS Code (catalogue management), left out of the playground's menus. */
const VSCODE_ONLY = new Set(["debrief.addCatalogue", "debrief.createCatalogue", "debrief.addPlotFile", "debrief.refresh"].map((id) => actionOf(id).title));
const playgroundOnly = (titles: string[]) => titles.filter((t) => !VSCODE_ONLY.has(t.replace(/ \(disabled\)$/, ""))).filter((t, i, all) => t !== "—" || (i > 0 && i < all.length - 1 && all[i - 1] !== "—"));

/** The model a state is, as VS Code's provider reads the catalogues from disk (or, starting, as the playground has it). */
function cataloguesModelOf(state: (typeof CATALOGUE_STATES)[string]): { provider?: InstanceType<typeof CataloguesProvider>; model: CataloguesModelT } {
  if (state.starting) return { model: new CataloguesModel({ catalogues: [], marks: state.marks, starting: true }) };
  if (state.none) return { model: new CataloguesModel({ catalogues: [], marks: state.marks }) };
  const provider = new CataloguesProvider(configFile);
  provider.setMarks(state.marks);
  provider.getChildren();
  return { provider, model: provider.current() };
}

/** VS Code: the tree items, each branch open as it starts, or all of them. */
function vscodeCatalogues(state: (typeof CATALOGUE_STATES)[string], allOpen: boolean): CatalogueSaid[] {
  const { provider, model } = cataloguesModelOf(state);
  const context = { "debrief.plotOpen": !!state.marks.open };
  const out: CatalogueSaid[] = [];
  const walk = (nodes: ReturnType<CataloguesModelT["children"]>, level: number) => {
    for (const node of nodes) {
      const item = provider ? provider.getTreeItem(node) : catalogueItemOf(model.row(node));
      const expanded = item.collapsibleState === 2 || (allOpen && item.collapsibleState !== 0);
      out.push({
        level,
        label: String(item.label),
        description: String(item.description ?? ""),
        tooltip: String(item.tooltip ?? ""),
        aria: item.accessibilityInformation!.label,
        icon: (item.iconPath as { id: string }).id,
        ...(item.collapsibleState !== 0 && { expanded }),
        menu: playgroundOnly(vscodeMenu(item.contextValue, context, "debrief.catalogues")),
        run: item.command ? `${item.command.command}(${(item.command.arguments ?? []).join()})` : "",
      });
      if (expanded) walk(provider ? provider.getChildren(node) : model.children(node), level + 1);
    }
  };
  walk(provider ? provider.getChildren() : model.roots, 1);
  return out;
}

/** The playground: the tree as fillCatalogues fills it. */
function playgroundCatalogues(state: (typeof CATALOGUE_STATES)[string], allOpen: boolean): CatalogueSaid[] {
  const { model } = cataloguesModelOf(state);
  if (model.empty) return []; // the welcome text instead: below
  const context = { "debrief.plotOpen": !!state.marks.open };
  const open = new Map<string, boolean>();
  if (allOpen) for (const row of model.rows()) if (row.branch) open.set(row.key, true);
  const list = new FakeElement("ul");
  let chosen = "";
  fillCatalogues(list as unknown as HTMLElement, model, open, (row) => (chosen = row.run ? `${row.run.action}(${row.run.args.join()})` : ""));
  const out: CatalogueSaid[] = [];
  const walk = (items: FakeElement[]) => {
    for (const li of items) {
      const line = li.elements.find((e) => e.className === "row")!;
      chosen = "";
      if (line.onclick) (line.onclick as () => void)();
      const expanded = li.getAttribute("aria-expanded");
      out.push({
        level: Number(li.getAttribute("aria-level")),
        label: line.find("name")!.textContent,
        description: line.find("detail")?.textContent ?? "",
        tooltip: li.title,
        aria: li.getAttribute("aria-label")!,
        icon: line.find("icon")!.dataset.icon,
        ...(expanded !== null && { expanded: expanded === "true" }),
        menu: li.dataset.menu ? said(rowMenu("debrief.catalogues", li.dataset.menu, context).filter((e) => inPlayground(e.id))) : [],
        run: chosen,
      });
      const group = li.elements.find((e) => e.tagName === "ul");
      if (group) walk(group.elements);
    }
  };
  walk(list.elements);
  return out;
}

describe("the Catalogues in both front ends (PAR-16)", () => {
  for (const [name, state] of Object.entries(CATALOGUE_STATES)) {
    it(name, () => {
      for (const allOpen of [false, true]) expect(playgroundCatalogues(state, allOpen)).toEqual(vscodeCatalogues(state, allOpen));
      // The title bar: the same actions, in the same groups and order, but what §5 keeps to VS Code.
      const context = { "debrief.plotOpen": !!state.marks.open };
      expect(said(titleMenu("debrief.catalogues", context).filter((e) => inPlayground(e.id)))).toEqual(playgroundOnly(vscodeTitle("debrief.catalogues", context)));
      const rows = vscodeCatalogues(state, true);
      if (state.starting) expect(rows.map((r) => r.label)).toEqual([CATALOGUES_STARTING]);
      else if (state.none) expect(rows).toEqual([]);
      else {
        // Catalogue → plot → track: "N plots", read-only, and a problem row under one that cannot be read.
        expect(rows.filter((r) => r.level === 1).map((r) => [r.label, r.description])).toEqual([
          [expect.any(String), expect.stringMatching(/^\d+ plots$/)],
          [expect.any(String), expect.stringMatching(/^read-only · 1 plot$/)],
          ["Gone", "0 plots"],
        ]);
        expect(rows.find((r) => r.level === 2 && r.label.startsWith("No catalogue found at"))).toBeTruthy();
        expect(rows.filter((r) => r.level === 2 && r.run).every((r) => r.run.startsWith("debrief.openPlot("))).toBe(true);
        expect(rows.some((r) => r.level === 3)).toBe(true);
      }
    });
  }

  it("says the same with no catalogue: VS Code's welcome view is the model's", () => {
    const welcome = (manifest.contributes as unknown as { viewsWelcome: { view: string; contents: string }[] }).viewsWelcome.find((w) => w.view === "debrief.catalogues")!.contents;
    expect(welcome).toBe(WELCOME.map((line) => (line.action ? `[${line.text}](command:${line.action})` : line.text)).join("\n"));
    const list = new FakeElement("ul");
    fillCatalogues(list as unknown as HTMLElement, new CataloguesModel({ catalogues: [], marks: { flags: [] } }), new Map(), () => undefined, () => true);
    // The playground's: the same lines, but the links §5 keeps to VS Code.
    expect(list.elements.map((li) => li.textContent)).toEqual(WELCOME.filter((l) => !l.action || inPlayground(l.action)).map((l) => l.text));
  });

  it("marks new data, a review flag, the open plot and a proposed link in words, and offers collation's actions", () => {
    const rows = vscodeCatalogues(CATALOGUE_STATES["2. a plot open, new data, a link proposed and a plot flagged"], true);
    const serial2 = rows.find((r) => r.level === 2 && r.label === "Serial 2")!;
    expect(serial2.description).toMatch(/^New data · /);
    expect(serial2.icon).toBe("sparkle");
    expect(serial2.menu).toEqual(["Take data into the open plot…", "Not now: set this new data aside"]);
    const flagged = rows.find((r) => r.level === 2 && r.label === "Serial 3")!;
    expect(flagged.description).toMatch(/May need review/);
    expect(flagged.menu).toContain("Reviewed: clear the review flag");
    expect(rows.find((r) => r.level === 2 && r.description.startsWith("open"))?.icon).toBe("map-filled");
    expect(rows.some((r) => r.level === 3 && /^(linked to|proposed as) /.test(r.description))).toBe(true);
    // No plot open: Take data is there, disabled with the catalogue's reason; there is nothing to set aside.
    const closed = vscodeCatalogues(CATALOGUE_STATES["1. no plot open, a plot flagged for review"], true);
    expect(closed.find((r) => r.label === "Serial 3")!.menu).toEqual(["Reviewed: clear the review flag"]);
  });
});
