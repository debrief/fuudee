/**
 * The Tools panel model (PAR-01, PAR-02, docs/panel-parity-srd.md): one host-neutral list that VS
 * Code's ToolsProvider (src/views/tools.ts) and the playground's Tools panel (play/toolslist.ts)
 * only render. Free of VS Code and of the DOM.
 *
 * What it decides, so that neither front end does (TL-08, TL-09, CON-10):
 * - A status row: "N selected" or "Nothing selected"; or, instead of everything, why there is
 *   nothing to list: the tools starting ("Starting tools…", the playground's Python start-up
 *   included, §5), no plot open ("Open a plot to use tools.") or a problem.
 * - The sections, with their counts, in order: "For the Outline's selection" (only when it has
 *   entries), "For this selection", "Other tools", "Not available" (only when something is, with
 *   the reason). Which start open: the first two.
 * - What each row says: its label, its detail (what a tool needs, why an entry or a tool cannot
 *   act), its tooltip (a tool's title, explanation and judgement), what a screen reader hears, its
 *   icon (a codicon id) and what choosing it runs: an action of the catalogue (panels/actions.ts).
 *
 * Which tools apply is decided in Python (debrief/tools_for_selection, PAR-15); the entries for
 * the Outline's selection by outlinemodel.ts's outlineOperations. This only presents them.
 */
import type { ToolDeclaration } from "@debrief/schemas";
import { needs } from "../../src/wording.js";
import type { Operation, OperationId } from "../outlinemodel.js";

/** What the Tools say while the tool service (or the playground's Python) starts. */
export const STARTING = "Starting tools…";
/** What the Tools say with no plot open. */
export const NO_PLOT = "Open a plot to use tools.";

/** The action each of the Outline's entries runs (the action catalogue's, PAR-05). */
export const OPERATION_COMMANDS: Record<OperationId, string> = {
  "split-before": "debrief.splitBeforeFix",
  "split-after": "debrief.splitAfterFix",
  "hide-cuts": "debrief.hideCuts",
  "show-cuts": "debrief.showCuts",
  "delete-cuts": "debrief.deleteCuts",
  "leave-out": "debrief.tmaLeaveOut",
  "count-in": "debrief.tmaCountIn",
  "keep-port": "debrief.keepPort",
  "keep-starboard": "debrief.keepStarboard",
  "keep-ambiguous": "debrief.makeAmbiguous",
  "tma-from-cuts": "debrief.tmaFromCuts",
};
/** What opens a tool's form. */
export const OPEN_TOOL = "debrief.showToolForm";

/** A library or tool found but not offered, and why (TL-03, TL-09). */
export interface Unavailable {
  library: string;
  tool: string | null;
  reason: string;
}

/** What the Tools are built from. */
export interface ToolsInput {
  /** The tools, once the tool service (or Python) has started; undefined while it starts. */
  listing?: { tools: readonly ToolDeclaration[]; unavailable: readonly Unavailable[] };
  /** Why there are no tools: the service stopped or could not start. */
  problem?: string;
  plotOpen: boolean;
  /** How many features are selected. */
  selected: number;
  /** The tools offered for the selection, by name (debrief/tools_for_selection). */
  offered: readonly string[];
  /** The entries for the Outline's selection (outlinemodel.ts outlineOperations). */
  operations: readonly Operation[];
}

export type SectionId = "outline" | "offered" | "other" | "unavailable";

export type ToolsNode =
  | { kind: "status"; key: string; text: string; icon: string }
  | { kind: "section"; key: string; id: SectionId; label: string; count: number }
  | { kind: "operation"; key: string; op: Operation }
  | { kind: "tool"; key: string; tool: ToolDeclaration; offered: boolean }
  | { kind: "unavailable"; key: string; label: string; reason: string };

/** A tool's tooltip, in parts, so VS Code can set its title in bold and its judgement in italics (cosmetic). */
export interface ToolTip {
  title: string;
  explanation: string;
  judgement?: string;
}

/** A row as both front ends render it. */
export interface ToolsRow {
  key: string;
  kind: ToolsNode["kind"];
  label: string;
  /** What VS Code's description and the playground's detail say. */
  detail: string;
  tooltip?: string;
  tip?: ToolTip;
  /** What a screen reader hears. */
  aria: string;
  /** A codicon id; the playground draws its own artwork for it. */
  icon: string;
  /** Whether it opens (a section), and whether it is open when first shown. */
  branch: boolean;
  open: boolean;
  /** Whether choosing it acts: a tool offered, an entry that can act. */
  enabled: boolean;
  /** What choosing it runs (an action of the catalogue) with its arguments; a disabled entry still runs, to say why. */
  run?: { action: string; args: readonly unknown[] };
}

export class ToolsModel {
  constructor(private readonly input: ToolsInput) {}

  /** The rows at the top: why there is nothing, or the status row and the sections. */
  get roots(): ToolsNode[] {
    const { listing, problem, plotOpen, selected, offered, operations } = this.input;
    if (problem) return [{ kind: "status", key: "tools:problem", text: problem, icon: "warning" }];
    if (!listing) return [{ kind: "status", key: "tools:starting", text: STARTING, icon: "loading~spin" }];
    if (!plotOpen) return [{ kind: "status", key: "tools:no-plot", text: NO_PLOT, icon: "info" }];
    const offeredCount = listing.tools.filter((t) => offered.includes(t.name)).length;
    const section = (id: SectionId, label: string, count: number): ToolsNode => ({ kind: "section", key: `tools:${id}`, id, label, count });
    return [
      { kind: "status", key: "tools:status", text: selected ? `${selected} selected` : "Nothing selected", icon: selected ? "pass-filled" : "circle-large-outline" },
      ...(operations.length ? [section("outline", "For the Outline's selection", operations.length)] : []),
      section("offered", "For this selection", offeredCount),
      section("other", "Other tools", listing.tools.length - offeredCount),
      ...(listing.unavailable.length ? [section("unavailable", "Not available", listing.unavailable.length)] : []),
    ];
  }

  children(node: ToolsNode): ToolsNode[] {
    if (node.kind !== "section") return [];
    const { listing, offered, operations } = this.input;
    const tools = listing?.tools ?? [];
    switch (node.id) {
      case "outline":
        return operations.map((op) => ({ kind: "operation", key: `operation:${op.id}`, op }));
      case "offered":
        return tools.filter((t) => offered.includes(t.name)).map((tool) => ({ kind: "tool", key: `tool:${tool.name}:true`, tool, offered: true }));
      case "other":
        return tools.filter((t) => !offered.includes(t.name)).map((tool) => ({ kind: "tool", key: `tool:${tool.name}:false`, tool, offered: false }));
      case "unavailable":
        return (listing?.unavailable ?? []).map((u, i) => ({ kind: "unavailable", key: `unavailable:${i}`, label: u.tool ?? u.library, reason: u.reason }));
    }
  }

  row(node: ToolsNode): ToolsRow {
    const base = { key: node.key, kind: node.kind, branch: false, open: false, enabled: false, detail: "" };
    switch (node.kind) {
      case "status":
        return { ...base, label: node.text, aria: node.text, icon: node.icon };
      case "section":
        return { ...base, label: node.label, detail: String(node.count), aria: `${node.label}, ${node.count}`, icon: "", branch: true, open: node.id === "outline" || node.id === "offered" };
      case "operation": {
        const { op } = node;
        const run = { action: OPERATION_COMMANDS[op.id], args: [] };
        return op.enabled
          ? { ...base, label: op.label, tooltip: op.detail, aria: op.label, icon: "play", enabled: true, run }
          : // Still runs, to say why it cannot act (a screen reader hears the reason either way).
            { ...base, label: op.label, detail: op.reason ?? "", tooltip: `${op.detail}. ${op.reason ?? ""}`, aria: `${op.label}, not available: ${op.reason ?? ""}`, icon: "circle-slash", run };
      }
      case "tool": {
        const { tool } = node;
        const tip: ToolTip = { title: tool.title, explanation: tool.explanation, ...(tool.judgement && { judgement: tool.judgement }) };
        const tooltip = [tip.title, tip.explanation, tip.judgement].filter(Boolean).join("\n\n");
        return node.offered
          ? { ...base, label: tool.title, tooltip, tip, aria: tool.title, icon: "play", enabled: true, run: { action: OPEN_TOOL, args: [tool.name] } }
          : { ...base, label: tool.title, detail: needs(tool), tooltip, tip, aria: `${tool.title}, ${needs(tool)}`, icon: "circle-slash" };
      }
      case "unavailable":
        return { ...base, label: node.label, detail: node.reason, tooltip: node.reason, aria: `${node.label}, not available: ${node.reason}`, icon: "error" };
    }
  }

  /** Every row, in order, with the sections' rows under them, for tests and agents. */
  rows(): ToolsRow[] {
    return this.roots.flatMap((n) => [this.row(n), ...this.children(n).map((c) => this.row(c))]);
  }
}
