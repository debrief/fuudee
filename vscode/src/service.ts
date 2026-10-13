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
import type { AnnotationSpec, DebriefFeatureCollection, PlotView, SharedState, ToolDeclaration, ToolResult, TrackEdit } from "@debrief/schemas";
import type { ToolOutcome } from "./diagnostics.js";

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
}

/** A change to the plot's annotations, made by hand or by an agent (CAP-03). */
export type AnnotationChange =
  | { kind: "add"; annotation: AnnotationSpec }
  | { kind: "edit"; feature: string; annotation: Partial<AnnotationSpec> }
  | { kind: "delete"; features: string[] }
  | { kind: "north_arrow"; shown: boolean };

/** A change to the plot's tracks, made by hand or by an agent (CAP-01). */
export type TrackChange =
  | { kind: "edit"; feature: string; edit: TrackEdit; current_time?: string }
  | { kind: "split"; feature: string; at: string; names?: [string, string] }
  | { kind: "merge"; features: string[]; name?: string };

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
  jumps: { time: string; position: number[]; speed: { value: number; unit: string } | null; since: string }[];
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

export interface ServiceOptions {
  python: string;
  timeoutSeconds: number;
  log: (line: string) => void;
  env?: Record<string, string>;
  startTimeoutMs?: number;
}

/** Check the interpreter before starting it, so a wrong one gets a useful message. */
export function checkPython(python: string): string | undefined {
  const probe = spawnSync(
    python,
    ["-c", "import sys, importlib.util as u; print(sys.version_info[0], sys.version_info[1], u.find_spec('debrief_tools') is not None)"],
    { encoding: "utf8", timeout: 20000, windowsHide: true },
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
    const problem = checkPython(options.python);
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

  /** One JSON-RPC request. No time limit here: the service stops tools that overrun. */
  private request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
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
              else resolve(parsed.result as T);
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

  /** Open a plot: finish any change a crash interrupted, and say where its history stands. */
  open(store: string, item: string, agent: Agent): Promise<OpenedView> {
    return this.request("debrief/open", { store, item, agent });
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
   * Add a plot file received from a colleague (.geojson) with its whole history, so
   * undo, redo and provenance come with it. Refused if its history's checksums fail.
   */
  addPlotFile(store: string, path: string, agent: Agent, allowNewerSchema = false): Promise<AddedPlotFile> {
    return this.request("debrief/add_plot_file", { store, path, agent, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }

  /** Import a REP file or a legacy plot file (.dpf) as a new plot. */
  importFile(store: string, path: string, agent: Agent, allowNewerSchema = false): Promise<ImportReport> {
    return this.request("debrief/import", { store, path, agent, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }
}
