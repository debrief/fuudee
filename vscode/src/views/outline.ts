/**
 * Outline: one sectioned tree of plot features, supporting files and
 * reference data (SUB-31). Selecting features here selects them everywhere.
 */
import * as vscode from "vscode";
import type { Session } from "../session.js";
import { describeTimes } from "../format.js";

type Feature = NonNullable<Session["current"]>["plot"]["features"][number];
type Node =
  | { kind: "section"; id: "features" | "files" | "reference"; label: string }
  | { kind: "group"; id: string; label: string; features: Feature[] }
  | { kind: "feature"; feature: Feature }
  | { kind: "file"; title: string; fileKind: string; href: string }
  | { kind: "empty"; text: string };

const GROUPS: { id: string; label: string; kind: string }[] = [
  { id: "tracks", label: "Tracks", kind: "track" },
  { id: "annotations", label: "Annotations", kind: "annotation" },
  { id: "sensors", label: "Sensor observations", kind: "sensor_observations" },
];

export class OutlineProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly nodes = new Map<string, Node>();

  constructor(private readonly session: Session) {
    session.onPlot(() => this.changed.fire());
    session.onSelection(() => this.changed.fire());
  }

  featureNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  getParent(): undefined {
    return undefined;
  }

  getChildren(node?: Node): Node[] {
    const opened = this.session.current;
    if (!opened) return [];
    if (!node) {
      return [
        { kind: "section", id: "features", label: "Plot features" },
        { kind: "section", id: "files", label: "Supporting files" },
        { kind: "section", id: "reference", label: "Reference data" },
      ];
    }
    if (node.kind === "section" && node.id === "features") {
      return GROUPS.map((g) => ({
        kind: "group" as const,
        id: g.id,
        label: g.label,
        features: opened.plot.features.filter((f) => f.properties.kind === g.kind),
      })).filter((g) => g.features.length);
    }
    if (node.kind === "section" && node.id === "files") {
      const files = opened.files.map((f) => ({ kind: "file" as const, title: f.title, fileKind: f.kind, href: f.href }));
      return files.length ? files : [{ kind: "empty", text: "None" }];
    }
    if (node.kind === "section") return [{ kind: "empty", text: "None yet" }];
    if (node.kind === "group") {
      return node.features.map((feature) => {
        const child: Node = { kind: "feature", feature };
        this.nodes.set(feature.id, child);
        return child;
      });
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const expanded = vscode.TreeItemCollapsibleState.Expanded;
    switch (node.kind) {
      case "section":
        return Object.assign(new vscode.TreeItem(node.label, expanded), { id: `section:${node.id}` });
      case "group":
        return Object.assign(new vscode.TreeItem(node.label, expanded), {
          id: `group:${node.id}`,
          description: String(node.features.length),
        });
      case "empty":
        return Object.assign(new vscode.TreeItem(node.text), { description: "" });
      case "file": {
        const item = new vscode.TreeItem(node.title);
        item.description = node.fileKind;
        item.iconPath = new vscode.ThemeIcon(node.fileKind === "source" ? "lock" : "file");
        item.tooltip = node.fileKind === "source" ? "Source: never changed by Debrief" : node.href;
        item.resourceUri = vscode.Uri.file(node.href);
        item.command = { command: "vscode.open", title: "Open", arguments: [vscode.Uri.file(node.href)] };
        return item;
      }
      case "feature": {
        const { feature } = node;
        const selected = this.session.selection.includes(feature.id);
        const item = new vscode.TreeItem(feature.properties.name);
        item.id = `feature:${feature.id}`;
        item.iconPath = new vscode.ThemeIcon(
          { track: "pulse", annotation: "symbol-misc", sensor_observations: "radio-tower" }[feature.properties.kind] ??
            "circle",
          selected ? new vscode.ThemeColor("list.highlightForeground") : undefined,
        );
        const props = feature.properties as { times?: string[]; time?: string };
        item.description = [
          selected ? "selected" : "",
          props.times ? describeTimes(props.times[0], props.times.at(-1)) : describeTimes(props.time),
        ]
          .filter(Boolean)
          .join(" · ");
        item.contextValue = "feature";
        return item;
      }
    }
  }
}

export function featureIdsOf(nodes: readonly Node[]): string[] {
  return nodes.flatMap((n) => (n.kind === "feature" ? [n.feature.id] : []));
}
