/**
 * Local logs with no plot data in them (NFR-14), by the same rules as the
 * Python service (debrief_tools.diagnostics, held to schemas/vectors/redaction.json):
 * quoted text and file paths become short hashes, and a tool run is logged as
 * the names and kinds of its parameters, never their values.
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import type { ToolDeclaration } from "@debrief/schemas";

const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
// A path runs to the next space or quote, without trailing punctuation.
const REST = String.raw`(?:[^\s'"]*[^\s'":;,.!?)\]])?`;
const RULES: [RegExp, (match: string, inner: string) => string][] = [
  // Text already redacted (a service line passed on) is left as it is.
  [/(?<!\w)'(?!<text:)([^'\n]*)'(?!\w)/g, (_, inner) => `'<text:${hash(inner)}>'`],
  [/"(?!<text:)([^"\n]*)"/g, (_, inner) => `"<text:${hash(inner)}>"`],
  [new RegExp(String.raw`\\\\[^\s'"\\]+\\` + REST, "g"), (match) => `<path:${hash(match)}>`],
  [new RegExp(String.raw`(?<!\w)[A-Za-z]:[\\/]` + REST, "g"), (match) => `<path:${hash(match)}>`],
  [new RegExp(String.raw`(?<![\w.:/<])/[^\s'"/]+/` + REST, "g"), (match) => `<path:${hash(match)}>`],
];

/** The text with quoted text and file paths replaced by short hashes. */
export function redact(text: string): string {
  return RULES.reduce((out, [pattern, replace]) => out.replace(pattern, replace), text);
}

/** The log line for one tool run: names and kinds of declared parameters, never values. */
export function toolRunLine(
  tool: ToolDeclaration,
  supplied: Record<string, unknown>,
  selected: number,
  outcome: string,
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
 * at 1 MB. Writing it never fails Debrief: a log that can't be written is skipped.
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
