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
import type { Presentation, SharedState, ToolDeclaration, ToolResult } from "@debrief/schemas";
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
}

export interface Opened {
  base: Base;
  /** What opening had to repair after a crash, for the analyst (NFR-10). */
  recovered: string[];
}

export interface ImportReport {
  item: string;
  tracks: string[];
  fixes: number;
  omitted: string[];
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
  open(store: string, item: string): Promise<Opened> {
    return this.request("debrief/open", { store, item });
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

  /** Replace a plot's presentation (SUB-22). Fails with CONFLICT if it changed since hash was read. */
  setPresentation(store: string, item: string, presentation: Presentation, hash: string): Promise<{ hash: string }> {
    return this.request("debrief/set_presentation", { store, item, presentation, hash });
  }

  importRep(store: string, path: string, agent: Agent, allowNewerSchema = false): Promise<ImportReport> {
    return this.request("debrief/import_rep", { store, path, agent, ...(allowNewerSchema && { allow_newer_schema: true }) });
  }
}
