/**
 * The Python tool service, started per user by the extension (SEC-06 to SEC-08).
 *
 * The extension generates a fresh token for each session, passes it in the
 * service's environment (never on the command line), and talks to the
 * service over MCP's HTTP transport on 127.0.0.1 only.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import type { ToolDeclaration, ToolResult } from "@debrief/schemas";

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
  message: string;
  result?: ToolResult;
  changed?: boolean;
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

export class ServiceError extends Error {}

export interface ServiceOptions {
  python: string;
  timeoutSeconds: number;
  log: (line: string) => void;
  env?: Record<string, string>;
}

export class ToolService {
  private nextId = 1;

  private constructor(
    private readonly process: ChildProcess,
    private readonly url: string,
    private readonly token: string,
  ) {}

  /** Start the service and wait until it is listening. */
  static start(options: ServiceOptions): Promise<ToolService> {
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
      const lines = createInterface({ input: child.stdout! });
      const fail = (message: string) => reject(new ServiceError(message));
      child.once("error", (error) =>
        fail(`Debrief could not start its tool service with "${options.python}": ${error.message}`),
      );
      child.once("exit", (code) => fail(`Debrief's tool service stopped as it started (exit code ${code}).`));
      lines.once("line", (line) => {
        try {
          const { port } = JSON.parse(line) as { port: number };
          // 127.0.0.1, not localhost: the service listens on IPv4 loopback only.
          resolve(new ToolService(child, `http://127.0.0.1:${port}/mcp`, token));
        } catch {
          fail(`Debrief's tool service did not start: ${line}`);
        }
        lines.on("line", options.log);
      });
    });
  }

  get running(): boolean {
    return this.process.exitCode === null && !this.process.killed;
  }

  onExit(listener: (code: number | null) => void): void {
    this.process.once("exit", listener);
  }

  stop(): void {
    this.process.kill();
  }

  private async request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
    } catch (error) {
      throw new ServiceError(`Debrief's tool service is not responding: ${(error as Error).message}`);
    }
    if (!response.ok) throw new ServiceError(`Debrief's tool service refused the request (${response.status}).`);
    const body = (await response.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new ServiceError(body.error.message);
    return body.result as T;
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
    args: { store: string; item: string; selection: string[]; parameters: Record<string, unknown>; agent: Agent },
  ): Promise<CallOutcome> {
    const result = await this.request<{
      isError: boolean;
      content: { text: string }[];
      structuredContent?: { result: ToolResult; changed: boolean };
    }>("tools/call", { name, arguments: args });
    const message = result.content[0]?.text.split("\n")[0] ?? "";
    return result.isError
      ? { ok: false, message }
      : { ok: true, message, result: result.structuredContent?.result, changed: result.structuredContent?.changed };
  }

  createCatalogue(location: string, title: string): Promise<{ store: string }> {
    return this.request("debrief/create_catalogue", { location, title });
  }

  importRep(store: string, path: string, agent: Agent): Promise<ImportReport> {
    return this.request("debrief/import_rep", { store, path, agent });
  }
}
