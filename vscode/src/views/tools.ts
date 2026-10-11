/**
 * Tools view: the tools that apply to the current selection, and why the
 * others don't (TL-08, TL-09, CON-10). Which tools apply is decided in Python
 * (debrief/tools_for_selection); this view only presents it.
 */
import * as vscode from "vscode";
import type { ToolDeclaration } from "@debrief/schemas";
import type { Session } from "../session.js";
import type { ToolListing } from "../service.js";
import { needs } from "../wording.js";

type Node =
  | { kind: "status"; text: string; icon: string }
  | { kind: "section"; id: "offered" | "other" | "unavailable"; label: string; count: number }
  | { kind: "tool"; tool: ToolDeclaration; offered: boolean }
  | { kind: "unavailable"; label: string; reason: string };

export class ToolsProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  listing?: ToolListing;
  offered: string[] = [];
  problem?: string;

  constructor(private readonly session: Session) {}

  update(listing: ToolListing | undefined, offered: string[], problem?: string): void {
    this.listing = listing;
    this.offered = offered;
    this.problem = problem;
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
      return [
        status,
        { kind: "section", id: "offered", label: "For this selection", count: this.offered.length },
        { kind: "section", id: "other", label: "Other tools", count: tools.length - this.offered.length },
        ...(this.listing.unavailable.length
          ? [{ kind: "section" as const, id: "unavailable" as const, label: "Not available", count: this.listing.unavailable.length }]
          : []),
      ];
    }
    if (node.kind !== "section") return [];
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
          node.id === "offered" ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
        return Object.assign(new vscode.TreeItem(node.label, state), {
          id: `tools:${node.id}`,
          description: String(node.count),
        });
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
