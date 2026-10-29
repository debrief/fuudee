/**
 * The Python tool service, started per user by the extension (SEC-06 to SEC-08).
 *
 * The extension generates a fresh token for each session, passes it in the
 * service's environment (never on the command line), and talks to the
 * service over MCP's HTTP transport on 127.0.0.1 only.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import type { AmbiguityResolution, AnnotationSpec, CoverageReport, DebriefFeatureCollection, FigureSource, ImageExport, ItemRevision, NarrativeSpec, MeasureDefinition, MeasureGroup, PlotView, ReviewFlag, SharedState, SourceTrackRef, TimeRange, TimeState, TmaRequest, TmaResiduals, ToolDeclaration, ToolResult, ToteResult, ToteView, TrackEdit, Viewport } from "@debrief/schemas";
import type { ListedCut } from "../webview/tma.js";
import { guardRequest, type ShownReadOnly } from "./figures.js";
import type { ToolOutcome } from "./diagnostics.js";
import type { NarrativeChoices, NarrativePreview } from "./narrativeimport.js";
import type { SensorPreview } from "./sensorimport.js";

export interface Unavailable {
  library: string;
  tool: string | null;
  reason: string;
}

export interface ToolListing {
  tools: ToolDeclaration[];
  unavailable: Unavailable[];
}

export interface CallOutcome {
  ok: boolean;
  /** How the run ended, in the words both logs use. */
  outcome?: ToolOutcome;
  message: string;
  result?: ToolResult;
  changed?: boolean;
  /** The plot changed while the tool ran, or since the analyst opened it (SUB-28). */
  conflict?: { mergeable: boolean };
  /** Set when the result was saved as a new plot (SUB-29). */
  newItem?: string;
  /** Saving would write a newer schema into the catalogue: ask, then call again allowing it (SUB-35). */
  newerSchema?: boolean;
}

/** Where a plot's history stands: pass it back with the next change (SUB-28). */
export interface Base {
  current: number;
  plot_hash: string;
}

export interface HistoryStep {
  seq: number;
  status: "applied" | "undone" | "abandoned";
  kind: string;
  tool: string | null;
  agent: string;
  at: string;
  records: number;
  /** The first record's notes: they name an edit made without a tool. */
  notes?: string[];
  /** The step it was made after: what undoing it goes back to. */
  after?: number;
  /**
   * It changes nothing on the plot, only its records, as the step recording that a
   * plot file was added does: Ctrl+Z takes it with the step before it.
   */
  records_only?: boolean;
}

export interface Opened {
  base: Base;
  /** How many steps the plot's history holds. */
  latest?: number;
  /** What opening had to repair after a crash, for the analyst (NFR-10). */
  recovered: string[];
}

/** What opening a plot says besides: its view (the island) and, rarely, the plot itself. */
export interface OpenedView extends Opened {
  /** The plot's view, kept in the plot file outside its history (SUB-22), and its hash. */
  view: PlotView | null;
  view_hash: string;
  /** A retired presentation.json was made one recorded step. */
  migrated?: boolean;
  /** The plot with a retired presentation.json applied in memory, where it could not be migrated. */
  plot?: DebriefFeatureCollection;
}

/** What adding a plot file received from a colleague says. */
export interface AddedPlotFile {
  item: string;
  title: string;
  /** How many steps of history came with it, the step recording its arrival included. */
  steps: number;
}

export interface ImportReport {
  item: string;
  tracks: string[];
  fixes: number;
  annotations?: number;
  narrative_entries?: number;
  omitted: string[];
  /** How each track is plotted, and how to change a remembered choice. */
  notes?: string[];
}

/** A change to the plot's annotations, made by hand or by an agent (CAP-03). */
export type AnnotationChange =
  | { kind: "add"; annotation: AnnotationSpec }
  | { kind: "edit"; feature: string; annotation: Partial<AnnotationSpec> }
  | { kind: "delete"; features: string[] }
  | { kind: "north_arrow"; shown: boolean };

/** A change to the plot's narrative, made by hand or by an agent (CAP-20). */
export type NarrativeChange =
  | { kind: "add"; entry: NarrativeSpec }
  | { kind: "edit"; feature: string; entry: { [K in keyof NarrativeSpec]?: NarrativeSpec[K] | null } }
  | { kind: "delete"; features: string[] }
  | { kind: "import"; path: string; choices?: NarrativeChoices };

/** A change to the plot's tracks, made by hand or by an agent (CAP-01). */
export type TrackChange =
  | { kind: "edit"; feature: string; edit: TrackEdit; current_time?: string }
  | { kind: "split"; feature: string; at: string; names?: [string, string] }
  | { kind: "merge"; features: string[]; name?: string };

/** A collation step (CAP-09, CAP-11), by hand or by an agent: each one step naming the items. */
export type CollationChange =
  | { kind: "take"; source: { catalogue: string; item: string; revision?: string } }
  | { kind: "prefer"; feature: string; period: TimeRange; source: SourceTrackRef }
  | { kind: "link"; feature: string; source: SourceTrackRef; linked: boolean };

/** A track cleaned, or a fix marked, by hand or by an agent (CAP-01, EXT-14): each one step. */
export type CleanChange =
  | { kind: "remove_jumps"; feature: string; times: string[]; threshold?: { value: number; unit: string } }
  | { kind: "smooth"; feature: string; window: number; period?: { start: string; end: string } }
  | { kind: "mark"; feature: string; time: string; changes: { colour?: string | null; label?: string | null; comment?: string | null }; colour_name?: string };

/** What smoothing did, or would do: how many fixes moved, the most any moved (metres) and when, and the words for it. */
export interface SmoothingSummary {
  moved: number;
  largest: { value: number; unit: string };
  largest_time: string | null;
  summary: string;
}

/** What finding a track's jumps says: the threshold used, the track's median speed, and the jumps. */
export interface JumpsFound {
  feature: string;
  threshold: { value: number; unit: string };
  median_speed: { value: number; unit: string } | null;
  jumps: { time: string; position: number[]; speed: { value: number; unit: string } | null; since: string; logged?: boolean }[];
}

export interface Agent {
  kind: "person" | "software_agent";
  name: string;
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

/** The JSON-RPC error the service returns when the plot changed since the caller's base. */
export const CONFLICT = -32001;
/** The JSON-RPC error for a write that would put a newer schema into the catalogue (SUB-35). */
export const NEWER_SCHEMA = -32002;
/** The JSON-RPC error for a change that would lose what the analyst made, until they confirm: a track changed while plotted by dead reckoning, plotted over the ground (discard_dr_changes). */
export const NEEDS_CONFIRMATION = -32003;

export interface ServiceOptions {
  python: string;
  timeoutSeconds: number;
  log: (line: string) => void;
  /** Changes to the environment it starts in; undefined removes a variable. */
  env?: Record<string, string | undefined>;
  startTimeoutMs?: number;
}

/** Check the interpreter before starting it, so a wrong one gets a useful message. */
export function checkPython(python: string, env?: Record<string, string | undefined>): string | undefined {
  const probe = spawnSync(
    python,
    ["-c", "import sys, importlib.util as u; print(sys.version_info[0], sys.version_info[1], u.find_spec('debrief_tools') is not None)"],
    { encoding: "utf8", timeout: 20000, windowsHide: true, env: { ...process.env, ...env } },
  );
  if (probe.error) return `Debrief could not run Python with "${python}": ${probe.error.message}. Set Debrief: Python in Settings.`;
  const [major, minor, found] = probe.stdout.trim().split(" ");
  if (Number(major) < 3 || (Number(major) === 3 && Number(minor) < 12)) {
    return `Debrief needs Python 3.12 or later; "${python}" is Python ${major}.${minor}. Set Debrief: Python in Settings.`;
  }
  if (found !== "True") return `"${python}" does not have Debrief's Python packages installed. Set Debrief: Python in Settings.`;
  return undefined;
}

export class ToolService {
  private nextId = 1;

  private constructor(
    private readonly process: ChildProcess,
    private readonly port: number,
    private readonly token: string,
  ) {}

  /** Start the service and wait until it is listening. */
  static start(options: ServiceOptions): Promise<ToolService> {
    const problem = checkPython(options.python, options.env);
    if (problem) return Promise.reject(new ServiceError(problem));
    const token = randomBytes(32).toString("base64url");
    // -P: never import from the working directory; cwd is a neutral folder.
    const child = spawn(
      options.python,
      ["-P", "-m", "debrief_tools", "serve", "--timeout", String(options.timeoutSeconds)],
      {
        cwd: tmpdir(),
        env: { ...process.env, ...options.env, DEBRIEF_TOOL_TOKEN: token, PYTHONUNBUFFERED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    createInterface({ input: child.stderr! }).on("line", options.log);
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        reject(new ServiceError(message));
      };
      const timer = setTimeout(
        () => fail("Debrief's tool service did not start within 60 seconds. See the Debrief output for details."),
        options.startTimeoutMs ?? 60000,
      );
      child.once("error", (error) => fail(`Debrief could not start its tool service: ${error.message}`));
      child.once("exit", (code) => fail(`Debrief's tool service stopped as it started (exit code ${code}). See the Debrief output.`));
      createInterface({ input: child.stdout! }).on("line", (line) => {
        if (settled) return options.log(line);
        let port: number | undefined;
        try {
          port = (JSON.parse(line) as { port?: number }).port;
        } catch {
          // Not the start-up line; something printed a warning first.
        }
        if (typeof port !== "number") return options.log(line);
        settled = true;
        clearTimeout(timer);
        child.removeAllListeners("exit");
        // 127.0.0.1, not localhost: the service listens on IPv4 loopback only.
        resolve(new ToolService(child, port, token));
      });
    });
  }

  get running(): boolean {
    return this.process.exitCode === null && !this.process.killed;
  }

  private stopping = false;

  /** Called if the service stops other than by stop(). */
  onExit(listener: (code: number | null) => void): void {
    this.process.once("exit", (code) => {
      if (!this.stopping) listener(code);
    });
  }

  stop(): void {
    this.stopping = true;
    this.process.kill();
  }

  /**
   * The plot shown read-only, an earlier revision of it, if one is: every request aimed at
   * it that might change it is refused here, in one place (SUB-25; guardRequest).
   */
  shownReadOnly?: () => ShownReadOnly | undefined;
  /** Told of each request that succeeded, with its method and parameters: what the walkthroughs tick off (CAP-25). */
  done?: (method: string, params: Record<string, unknown>, result?: unknown) => void;

  /** One JSON-RPC request. No time limit here: the service stops tools that overrun. */
  private request<T>(method: string, given: Record<string, unknown> = {}): Promise<T> {
    const guarded = guardRequest(method, given, this.shownReadOnly?.());
    if ("refused" in guarded) return Promise.reject(new ServiceError(guarded.refused, READ_ONLY_CODE));
    const params = guarded.params;
    const body = JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params });
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port: this.port,
          path: "/mcp",
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
            authorization: `Bearer ${this.token}`,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            if (response.statusCode !== 200) {
              return reject(new ServiceError(`Debrief's tool service refused the request (${response.statusCode}).`));
            }
            try {
              const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                result?: T;
                error?: { message: string; code?: number };
              };
              if (parsed.error) reject(new ServiceError(parsed.error.message, parsed.error.code));
              else {
                resolve(parsed.result as T);
                this.done?.(method, params, parsed.result);
              }
            } catch (error) {
              reject(new ServiceError(`Debrief's tool service sent a reply Debrief could not read: ${(error as Error).message}`));
            }
          });
        },
      );
      req.on("error", (error) => reject(new ServiceError(`Debrief's tool service is not responding: ${error.message}`)));
      req.end(body);
    });
  }

  /** For tests: a request as an agent sends it, through the same guard. */
  raw<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return this.request(method, params);
  }

  async initialise(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "debrief-vscode", version: "0.0.1" },
    });
  }

  async listTools(): Promise<ToolListing> {
    const result = await this.request<{
      tools: { _meta: { "debrief/declaration": ToolDeclaration } }[];
      _meta: { "debrief/unavailable": Unavailable[] };
    }>("tools/list");
    return {
      tools: result.tools.map((t) => t._meta["debrief/declaration"]),
      unavailable: result._meta["debrief/unavailable"],
    };
  }

  async toolsForSelection(kinds: string[]): Promise<string[]> {
    return (await this.request<{ tools: string[] }>("debrief/tools_for_selection", { kinds })).tools;
  }

  async callTool(
    name: string,
    args: {
      store: string;
      item: string;
      selection: string[];
      parameters: Record<string, unknown>;
      agent: Agent;
      state?: SharedState;
      base?: Base;
      on_conflict?: "refuse" | "merge" | "new_plot";
      allow_newer_schema?: boolean;
    },
  ): Promise<CallOutcome> {
    const result = await this.request<{
      isError: boolean;
      content: { text: string }[];
      structuredContent?: { result: ToolResult; changed: boolean; new_item?: string };
      _meta?: { "debrief/conflict"?: { mergeable: boolean }; "debrief/newer_schema"?: boolean; "debrief/outcome"?: ToolOutcome };
    }>("tools/call", { name, arguments: args });
    const message = result.content[0]?.text.split("\n")[0] ?? "";
    if (result.isError) {
      return {
        ok: false,
        message,
        outcome: result._meta?.["debrief/outcome"],
        conflict: result._meta?.["debrief/conflict"],
        newerSchema: result._meta?.["debrief/newer_schema"],
      };
    }
    const structured = result.structuredContent;
    return {
      ok: true,
      message,
      outcome: result._meta?.["debrief/outcome"],
      result: structured?.result,
      changed: structured?.changed,
      newItem: structured?.new_item,
    };
  }

  /**
   * Open a plot: finish any change a crash interrupted, and say where its history stands.
   * readOnly, to show an earlier revision: nothing interrupted is finished, which would
   * write to the plot.
   */
  open(store: string, item: string, agent: Agent, readOnly = false): Promise<OpenedView> {
    return this.request("debrief/open", { store, item, agent, ...(readOnly && { read_only: true }) });
  }

  history(store: string, item: string): Promise<Opened & { steps: HistoryStep[] }> {
    return this.request("debrief/history", { store, item });
  }

  /** Undo, redo, or go to a step. Fails with CONFLICT if the plot changed since base. */
  move(how: "undo" | "redo" | "goto", store: string, item: string, base: Base, step?: number, allowNewerSchema = false): Promise<Opened> {
    return this.request(`debrief/${how}`, {
      store,
      item,
      base,
      ...(step !== undefined && { step }),
      ...(allowNewerSchema && { allow_newer_schema: true }),
    });
  }

  createCatalogue(location: string, title: string): Promise<{ store: string }> {
    return this.request("debrief/create_catalogue", { location, title });
  }

  /**
   * Colour tracks, or hide or show features: a recorded, undoable step like any
   * change (SUB-22, decision 12 Oct). Fails with CONFLICT if the plot changed since base.
   */
  restyle(
    store: string,
    item: string,
    base: Base,
    agent: Agent,
    features: string[],
    change: { colour: string; colour_name?: string } | { hidden: boolean },
    allowNewerSchema = false,
  ): Promise<Opened & { changed: boolean }> {
    return this.request("colour" in change ? "debrief/set_colour" : "debrief/set_hidden", {
      store,
      item,
      base,
      agent,
      features,
      ...change,
      ...(allowNewerSchema && { allow_newer_schema: true }),
    });
  }

  /**
   * How often tracks are labelled, marked with a symbol and given a direction arrow (CAP-32):
   * each of label_interval, symbol_interval and arrow_interval given is a duration, "off", or
   * null for Debrief's default; one left out stays as each track has it. One recorded,
   * undoable step for every track, named like "Labels every 10 min on 3 tracks".
   */
  setFrequencies(
    store: string,
    item: string,
    base: Base,
    agent: Agent,
    features: string[],
    changes: Record<string, unknown>,
    allowNewerSchema = false,
  ): Promise<Opened & { changed: boolean }> {
    return this.request("debrief/set_track_frequencies", { store, item, base, agent, features, ...changes, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /**
   * Add, change or delete narrative entries, or read a REP file's narrative into the
   * plot: each a recorded, undoable step named like "Narrative entry by BLUE ONE at
   * 08:40:00Z added" (CAP-20). Fails with CONFLICT if the plot changed since base.
   */
  narrate(
    store: string,
    item: string,
    base: Base,
    agent: Agent,
    change: NarrativeChange,
    allowNewerSchema = false,
  ): Promise<Opened & { changed: boolean; feature?: string; entries?: number; sources?: string[]; omitted?: string[]; notes?: string[] }> {
    const [method, params] =
      change.kind === "add"
        ? ["debrief/add_narrative", { entry: change.entry }]
        : change.kind === "edit"
          ? ["debrief/edit_narrative", { feature: change.feature, entry: change.entry }]
          : change.kind === "delete"
            ? ["debrief/delete_narrative", { features: change.features }]
            : ["debrief/import_narrative", { path: change.path, ...change.choices }];
    return this.request(method, { store, item, base, agent, ...params, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /**
   * Add, change or delete annotations, or show or remove the north arrow: each a
   * recorded, undoable step named like "Circle 'Exclusion zone' added" (CAP-03).
   * Fails with CONFLICT if the plot changed since base.
   */
  annotate(
    store: string,
    item: string,
    base: Base,
    agent: Agent,
    change: AnnotationChange,
    allowNewerSchema = false,
  ): Promise<Opened & { changed: boolean; feature?: string }> {
    const [method, params] =
      change.kind === "add"
        ? ["debrief/add_annotation", { annotation: change.annotation }]
        : change.kind === "edit"
          ? ["debrief/edit_annotation", { feature: change.feature, annotation: change.annotation }]
          : change.kind === "delete"
            ? ["debrief/delete_annotations", { features: change.features }]
            : ["debrief/set_north_arrow", { shown: change.shown }];
    return this.request(method, { store, item, base, agent, ...params, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /**
   * Move, rotate, split or merge tracks: each a recorded, undoable step named like
   * "BLUE ONE moved 1.20 nmi 045.0°T" (CAP-01, CAP-02). Fails with CONFLICT if the
   * plot changed since base. A merge's notes say what it did not keep.
   */
  changeTrack(
    store: string,
    item: string,
    base: Base,
    agent: Agent,
    change: TrackChange,
    allowNewerSchema = false,
  ): Promise<Opened & { changed: boolean; feature?: string; features?: string[]; notes?: string[] }> {
    const [method, params] =
      change.kind === "edit"
        ? ["debrief/edit_track", { feature: change.feature, edit: change.edit, ...(change.current_time && { current_time: change.current_time }) }]
        : change.kind === "split"
          ? ["debrief/split_track", { feature: change.feature, at: change.at, ...(change.names && { names: change.names }) }]
          : ["debrief/merge_tracks", { features: change.features, ...(change.name && { name: change.name }) }];
    return this.request(method, { store, item, base, agent, ...params, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /**
   * Keep one side of ambiguous cuts, or make them ambiguous again (CAP-22): the cuts
   * named, or a sensor's cuts in a period (the time window). One recorded, undoable step,
   * named like "Port kept: 42 Towed array cuts 09:00:00Z–09:59:30Z".
   * Fails with CONFLICT if the plot changed since base.
   */
  resolveAmbiguity(store: string, item: string, base: Base, agent: Agent, resolution: AmbiguityResolution, allowNewerSchema = false): Promise<Opened & { changed: boolean; notes?: string[] }> {
    return this.request("debrief/resolve_ambiguity", { store, item, base, agent, ...resolution, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /**
   * How far astern of the ship a towed array is (offset, or null for at the ship) and how
   * it follows (worm in the hole, legacy's default, or plain), for sensors (CAP-22): their
   * cuts are then drawn, and their sides told, from the array. One recorded, undoable step,
   * named like "Towed array: 300 yd astern, worm in the hole"; changed false if so already.
   */
  setArrayOffset(store: string, item: string, base: Base, agent: Agent, asked: { sensor_ids: string[]; offset: { value: number; unit: string } | null; mode?: "worm_in_hole" | "plain" }, allowNewerSchema = false): Promise<Opened & { changed: boolean; notes?: string[] }> {
    return this.request("debrief/set_array_offset", { store, item, base, agent, ...asked, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /** A sensor's cuts within a period (all of them, without), each with its bearings, side and where it was taken from (debrief/sensors): the bearing view's list. Changes nothing. */
  sensorCuts(store: string, item: string, sensorId: string, period?: { start: string; end: string }): Promise<{ sensors: { id: string; cut_list?: ListedCut[] }[] }> {
    return this.request("debrief/sensors", { store, item, sensor_ids: [sensorId], cuts: true, ...(period && { period }) });
  }

  /** A TMA solution of a contact, rooted in a period of cuts, from a first guess (CAP-21): one recorded, undoable step. Returns its id and residuals. */
  tmaCreate(store: string, item: string, base: Base, agent: Agent, request: TmaRequest, allowNewerSchema = false): Promise<Opened & { changed: boolean; feature: string; notes?: string[]; residuals: TmaResiduals }> {
    return this.request("debrief/tma_create", { store, item, base, agent, request, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /** A TMA solution's bearing residuals and RMS error (CAP-21). Changes nothing. */
  tmaResiduals(store: string, item: string, feature: string): Promise<{ residuals: TmaResiduals }> {
    return this.request("debrief/tma_residuals", { store, item, feature });
  }

  /** Rooted cuts left out of a solution's RMS error, or counted again: one step; changed false if none would change. */
  tmaExclude(store: string, item: string, base: Base, agent: Agent, feature: string, cutIds: string[], excluded: boolean, allowNewerSchema = false): Promise<Opened & { changed: boolean; notes?: string[] }> {
    return this.request("debrief/tma_exclude_cut", { store, item, base, agent, feature, cut_ids: cutIds, excluded, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /**
   * A solution split into legs at a time, or (join) a leg joined to the one before, or (side)
   * before or after its fix at that time (product owner, 27 Oct 2026, the Outline's Split
   * before and Split after): one step.
   */
  tmaSplitLeg(store: string, item: string, base: Base, agent: Agent, feature: string, at: string, join = false, allowNewerSchema = false, side?: "before" | "after"): Promise<Opened & { changed: boolean; notes?: string[] }> {
    return this.request("debrief/tma_split_leg", { store, item, base, agent, feature, at, ...(join && { join }), ...(side && { side }), ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /** Cuts deleted from the plot (product owner, 27 Oct 2026): one step; the solutions rooted in them drop them, which the notes say. */
  deleteCuts(store: string, item: string, base: Base, agent: Agent, cutIds: string[], allowNewerSchema = false): Promise<Opened & { changed: boolean; notes?: string[] }> {
    return this.request("debrief/delete_cuts", { store, item, base, agent, cut_ids: cutIds, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /** Cuts hidden on the map or shown again (product owner, 27 Oct 2026): one step; the notes say which solutions' residuals they leave or join again. */
  hideCuts(store: string, item: string, base: Base, agent: Agent, cutIds: string[], hidden: boolean, allowNewerSchema = false): Promise<Opened & { changed: boolean; notes?: string[] }> {
    return this.request("debrief/set_hidden", { store, item, base, agent, features: cutIds, hidden, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /** What a .dsf or REP file's sensor lines hold, before they are read into the plot: which track would carry each sensor (CAP-22). Changes nothing. */
  previewSensor(path: string, plot: { store: string; item: string }): Promise<SensorPreview> {
    return this.request("debrief/preview_sensor", { path, ...plot });
  }

  /** Read a .dsf or REP file's sensor lines into the plot as one step; hosts names the track for a track name the plot has not. */
  importSensor(store: string, item: string, base: Base, agent: Agent, path: string, hosts: Record<string, string | null>, again = false, allowNewerSchema = false): Promise<Opened & { changed: boolean; sensors: string[]; cuts: number; omitted: string[]; notes: string[] }> {
    return this.request("debrief/import_sensor", { store, item, base, agent, path, hosts, ...(again && { again }), ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /** A track's jumps, to show the analyst before any is removed: changes nothing (CAP-01). threshold left out: three times its median speed, at least 10 kn. */
  findJumps(store: string, item: string, base: Base, feature: string, threshold?: { value: number; unit: string }, period?: { start: string; end: string }): Promise<Opened & JumpsFound> {
    return this.request("debrief/find_jumps", { store, item, base, feature, ...(threshold && { threshold }), ...(period && { period }) });
  }

  /** The track as smoothing would leave it, and how far fixes would move: changes nothing (CAP-01). */
  previewSmoothing(
    store: string,
    item: string,
    base: Base,
    feature: string,
    window: number,
    period?: { start: string; end: string },
  ): Promise<Opened & SmoothingSummary & { preview: { type: "LineString"; coordinates: number[][] } }> {
    return this.request("debrief/preview_smoothing", { store, item, base, feature, window, ...(period && { period }) });
  }

  /**
   * Remove jumps the analyst confirmed, smooth a track, or colour, label or comment on a
   * fix: each a recorded, undoable step ("BLUE ONE: 3 jumps removed"). Fails with CONFLICT
   * if the plot changed since base.
   */
  cleanTrack(store: string, item: string, base: Base, agent: Agent, change: CleanChange, allowNewerSchema = false): Promise<Opened & { changed: boolean; feature?: string } & Partial<SmoothingSummary>> {
    const { kind, ...params } = change;
    const method = { remove_jumps: "debrief/remove_jumps", smooth: "debrief/smooth_track", mark: "debrief/mark_fix" }[kind];
    return this.request(method, { store, item, base, agent, ...params, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /** Change the plot's view (its island): never recorded or undone. Fails with CONFLICT if it changed since hash was read. */
  setView(store: string, item: string, view: PlotView | null, hash: string, agent: Agent, allowNewerSchema = false): Promise<OpenedView> {
    return this.request("debrief/set_view", { store, item, view, hash, agent, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /**
   * The Tote at one time (CAP-06): measures from the primary to each secondary, and
   * each track's own, worked out in Python. tote says which tracks; left out, the
   * plot's island says. Reads only, so it never conflicts; asked again at each time.
   */
  tote(store: string, item: string, time: string, tote?: ToteView, revision?: string): Promise<ToteResult> {
    return this.request("debrief/tote", { store, item, time, ...(tote && { tote }), ...(revision && { revision }) });
  }

  /** The measure groups the Tote can show (CAP-07): core, for now. */
  measureGroups(): Promise<{ groups: MeasureGroup[]; measures: MeasureDefinition[] }> {
    return this.request("debrief/measure_groups");
  }

  /**
   * Add a plot file received from a colleague (.geojson) with its whole history, so
   * undo, redo and provenance come with it. Refused if its history's checksums fail.
   */
  addPlotFile(store: string, path: string, agent: Agent, allowNewerSchema = false): Promise<AddedPlotFile> {
    return this.request("debrief/add_plot_file", { store, path, agent, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /** Import a REP file or a legacy plot file (.dpf) as a new plot. */
  /** Import a REP or .dpf file; for a REP file, modes says how each track is plotted (otg or dr), and remembered how to change a remembered choice. */
  importFile(store: string, path: string, agent: Agent, allowNewerSchema = false, options: { modes?: string | Record<string, string>; remembered?: string; track_name?: string } = {}): Promise<ImportReport> {
    return this.request("debrief/import", { store, path, agent, ...(allowNewerSchema && { allow_newer_schema: true }), ...options });
  }

  /**
   * What a narrative file (REP, Word or PDF) holds before it is read in, so the analyst can
   * be asked what legacy Debrief asked; given a plot, its period and tracks are taken into
   * account (debrief/preview_narrative). Changes nothing.
   */
  previewNarrative(path: string, plot?: { store: string; item: string }): Promise<NarrativePreview> {
    return this.request("debrief/preview_narrative", { path, ...plot });
  }

  /** The tracks a REP file would import, to ask how each is plotted. */
  repTracks(path: string): Promise<{ tracks: string[] }> {
    return this.request("debrief/rep_tracks", { path });
  }

  /**
   * The plot's coverage (CAP-08 to CAP-12): its platforms and every catalogue item with
   * data for each, the items marked as new data for it, and whether it may need review.
   * Reads only.
   */
  coverage(store: string, item: string): Promise<Opened & { coverage: CoverageReport }> {
    return this.request("debrief/coverage", { store, item });
  }

  /**
   * A collation step (CAP-09, CAP-11): take an item's new data, choose which item supplies
   * a period of a track, or link or unlink a track in another item as a platform; each a
   * recorded, undoable step. Fails with CONFLICT if the plot changed since base.
   */
  collate(store: string, item: string, base: Base, agent: Agent, change: CollationChange, allowNewerSchema = false): Promise<Opened & { changed: boolean; message?: string }> {
    const { kind, ...params } = change;
    const method = { take: "debrief/take_new_data", prefer: "debrief/set_source_preference", link: "debrief/link_tracks" }[kind];
    return this.request(method, { store, item, base, agent, ...params, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /** Set an item's new data aside, or clear the plot's review flag (CAP-10, CAP-12): the plot's island, never a step. */
  collationView(store: string, item: string, agent: Agent, change: { kind: "dismiss"; source: ItemRevision } | { kind: "reviewed" }): Promise<OpenedView & { changed: boolean }> {
    if (change.kind === "dismiss") return this.request("debrief/dismiss_new_data", { store, item, agent, source: change.source });
    return this.request("debrief/clear_review_flag", { store, item, agent });
  }

  /** Every plot in the analyst's catalogues that may need review (CAP-12), with the store each is in. */
  reviewFlags(): Promise<{ flags: (ReviewFlag & { store?: string })[] }> {
    return this.request("debrief/review_flags");
  }

  /** A fresh image ID for an export of the plot (SUB-25): at its current revision, or the earlier one shown. Reads only. */
  figureId(store: string, item: string, revision?: string): Promise<{ id: string; short: string; revision: string }> {
    return this.request("debrief/figure_id", { store, item, ...(revision && { revision }) });
  }

  /**
   * The image the map drew, with its ID put into its metadata and the export recorded in
   * the plot's export log (its island, never a step), or the analyst's own where the plot's
   * cannot be written; given back to write. The service writes no image file.
   */
  exportImage(
    store: string,
    item: string,
    agent: Agent,
    request: { id: string; image: string; file: string; format: string; footer: boolean; preset: string; theme: string; width: number; height: number; viewport?: Viewport; time?: TimeState; tote?: ToteView },
  ): Promise<StampedImage> {
    return this.request("debrief/export_image", { store, item, agent, ...request });
  }

  /**
   * What the service asks of the extension: an agent's export, for the open map to draw
   * (SUB-25). Waits up to wait seconds for one; polling is what tells the service a map
   * is open.
   */
  hostPoll(wait = 20): Promise<{ requests: HostRequest[] }> {
    return this.request("debrief/host_poll", { wait_s: wait });
  }

  /** The extension's answer to one of the service's requests: the export done, or why not. */
  hostAnswer(id: string, answer: { result: ExportedImage } | { problem: string }): Promise<unknown> {
    return this.request("debrief/host_answer", { id, ...answer });
  }

  /** The plots an image came from: by a file's metadata, or an ID typed from its footer. Reads only. */
  findImageSource(where: { file: string } | { id: string }): Promise<{ images: TracedImage[]; problem?: string; skipped?: { where: string; why: string }[] }> {
    return this.request("debrief/find_image_source", where);
  }

  /** The plot as it was at a revision, rebuilt by replay and checked, to show read-only; with the export log entry for the image id names. */
  openRevision(store: string, item: string, revision: string, id?: string): Promise<{ plot: DebriefFeatureCollection; step: number; current: number; latest: number; revision: string; export?: ImageExport }> {
    return this.request("debrief/open_revision", { store, item, revision, ...(id && { id }) });
  }
}

/** The image stamped with its ID and the export recorded, given back to write. */
export interface StampedImage {
  id: string;
  short: string;
  revision: string;
  /** A PNG as base 64, or an SVG's text. */
  image: string;
  recorded: boolean;
  /** Where the export is recorded: the plot's export log, the analyst's own, or neither. */
  logged?: "plot" | "user" | null;
  note?: string;
}

/** An agent's export, asked of the open map by the service (debrief/host_poll). */
export interface HostRequest {
  id: string;
  kind: "export_image";
  store: string;
  item: string;
  file: string;
  format: "png" | "svg";
  preset?: string;
  theme?: string;
  footer?: boolean;
  overwrite?: boolean;
  agent: Agent;
}

/** What exporting an image said: where it went, its ID, and whether the plot's export log has it. */
export interface ExportedImage {
  file: string;
  id: string;
  short: string;
  revision: string;
  recorded: boolean;
  note?: string;
}

/** An image ID read from a file (or typed), and the plots it names. */
export interface TracedImage {
  id: string;
  short: string;
  where: string;
  sources: FigureSource[];
}

/** The error for a change asked of a plot shown read-only: refused in the extension, never sent. */
export const READ_ONLY_CODE = -32010;
