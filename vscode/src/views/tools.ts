/**
 * Tools view: the tools that apply to the current selection, and why the
 * others don't (TL-08, TL-09, CON-10). Which tools apply is decided in Python
 * (debrief/tools_for_selection); this view only presents it.
 *
 * Above them, the entries for the Outline's selection (product owner, 27 Oct 2026): Split
 * before and Split after a position of a TMA solution's leg; Hide, Show and Delete cuts; Leave
 * out of the solution and Count in it; Keep port, Keep starboard and Make ambiguous again; TMA
 * solution from cuts. Each a command (OPERATION_COMMANDS), also on the Outline's menus, shown
 * when the selection has what it acts on and, when it cannot act, with the reason.
 */
import * as vscode from "vscode";
import type { ToolDeclaration } from "@debrief/schemas";
import type { Session } from "../session.js";
import type { ToolListing } from "../service.js";
import { needs } from "../wording.js";
import type { Operation, OperationId } from "../../webview/outlinemodel.js";

/** The command each of the Outline's entries runs. */
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

type Node =
  | { kind: "status"; text: string; icon: string }
  | { kind: "section"; id: "outline" | "offered" | "other" | "unavailable"; label: string; count: number }
  | { kind: "tool"; tool: ToolDeclaration; offered: boolean }
  | { kind: "operation"; op: Operation }
  | { kind: "unavailable"; label: string; reason: string };

export class ToolsProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  listing?: ToolListing;
  offered: string[] = [];
  problem?: string;

  constructor(
    private readonly session: Session,
    /** The entries for the Outline's selection, as it stands. */
    private readonly operations: () => Operation[] = () => [],
  ) {}

  update(listing: ToolListing | undefined, offered: string[], problem?: string): void {
    this.listing = listing;
    this.offered = offered;
    this.problem = problem;
    this.changed.fire();
  }

  /** The Outline's selection changed (or what Bearings shows): its entries again. */
  refresh(): void {
    this.changed.fire();
  }

  getChildren(node?: Node): Node[] {
    if (this.problem) return [{ kind: "status", text: this.problem, icon: "warning" }];
    if (!this.listing) return [{ kind: "status", text: "Starting tools…", icon: "loading~spin" }];
    if (!this.session.current) return [{ kind: "status", text: "Open a plot to use tools.", icon: "info" }];
    const tools = this.listing.tools;
    if (!node) {
      const count = this.session.selection.length;
      const status: Node = {
        kind: "status",
        text: count ? `${count} selected` : "Nothing selected",
        icon: count ? "pass-filled" : "circle-large-outline",
      };
      const ops = this.operations();
      return [
        status,
        ...(ops.length ? [{ kind: "section" as const, id: "outline" as const, label: "For the Outline's selection", count: ops.length }] : []),
        { kind: "section", id: "offered", label: "For this selection", count: this.offered.length },
        { kind: "section", id: "other", label: "Other tools", count: tools.length - this.offered.length },
        ...(this.listing.unavailable.length
          ? [{ kind: "section" as const, id: "unavailable" as const, label: "Not available", count: this.listing.unavailable.length }]
          : []),
      ];
    }
    if (node.kind !== "section") return [];
    if (node.id === "outline") return this.operations().map((op) => ({ kind: "operation", op }));
    if (node.id === "offered") return tools.filter((t) => this.offered.includes(t.name)).map((tool) => ({ kind: "tool", tool, offered: true }));
    if (node.id === "other") return tools.filter((t) => !this.offered.includes(t.name)).map((tool) => ({ kind: "tool", tool, offered: false }));
    return this.listing.unavailable.map((u) => ({ kind: "unavailable", label: u.tool ?? u.library, reason: u.reason }));
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "status":
        return Object.assign(new vscode.TreeItem(node.text), { iconPath: new vscode.ThemeIcon(node.icon) });
      case "section": {
        const state =
          node.id === "offered" || node.id === "outline" ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
        return Object.assign(new vscode.TreeItem(node.label, state), {
          id: `tools:${node.id}`,
          description: String(node.count),
        });
      }
      case "operation": {
        const item = new vscode.TreeItem(node.op.label);
        item.id = `operation:${node.op.id}`;
        item.tooltip = node.op.enabled ? node.op.detail : `${node.op.detail}. ${node.op.reason ?? ""}`;
        if (node.op.enabled) {
          item.iconPath = new vscode.ThemeIcon("play");
          item.command = { command: OPERATION_COMMANDS[node.op.id], title: node.op.label };
        } else {
          item.iconPath = new vscode.ThemeIcon("circle-slash");
          item.description = node.op.reason;
          // Still runs, to say why it cannot act (a screen reader hears the reason either way).
          item.command = { command: OPERATION_COMMANDS[node.op.id], title: node.op.label };
        }
        item.accessibilityInformation = { label: node.op.enabled ? node.op.label : `${node.op.label}, not available: ${node.op.reason ?? ""}` };
        return item;
      }
      case "tool": {
        const item = new vscode.TreeItem(node.tool.title);
        item.id = `tool:${node.tool.name}:${node.offered}`;
        item.tooltip = new vscode.MarkdownString(
          `**${node.tool.title}**\n\n${node.tool.explanation}${node.tool.judgement ? `\n\n_${node.tool.judgement}_` : ""}`,
        );
        if (node.offered) {
          item.iconPath = new vscode.ThemeIcon("play");
          item.command = { command: "debrief.showToolForm", title: "Open tool", arguments: [node.tool.name] };
        } else {
          item.iconPath = new vscode.ThemeIcon("circle-slash");
          item.description = needs(node.tool);
        }
        return item;
      }
      case "unavailable": {
        const item = new vscode.TreeItem(node.label);
        item.iconPath = new vscode.ThemeIcon("error");
        item.description = node.reason;
        item.tooltip = node.reason;
        return item;
      }
    }
  }
}
