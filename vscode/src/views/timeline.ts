/**
 * The Timeline view (CAP-05): the open plot's time-only annotations, such as
 * narrative notes and periods of interest, in time order. Choosing one moves
 * current time to it (debrief.goToTime); the entry current time is at is
 * marked, and moves as current time does. A native tree, so it is read by
 * screen readers and works from the keyboard like any VS Code view.
 */
import * as vscode from "vscode";
import type { Session } from "../session.js";
import { currentEntry, timelineEntries, type TimelineEntry } from "../timeline.js";

export class TimelineProvider implements vscode.TreeDataProvider<TimelineEntry> {
  private readonly changed = new vscode.EventEmitter<TimelineEntry[] | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  entries: TimelineEntry[] = [];
  private current = -1;

  constructor(private readonly session: Session) {
    session.onPlot((opened) => {
      this.entries = opened ? timelineEntries(opened.plot) : [];
      this.current = this.at();
      this.changed.fire(undefined);
    });
    session.onState((change) => {
      if (!change.time) return;
      // Redraw only the two entries whose marking changed.
      const next = this.at();
      if (next === this.current) return;
      const touched = [this.entries[this.current], this.entries[next]].filter(Boolean);
      this.current = next;
      this.changed.fire(touched);
      // The view follows current time, as a narrative is read along with a replay.
      const entry = this.entries[next];
      if (entry && this.view?.visible) void this.view.reveal(entry, { select: false, focus: false }).then(undefined, () => undefined);
    });
  }

  /** The view showing this tree, so it can keep the entry at current time in sight. */
  view?: vscode.TreeView<TimelineEntry>;

  getParent(): undefined {
    return undefined;
  }

  /** The index of the entry current time is at, or -1. */
  private at(): number {
    const time = this.session.time;
    return time ? currentEntry(this.entries, Date.parse(time.current)) : -1;
  }

  /** The entry current time is at, for tests and agents. */
  get currentId(): string | undefined {
    return this.entries[this.current]?.id;
  }

  getChildren(entry?: TimelineEntry): TimelineEntry[] {
    return entry ? [] : this.entries;
  }

  getTreeItem(entry: TimelineEntry): vscode.TreeItem {
    const now = this.entries[this.current] === entry;
    const item = new vscode.TreeItem(entry.when);
    item.id = `timeline:${entry.id}`;
    item.description = [entry.name, entry.text, entry.hidden ? "hidden on map" : ""].filter(Boolean).join(" · ");
    item.iconPath = new vscode.ThemeIcon(now ? "debug-stackframe" : "note", now ? new vscode.ThemeColor("list.highlightForeground") : undefined);
    item.tooltip = [entry.when, entry.name, entry.text].filter(Boolean).join("\n");
    item.accessibilityInformation = { label: `${now ? "At current time: " : ""}${entry.when}, ${entry.name}${entry.text ? `, ${entry.text}` : ""}` };
    item.command = { command: "debrief.goToTime", title: "Go to this time", arguments: [entry.id] };
    item.contextValue = "timeline-entry";
    return item;
  }
}
