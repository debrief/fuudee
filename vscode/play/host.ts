/**
 * The playground: Debrief in a web page, for the blog.
 *
 * This page plays the part of the VS Code extension. The map, tool form and
 * results panel are Debrief's own webviews, unchanged, each in a frame (see
 * shim.ts). The catalogue, history, tools and importers are Debrief's own
 * Python packages, running in the reader's browser under Pyodide (see
 * python.worker.ts and play.py). Nothing is sent anywhere: files the reader
 * imports stay in the browser, and everything is gone when the page closes.
 *
 * Query parameters choose what an embedded demo shows:
 *   plot=serial-1         the sample serial to open
 *   panels=tools,history,try,import   the side panels, in this order (all by default)
 */
import type { DebriefFeatureCollection, ParameterValue, StacItem, TimeState, ToolDeclaration, ToolResult } from "@debrief/schemas";
import { count, describeChanges, describePeriod, describeTimes } from "../src/format.js";
import { resolveTimes } from "../src/timeinput.js";
import { describeStep, needs } from "../src/wording.js";

type Feature = DebriefFeatureCollection["features"][number];
interface Step {
  seq: number;
  status: "applied" | "undone" | "abandoned";
  kind: string;
  tool: string | null;
  agent: string;
  at: string;
  notes?: string[];
}
interface Opened {
  item: StacItem;
  plot: DebriefFeatureCollection;
  base: { current: number; plot_hash: string };
  steps: Step[];
  recovered: string[];
}

const params = new URLSearchParams(location.search);
const panelOrder = (params.get("panels") ?? "tools,history,try,import").split(",");
const panels = new Set(panelOrder);
const startPlot = params.get("plot") ?? "serial-1";
const theme = matchMedia("(prefers-color-scheme: light)").matches || params.get("theme") === "light" ? "light" : "dark";
if (theme === "light") document.documentElement.classList.add("light");
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// --- Python, in a worker ----------------------------------------------------------
const worker = new Worker(new URL("python.worker.js", location.href), { type: "module" });
let nextId = 0;
const waiting = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>();
worker.onmessage = ({ data }) => {
  if (data.progress) return status(data.progress, true);
  const call = waiting.get(data.id);
  waiting.delete(data.id);
  if (data.error) call?.reject(new Error(data.error));
  else call?.resolve(data.result);
};
function python(call: string, ...args: unknown[]): Promise<string> {
  const id = nextId++;
  worker.postMessage({ id, call, args, base: new URL(".", location.href).href });
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}
const pythonJson = async <T>(call: string, ...args: unknown[]) => JSON.parse(await python(call, ...args)) as T;
/** Whether Python has started: until then, only the map and outline work. */
let pythonReady = false;

// --- The webviews, in frames -------------------------------------------------------
function frame(name: "map" | "form" | "results"): HTMLIFrameElement {
  const element = document.createElement("iframe");
  element.src = `frame-${name}.html?frame=${name}&theme=${theme}`;
  element.title = { map: "Plot map", form: "Tool form", results: "Tool results" }[name];
  element.className = `frame frame-${name}`;
  return element;
}
const map = frame("map");
$("main").prepend(map);
let form: HTMLIFrameElement | undefined;
let results: HTMLIFrameElement | undefined;
const ready = new Set<string>();
const post = (target: HTMLIFrameElement | undefined, message: unknown) => {
  const name = target?.className.match(/frame-(\w+)/)?.[1];
  if (target && name && ready.has(name)) target.contentWindow?.postMessage(message, location.origin);
};

// --- What is open, and the shared state -------------------------------------------
let opened: Opened | undefined;
let selection: string[] = [];
let time: TimeState | undefined;
let tools: ToolDeclaration[] = [];
let offered: string[] = [];
let formTool: ToolDeclaration | undefined;
let colleagueDuringNextRun = false;

const features = (): Feature[] => opened?.plot.features ?? [];
const selectedNames = () => selection.map((id) => features().find((f) => f.id === id)?.properties.name ?? id);

function timeOf(item: StacItem, previous?: TimeState): TimeState | undefined {
  const p = item.properties;
  const start = p.start_datetime ?? p.datetime ?? undefined;
  const end = p.end_datetime ?? p.datetime ?? undefined;
  if (!start || !end) return previous;
  if (previous && Date.parse(previous.current) >= Date.parse(start) && Date.parse(previous.current) <= Date.parse(end)) {
    return { current: previous.current, range: { start, end } };
  }
  return { current: start, range: { start, end } };
}

function showPlot(): void {
  if (!opened) return;
  post(map, {
    kind: "show_plot",
    plot: opened.plot,
    plot_title: opened.item.properties.title ?? opened.item.id,
    selection: { plot: opened.item.id, feature_ids: selection },
    ...(time && { time }),
  });
}

async function openPlot(item: string, keep = false): Promise<void> {
  const previousTime = keep ? time : undefined;
  if (opened && opened.item.id !== item) closeSide();
  // The plot as the map last drew it: if Python's is the same, it isn't sent again.
  const shown = opened?.item.id === item && opened.base.plot_hash ? opened.base.plot_hash : undefined;
  opened = await pythonJson<Opened>("open_plot", item);
  $<HTMLSelectElement>("plots").value = item;
  const ids = new Set(features().map((f) => f.id));
  selection = keep ? selection.filter((id) => ids.has(id)) : [];
  time = timeOf(opened.item, previousTime);
  $("plot-title").textContent = opened.item.properties.title ?? item;
  if (opened.base.plot_hash !== shown) showPlot();
  else {
    post(map, { kind: "set_selection", selection: { plot: item, feature_ids: selection } });
    if (time) post(map, { kind: "set_time", time });
  }
  renderOutline();
  renderHistory();
  await refreshOffered();
  if (opened.recovered.length) toast(opened.recovered.join(" "), "warning");
}

async function select(ids: string[], fromMap = false): Promise<void> {
  selection = ids;
  if (!fromMap) post(map, { kind: "set_selection", selection: { plot: opened?.item.id ?? "", feature_ids: ids } });
  renderOutline();
  if (formTool) sendForm();
  await refreshOffered();
}

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  if (event.data?.debriefKey) return void historyKey(event.data.debriefKey as KeyChord);
  if (!event.data?.debriefFrame) return;
  const { debriefFrame: name, message } = event.data as { debriefFrame: string; message: { kind: string } & Record<string, unknown> };
  if (message.kind === "ready") {
    ready.add(name);
    if (name === "map") showPlot();
    if (name === "form") sendForm();
    if (name === "results") pendingResults?.();
    return;
  }
  if (name === "map") {
    if (message.kind === "selection_changed") void select((message.selection as { feature_ids: string[] }).feature_ids, true);
    if (message.kind === "time_changed") time = message.time as TimeState;
  } else if (name === "form") {
    if (message.kind === "cancel") closeForm();
    if (message.kind === "run_tool" && formTool && message.tool_name === formTool.name) {
      post(form, { kind: "form_busy", message: "Running…" });
      void runTool(formTool, message.parameters as ParameterValue[])
        .catch((error: Error) => `${formTool?.title ?? "The tool"} could not run here: ${error.message}`)
        .then((problem) => {
          if (problem) post(form, { kind: "form_error", message: problem });
          else closeForm();
        });
    }
  }
});

// --- Tools ------------------------------------------------------------------------
async function refreshOffered(): Promise<void> {
  if (!tools.length) return renderTools();
  const kinds = selection.map((id) => features().find((f) => f.id === id)?.properties.kind ?? "");
  offered = await pythonJson<string[]>("offered", JSON.stringify(kinds));
  renderTools();
}

/** The panel beside the map (below it on a narrow screen), with a Close button of its own. */
function showSide(title: string, content: HTMLElement): void {
  closeSide();
  const bar = document.createElement("div");
  bar.className = "side-bar";
  const heading = document.createElement("span");
  heading.textContent = title;
  const close = document.createElement("button");
  close.textContent = "Close";
  close.setAttribute("aria-label", `Close ${title.toLowerCase()}`);
  close.onclick = closeSide;
  bar.append(heading, close);
  $("side-frame").replaceChildren(bar, content);
  $("side-frame").hidden = false;
}
function closeSide(): void {
  formTool = undefined;
  form = undefined;
  results = undefined;
  ready.delete("form");
  ready.delete("results");
  $("side-frame").replaceChildren();
  $("side-frame").hidden = true;
}

function openForm(tool: ToolDeclaration): void {
  if (!form) {
    const shown = frame("form");
    showSide("Tool", shown);
    form = shown;
  }
  formTool = tool;
  sendForm();
}
function sendForm(): void {
  if (!formTool || !opened) return;
  const range = time?.range;
  post(form, { kind: "show_form", tool: formTool, selected_names: selectedNames(), ...(range && { time_range: range }) });
}
function closeForm(): void {
  if (form) closeSide();
}

let pendingResults: (() => void) | undefined;
function showResults(tool: ToolDeclaration, result: ToolResult): void {
  const shown = frame("results");
  showSide("Results", shown);
  results = shown;
  pendingResults = () => post(results, { kind: "show_results", tool, result_title: tool.title, result });
}
function closeResults(): void {
  if (results) closeSide();
}

async function runTool(tool: ToolDeclaration, parameters: ParameterValue[], onConflict?: string): Promise<string | undefined> {
  if (!opened) return "Open a plot first.";
  const resolved = resolveTimes(tool, parameters, opened);
  if (typeof resolved === "string") return resolved;
  const request = {
    name: tool.name,
    selection,
    parameters: Object.fromEntries(resolved.map((p) => [p.name, p.value])),
    state: time && { time, selection: { plot: opened.item.id, feature_ids: selection }, viewport: { bbox: opened.item.bbox ?? [-180, -90, 180, 90] } },
    base: opened.base,
    ...(onConflict && { on_conflict: onConflict }),
  };
  if (colleagueDuringNextRun && !onConflict) {
    // The colleague's change lands while the tool runs (SUB-28).
    colleagueDuringNextRun = false;
    $<HTMLButtonElement>("colleague-during").textContent = "A colleague changes it while your next tool runs";
    await python("colleague", opened.item.id, new Date().toISOString());
  }
  const outcome = await pythonJson<{ result?: ToolResult; changed?: boolean; new_item?: string; error?: string; conflict?: { mergeable: boolean } }>(
    "run",
    opened.item.id,
    JSON.stringify(request),
  );
  if (outcome.conflict) {
    const choice = await ask(
      outcome.conflict.mergeable
        ? `The plot was changed elsewhere while ${tool.title} ran. The other change touches different features, so the two can be combined, or ${tool.title}'s result can be saved as a new plot.`
        : `The plot was changed elsewhere while ${tool.title} ran, and touches the same features. ${tool.title}'s result can be saved as a new plot.`,
      outcome.conflict.mergeable ? ["Combine the changes", "Save mine as a new plot"] : ["Save mine as a new plot"],
    );
    if (!choice) {
      await openPlot(opened.item.id, true);
      return `${tool.title} was not run: the plot was changed elsewhere. Debrief is showing the latest.`;
    }
    return runTool(tool, parameters, choice === "Combine the changes" ? "merge" : "new_plot");
  }
  if (outcome.error) return outcome.error;
  const result = outcome.result!;
  if (outcome.new_item) {
    await refreshPlots();
    toast(`Your result was saved as a new plot, ${outcome.new_item}. The original keeps the other change.`);
    await openPlot(outcome.new_item, true);
  } else if (outcome.changed) {
    await openPlot(opened.item.id, true);
  }
  if (result.state_change?.time) {
    time = result.state_change.time;
    post(map, { kind: "set_time", time });
  }
  if (result.non_spatial?.length) showResults(tool, result);
  const said = describeChanges(result);
  if (said) toast(`${tool.title} ${said}.`);
  return undefined;
}

// --- History ----------------------------------------------------------------------
async function move(how: "undo" | "redo" | "goto", step?: number): Promise<void> {
  if (!opened || !pythonReady) return;
  const outcome = await pythonJson<{ error?: string }>("move", opened.item.id, how, step ?? null);
  if (outcome.error) return toast(outcome.error, "warning");
  closeResults(); // they describe a plot that is no longer current
  await openPlot(opened.item.id, true);
}

// Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes, as in VS Code: here in the page, and
// forwarded from the map, form and results frames (see shim.ts). Never while typing.
type KeyChord = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };
function historyKey(e: KeyChord): boolean {
  if (!(e.ctrlKey || e.metaKey) || !panels.has("history") || !pythonReady) return false;
  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) void move("undo");
  else if ((key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey)) void move("redo");
  else return false;
  return true;
}
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
document.addEventListener("keydown", (event) => {
  if (!typing(event.target) && historyKey(event)) event.preventDefault();
});

// --- Rendering --------------------------------------------------------------------
function renderOutline(): void {
  const list = $("outline");
  // Re-rendering replaces the rows: keep keyboard focus on the row that had it.
  const focused = list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.id : undefined;
  list.replaceChildren(
    ...features()
      .filter((f) => f.properties.kind === "track" || f.geometry)
      .map((f) => {
        const row = document.createElement("li");
        const selected = selection.includes(f.id);
        row.className = selected ? "selected" : "";
        row.tabIndex = 0;
        row.dataset.id = f.id;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(selected));
        const props = f.properties as { times?: string[]; time?: string };
        row.innerHTML = `<span class="name"></span> <span class="detail"></span>`;
        row.querySelector(".name")!.textContent = f.properties.name;
        row.querySelector(".detail")!.textContent = props.times ? describeTimes(props.times[0], props.times.at(-1)) : f.properties.kind;
        const choose = (add: boolean) =>
          void select(add ? (selection.includes(f.id) ? selection.filter((i) => i !== f.id) : [...selection, f.id]) : [f.id]);
        row.onclick = (e) => choose(e.ctrlKey || e.metaKey || e.shiftKey);
        row.onkeydown = (e) => {
          // Only Enter and Space select; every other key (Tab above all) does what it always does.
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          choose(e.ctrlKey || e.metaKey || e.shiftKey);
        };
        return row;
      }),
  );
  if (focused) list.querySelector<HTMLElement>(`[data-id="${CSS.escape(focused)}"]`)?.focus();
  $("selected-count").textContent = selection.length ? `${count(selection.length, "feature")} selected · Ctrl-click to add` : "Click to select · Ctrl-click to add";
}

function renderTools(): void {
  const list = $("tools");
  if (!tools.length) {
    list.innerHTML = `<li class="detail">Starting Python…</li>`;
    return;
  }
  const sorted = [...tools].sort((a, b) => Number(offered.includes(b.name)) - Number(offered.includes(a.name)));
  list.replaceChildren(
    ...sorted.map((tool) => {
      const on = offered.includes(tool.name);
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.textContent = tool.title;
      button.disabled = !on;
      button.title = tool.explanation;
      button.onclick = () => openForm(tool);
      const why = document.createElement("span");
      why.className = "detail";
      why.textContent = on ? "" : needs(tool);
      row.append(button, " ", why);
      return row;
    }),
  );
}

function renderHistory(): void {
  const steps = opened?.steps ?? [];
  const title = (name: string) => tools.find((t) => t.name === name)?.title;
  $("history").replaceChildren(
    ...[...steps].reverse().map((step) => {
      const { label, status } = describeStep(step, title);
      const row = document.createElement("li");
      const current = step.seq === opened?.base.current;
      row.className = `step ${step.status}`;
      const marker = current ? "current" : step.status === "undone" ? "undone" : step.status === "abandoned" ? "replaced" : "";
      row.innerHTML = `<span class="name"></span> <span class="detail"></span>`;
      row.querySelector(".name")!.textContent = label;
      row.querySelector(".detail")!.textContent = [`step ${step.seq}`, marker, describePeriod(step.at), step.agent].filter(Boolean).join(" · ");
      row.title = status;
      if (!current && step.status !== "abandoned") {
        const back = document.createElement("button");
        back.className = "link";
        back.textContent = step.status === "undone" ? "Redo up to here" : "Go back here";
        back.onclick = () => void move("goto", step.seq);
        row.append(" ", back);
      }
      return row;
    }),
  );
}

async function refreshPlots(): Promise<void> {
  const plots = await pythonJson<{ id: string; title: string }[]>("plots");
  const picker = $<HTMLSelectElement>("plots");
  picker.replaceChildren(...plots.map((p) => new Option(p.title, p.id)));
  picker.disabled = false;
  if (opened) picker.value = opened.item.id;
}

// --- Notices and questions ---------------------------------------------------------
function status(text: string, busy = false): void {
  $("status").textContent = text;
  $("status").classList.toggle("busy", busy);
}
function toast(text: string, kind: "info" | "warning" = "info"): void {
  const note = document.createElement("div");
  note.className = `toast ${kind}`;
  note.textContent = text;
  note.setAttribute("role", "status");
  $("toasts").append(note);
  setTimeout(() => note.remove(), 8000);
}
function ask(question: string, choices: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    const dialog = $<HTMLDialogElement>("ask");
    $("ask-text").textContent = question;
    let chosen: string | undefined;
    const buttons = [...choices, "Cancel"].map((choice, i) => {
      const button = document.createElement("button");
      button.textContent = choice;
      button.className = i === 0 ? "primary" : "";
      button.onclick = () => {
        chosen = choice === "Cancel" ? undefined : choice;
        dialog.close();
      };
      return button;
    });
    $("ask-buttons").replaceChildren(...buttons);
    // However the dialog closes, Escape included, the question is answered: Escape is Cancel.
    dialog.onclose = () => resolve(chosen);
    dialog.showModal();
  });
}

// --- Wiring -----------------------------------------------------------------------
for (const panel of ["tools", "history", "try", "import"]) $(`panel-${panel}`).hidden = !panels.has(panel);
// The panels in the order the demo lists them, after the plot and its outline.
for (const panel of panelOrder) if (["tools", "history", "try", "import"].includes(panel)) $("side").append($(`panel-${panel}`));
/** History, Try and Import need Python: off until it is ready. */
const NEEDS_PYTHON = ["undo", "redo", "crash", "colleague", "colleague-during", "file"];
function needsPython(on: boolean): void {
  for (const id of NEEDS_PYTHON) $<HTMLButtonElement | HTMLInputElement>(id).disabled = !on;
}
needsPython(false);
$("undo").onclick = () => void move("undo");
$("redo").onclick = () => void move("redo");
$<HTMLSelectElement>("plots").onchange = (e) => void openPlot((e.target as HTMLSelectElement).value);
$("crash").onclick = async () => {
  if (!opened) return;
  await python("crash", opened.item.id, new Date().toISOString());
  toast("Debrief stopped part-way through saving a note: the change was written, but not yet made current. Reopen the plot to see what happens.", "warning");
  $("reopen").hidden = false;
};
$("reopen").onclick = async () => {
  $("reopen").hidden = true;
  if (opened) await openPlot(opened.item.id, true);
};
$("colleague").onclick = async () => {
  if (!opened) return;
  await python("colleague", opened.item.id, new Date().toISOString());
  // As the extension does when the plot changes on disk: show the latest, and say so.
  await openPlot(opened.item.id, true);
  toast(`${opened.item.properties.title} was changed elsewhere. Debrief is showing the latest.`);
};
$("colleague-during").onclick = (e) => {
  colleagueDuringNextRun = true;
  (e.target as HTMLButtonElement).textContent = "Armed: run a tool to see what happens";
};
$<HTMLInputElement>("file").onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  status(`Importing ${file.name}…`, true);
  const report = await pythonJson<{ item?: string; tracks: string[]; fixes: number; annotations: number; omitted: string[]; error?: string }>(
    "import_file",
    file.name,
    new Uint8Array(await file.arrayBuffer()),
  );
  status("Ready. Everything runs in your browser; nothing is sent anywhere.");
  if (report.error || !report.item) return toast(report.error ?? "The file could not be imported.", "warning");
  await refreshPlots();
  await openPlot(report.item);
  const parts = [count(report.tracks.length, "track"), count(report.fixes, "fix", "fixes")];
  if (report.annotations) parts.push(count(report.annotations, "annotation"));
  // Nothing is dropped silently (EXT-15): what wasn't imported is listed beside the map.
  const panel = document.createElement("div");
  panel.className = "omitted-panel";
  const heading = document.createElement("h2");
  heading.textContent = `${file.name}: imported ${parts.join(", ")}`;
  const lead = document.createElement("p");
  lead.textContent = report.omitted.length
    ? `Not imported (${report.omitted.length}), and recorded in the plot's provenance:`
    : "Everything in the file was imported.";
  const list = document.createElement("ul");
  list.replaceChildren(...report.omitted.map((line) => Object.assign(document.createElement("li"), { textContent: line })));
  panel.append(heading, lead, list);
  showSide("Import", panel);
};

/** Show the sample plot straight from the site while Python starts, so the map is never empty. */
async function preview(item: string): Promise<void> {
  try {
    const [plot, stac] = await Promise.all([
      fetch(`sample/${item}/plot.geojson`).then((r) => r.json()),
      fetch(`sample/${item}/${item}.json`).then((r) => r.json()),
    ]);
    if (opened) return; // Python was quicker
    opened = { item: stac, plot, base: { current: 0, plot_hash: "" }, steps: [], recovered: [] };
    time = timeOf(stac);
    $("plot-title").textContent = stac.properties.title ?? item;
    showPlot();
    renderOutline();
  } catch {
    // the map fills in when Python is ready
  }
}

/** Python could not start: say so plainly, and mark what needs it as unavailable. */
function withoutPython(why: string): void {
  status(`${why} The map still works; tools, history and import need Python.`);
  $("status").classList.add("problem");
  for (const panel of ["tools", "history", "try", "import"]) $(`panel-${panel}`).classList.add("unavailable");
  const unavailable = () => Object.assign(document.createElement("li"), { className: "detail", textContent: "Needs Python, which could not start." });
  $("tools").replaceChildren(unavailable());
  $("history").replaceChildren(unavailable());
  if (opened) $("plots").replaceChildren(new Option(opened.item.properties.title ?? opened.item.id, opened.item.id));
}

(async () => {
  void preview(startPlot);
  status("Starting Python in your browser: the first time takes a little while…", true);
  try {
    await python("start");
    tools = await pythonJson<ToolDeclaration[]>("tools");
    await pythonJson("setup");
    await refreshPlots();
    // keep: anything the reader selected on the preview stays selected.
    await openPlot(startPlot, true);
    pythonReady = true;
    needsPython(true);
    status("Ready. Everything runs in your browser; nothing is sent anywhere.");
  } catch (error) {
    const message = (error as Error).message;
    withoutPython(message.startsWith("Python couldn't") ? message : `Python could not start here: ${message}.`);
  }
})();
