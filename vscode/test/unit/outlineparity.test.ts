/**
 * The Outline's parity (PAR-16, docs/panel-parity-srd.md Appendix C): for each sample plot, serial 1
 * and serial 1 after Bearings and TMA's steps, in each state that applies to the Outline, the
 * panel model is built and rendered by both front ends: VS Code's OutlineProvider (its tree items:
 * label, description, tooltip, screen reader's label, collapsible state) and the playground's
 * (the tree's rows: aria-level, aria-posinset, aria-setsize, aria-expanded, and fillOutlineRow's
 * text, title, aria-label and aria-selected). Both shall describe the same rows, in the same order.
 *
 * The samples are built by the sample's own Python (debrief_sample), as the extension's tests read
 * a catalogue Python wrote.
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
    command?: unknown;
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
  return { TreeItem, EventEmitter, ThemeIcon, ThemeColor, TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 }, Uri: { file: (p: string) => ({ fsPath: p }) } };
});

const { OutlineProvider } = await import("../../src/views/outline.js");
const { filesOf, NO_PLOT, OutlineModel, CUT_PAGE } = await import("../../webview/panels/outline.js");
const { fillOutlineRow } = await import("../../play/outlinerow.js");
const { flatten } = await import("../../webview/outlinetree.js");
type OutlineNode = import("../../webview/panels/outline.js").OutlineNode;
type OutlineInput = import("../../webview/panels/outline.js").OutlineInput;
type TreeNode = import("../../webview/outlinetree.js").TreeNode<OutlineNode>;

// --- A page, as much of one as fillOutlineRow writes to -------------------------------------------

class FakeElement {
  className = "";
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
}

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
