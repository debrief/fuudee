/**
 * Local logs with no plot data in them (NFR-14), by the same rules as the
 * Python service (debrief_tools.diagnostics, held to schemas/vectors/redaction.json):
 *
 * - nothing free-text is logged: lines are fixed words and outcome codes, and
 *   ids and paths appear only as keyed hashes (hashed());
 * - a tool run is logged as the names and kinds of its parameters, never their values;
 * - every line still passes through redact() as a second line of defence:
 *   quoted text, file paths and file URIs become short keyed hashes.
 *
 * Hashes are HMAC-SHA256 under a 32-byte key made once per install and kept
 * beside the user's configuration (log-key), never in the log folder. The
 * service is given the same key (DEBRIEF_LOG_KEY), so its lines and ours
 * hash the same things alike. See the Python module for redact()'s limits.
 */
import { createHmac, randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configPath } from "@debrief/config";
import type { ToolDeclaration } from "@debrief/schemas";

const KEY_FILE = "log-key";
const parseKey = (text: string): Buffer | undefined =>
  /^[0-9a-fA-F]{64}$/.test(text.trim()) ? Buffer.from(text.trim(), "hex") : undefined;

/** Where the install's log key lives: beside the configuration, not with the logs. */
export function logKeyFile(env: Record<string, string | undefined> = process.env): string {
  return path.join(path.dirname(configPath(env)), KEY_FILE);
}

/**
 * The install's log key: DEBRIEF_LOG_KEY, else the key file, made (0600) if
 * missing. If none can be read or kept, a key for this window alone.
 */
export function loadLogKey(env: Record<string, string | undefined> = process.env, file: string = logKeyFile(env)): Buffer {
  const fromEnv = parseKey(env.DEBRIEF_LOG_KEY ?? "");
  if (fromEnv) return fromEnv;
  const read = () => parseKey(readFileSync(file, "ascii"));
  try {
    const existing = read();
    if (existing) return existing;
    unlinkSync(file); // not a key: make a new one
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return randomBytes(32);
  }
  const key = randomBytes(32);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, key.toString("hex"), { encoding: "ascii", mode: 0o600, flag: "wx" });
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") return key;
    try {
      return read() ?? key; // made meanwhile by another process: use theirs
    } catch {
      return key;
    }
  }
}

let currentKey: Buffer | undefined;
/** Use this key for hashing (undefined: load the install's key when next needed). */
export function setLogKey(key: Buffer | undefined): void {
  currentKey = key;
}
export function logKey(): Buffer {
  currentKey ??= loadLogKey();
  return currentKey;
}

/** The first 8 hex digits of HMAC-SHA256(key, text). */
export function keyedHash(text: string, key: Buffer = logKey()): string {
  return createHmac("sha256", key).update(text, "utf8").digest("hex").slice(0, 8);
}

/** An id, name or path as it may appear in a log line. */
export const hashed = (text: string): string => `<text:${keyedHash(text)}>`;

// A path runs to the next space or quote, without trailing punctuation.
const REST = String.raw`(?:[^\s'"]*[^\s'":;,.!?)\]])?`;
// Windows folder names may hold spaces; the last part may too when the path runs to ": " or EOL.
const WIN_SEG = String.raw`[^\\\n:*?"<>|]`;
const WIN_TAIL = String.raw`(?:(?:${WIN_SEG}*\\)*(?:${WIN_SEG}*(?=:\s|:$|\n|$)|${REST}))`;
const DONE = String.raw`(?!<(?:text|path):[0-9a-f]{8}>)`; // already redacted: left as it is
const SINGLE = String.raw`(?:[^'\n]|(?<=\w)'(?=\w))*`; // an apostrophe inside a word stays inside the quotes
const CURLY_SINGLE = String.raw`(?:[^’\n]|(?<=\w)’(?=\w))*`;
const RULES: [RegExp, "text" | "path", string, string][] = [
  [new RegExp(String.raw`\bfile://` + REST, "g"), "path", "", ""],
  [new RegExp(String.raw`(?<!\w)'${DONE}(${SINGLE})'(?!\w)`, "g"), "text", "'", "'"],
  [new RegExp(String.raw`"${DONE}([^"\n]*)"`, "g"), "text", '"', '"'],
  [new RegExp(String.raw`(?<!\w)‘${DONE}(${CURLY_SINGLE})’(?!\w)`, "g"), "text", "‘", "’"],
  [new RegExp(String.raw`“${DONE}([^”\n]*)”`, "g"), "text", "“", "”"],
  [new RegExp(String.raw`\\\\[^\s'"\\]+\\` + WIN_TAIL, "g"), "path", "", ""],
  [new RegExp(String.raw`(?<!\w)[A-Za-z]:\\` + WIN_TAIL, "g"), "path", "", ""],
  [new RegExp(String.raw`(?<!\w)[A-Za-z]:/` + REST, "g"), "path", "", ""],
  [new RegExp(String.raw`(?<![\w.:/<])/[^\s'"/]+/` + REST, "g"), "path", "", ""],
];

/** The text with quoted text, file paths and file URIs replaced by short keyed hashes. */
export function redact(text: string, key: Buffer = logKey()): string {
  return RULES.reduce(
    (out, [pattern, kind, before, after]) =>
      out.replace(pattern, (match: string, inner?: unknown) =>
        `${before}<${kind}:${keyedHash(typeof inner === "string" ? inner : match, key)}>${after}`,
      ),
    text,
  );
}

const LEVEL = /^(DEBUG|INFO|WARNING|ERROR|CRITICAL) /;
const FRAME = /^\s*File "(.*)", line (\d+), in (\S+)\s*$/;
// The lines of an exception as the service's formatter writes it: type, hashed message, frames.
const SAFE_EXCEPTION = /^(?:(?:caused by )?[\w.]+ message=<text:[0-9a-f]{8}>|  at [\w.<>-]+:\d+:[\w.<>]+)$/;
/**
 * A line the tool service wrote to stdout or stderr, as the log may hold it.
 * The service's own log lines (LEVEL message) carry no free text and are
 * redacted again; a raw traceback frame keeps only file.py:line:function;
 * anything else (a tool's print, a crash message) is free text, so only its
 * hash is kept.
 */
export function serviceLine(line: string): string | undefined {
  if (!line.trim()) return undefined;
  if (LEVEL.test(line) || SAFE_EXCEPTION.test(line)) return redact(line);
  const frame = FRAME.exec(line);
  if (frame) return `  at ${frame[1].split(/[\\/]/).pop()}:${frame[2]}:${frame[3]}`;
  return `service_output text=<text:${keyedHash(line)}>`;
}

/** How a tool run ended: the same words in the service's log and ours. */
export type ToolOutcome =
  | "changed"
  | "unchanged"
  | "refused"
  | "failed"
  | "conflict"
  | "timed_out"
  | "crashed"
  | "saved_as_new_plot"
  | "needs_newer_schema_confirmed";

/** The log line for one tool run: names and kinds of declared parameters, never values. */
export function toolRunLine(
  tool: ToolDeclaration,
  supplied: Record<string, unknown>,
  selected: number,
  outcome: ToolOutcome,
  ms: number,
): string {
  const kinds = new Map((tool.parameters ?? []).map((p) => [p.name, String(p.kind)]));
  const names = Object.keys(supplied).sort();
  const known = names.filter((n) => kinds.has(n)).map((n) => `${n}:${kinds.get(n)}`);
  const unknown = names.length - known.length;
  return (
    `tool_run tool=${tool.name} version=${tool.version ?? "-"} parameters=${known.join(",") || "-"}` +
    (unknown ? ` undeclared_parameters=${unknown}` : "") +
    ` selected=${selected} outcome=${outcome} ms=${Math.round(ms)}`
  );
}

const MAX_BYTES = 1_000_000;

/**
 * A redacted log file in VS Code's log folder for this extension, rotated once
 * at 1 MB, echoed to the Debrief output channel. This is the only thing that
 * writes to the output channel. Writing it never fails Debrief: a log that
 * can't be written is skipped.
 */
export class DiagnosticLog {
  readonly file: string;

  constructor(folder: string, private readonly echo: (line: string) => void) {
    this.file = path.join(folder, "debrief.log");
    try {
      mkdirSync(folder, { recursive: true });
    } catch {
      // logging must never stop Debrief
    }
  }

  write(level: "info" | "warning" | "error", text: string): void {
    const line = redact(text);
    this.echo(line);
    try {
      if ((statSync(this.file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) {
        renameSync(this.file, `${this.file}.1`);
      }
      appendFileSync(this.file, `${new Date().toISOString()} ${level.toUpperCase()} ${line}\n`, "utf8");
    } catch {
      // logging must never stop Debrief
    }
  }
}
