/**
 * VS Code's sensor commands (CAP-22; product owner, 24 Oct 2026): keeping a side of ambiguous cuts, a
 * cut's menu, the cut at current time and a towed array's offset, as VS Code asks for them, with
 * QuickPicks and an input box. Registered by the shared registrations (webview/panels/flows/cuts.ts,
 * arrayoffset.ts), as the playground's menus and form are; out of activate() (review of 7 Nov 2026,
 * finding 2), given what they need of it.
 */
import * as vscode from "vscode";
import type { AmbiguityResolution, Length } from "@debrief/schemas";
import { UNIT_LABELS, cutChoices, cutNow, cutTitle, describeCut, KEEP_CHOICES, placeOfCut, resolutionFor, scopeChoices, sensorsOf, type ArrayMode, type CutScope, type Keep, type ResolveContext } from "@debrief/kernel";
import { describeDistance, readArrayOffset, arrayOffsetTitle } from "../../webview/trackedit.js";
import { settings as displaySettings } from "../format.js";
import type { OpenedPlot } from "../catalogue.js";
import type { Agent, ToolService } from "../service.js";
import type { Session } from "../session.js";
import type { Target } from "../../webview/panels/flows/register.js";

/** What the sensor commands need of activate(). */
export interface SensorDeps {
  session: Session;
  agent: Agent;
  /** The tool service, while it runs. */
  service(): ToolService | undefined;
  /** A problem said as a warning, and returned. */
  report(problem: string | undefined): string | undefined;
  /** The ids a command acts on: its Target's, else the selection. */
  targets(target?: Target): string[];
  /** A sensor change, one step, one at a time. */
  sense<T extends { notes?: string[] | null }>(save: (opened: OpenedPlot, allow: boolean) => Promise<T>): Promise<{ problem?: string; answer?: T }>;
  /** An input box's note on what was typed. */
  meaning(read: { problem: string } | unknown, means: () => string): vscode.InputBoxValidationMessage;
}

export function sensorCommands(deps: SensorDeps) {
  const { session, agent, report, targets, sense, meaning } = deps;
  // Sensors (CAP-22). Keeping a side of ambiguous cuts: for the cut at the current time,
  // those in the time window, those selected, or all of a sensor's cuts; port and
  // starboard for every cut, as legacy offered them (product owner, 24 Oct 2026). From the
  // Outline's sensor menu, the Command Palette, or the map (Alt-click on one of a cut's two
  // lines keeps it; a plain click selects the cut and shows its choices). Given a
  // resolution (agents, the map and tests), it asks nothing.
  const resolveAmbiguityCommand = async (target?: Target | AmbiguityResolution, keepGiven?: Keep, scopeGiven?: CutScope) => {
    const opened = session.current;
    if (!opened) return report("Open a plot first.");
    let resolution: AmbiguityResolution | string;
    if (target && "keep" in target) resolution = target;
    else {
      const entries = sensorsOf(opened.plot);
      const asked = new Set(targets(target));
      const byCut = new Map(entries.flatMap((e) => e.cuts.map((c) => [c.id, e.sensor.id] as const)));
      const named = entries.filter((e) => asked.has(e.sensor.id) || [...asked].some((id) => byCut.get(id) === e.sensor.id));
      const chosen = named.length ? named : entries.filter((e) => e.cuts.some((c) => !!c.properties.ambiguous_bearing));
      if (!chosen.length) return report(entries.length ? "No sensor in this plot has ambiguous cuts." : "This plot has no sensors.");
      const range = session.time?.range;
      const resolveContext: ResolveContext = {
        entries: chosen,
        selected: session.selection,
        ...(range && { window: { start: Date.parse(range.start), end: Date.parse(range.end) } }),
        ...(session.time && { at: Date.parse(session.time.current) }),
      };
      const sensorWords = chosen.length === 1 ? chosen[0].sensor.properties.name : `${chosen.length} sensors`;
      const keep = keepGiven ?? (await vscode.window.showQuickPick(KEEP_CHOICES.map((c) => ({ ...c })), { title: `Ambiguous bearings of ${sensorWords}`, placeHolder: "Keep which bearing?" }))?.keep;
      if (!keep) return undefined;
      const scopes = scopeChoices(resolveContext);
      const keepLabel = KEEP_CHOICES.find((c) => c.keep === keep)?.label ?? keep;
      const scope =
        scopeGiven ??
        (scopes.length === 1
          ? scopes[0].scope
          : (await vscode.window.showQuickPick(scopes.map((c) => ({ label: c.label, description: c.detail, scope: c.scope })), { title: `${keepLabel}: which cuts of ${sensorWords}?` }))?.scope);
      if (!scope) return undefined;
      resolution = resolutionFor(scope, keep, resolveContext);
    }
    if (typeof resolution === "string") return report(resolution);
    const sent = resolution;
    const done = await sense((o, allow) => deps.service()!.resolveAmbiguity(o.store.id, o.item.id, o.base!, agent, sent, allow));
    if (done.problem) return (report(done.problem), done);
    const notes = done.answer?.notes ?? [];
    if (notes.length) void vscode.window.showInformationMessage(notes.join(" "));
    return done;
  };
  // A towed array's offset astern of the ship, and how it follows (CAP-22; product owner,
  // 24 Oct 2026): typed in the analyst's length unit, 0 for at the ship, then worm in the
  // hole (back along the ship's own track, legacy's default) or plain. One step. Given an
  // offset (null for none) and a mode (agents and tests), it asks nothing.
  const setArrayOffsetCommand = async (target?: Target | string, offsetGiven?: { value: number; unit: string } | null, modeGiven?: ArrayMode) => {
    const opened = session.current;
    if (!opened) return report("Open a plot first.");
    const entries = sensorsOf(opened.plot);
    if (!entries.length) return report("This plot has no sensors.");
    const asked = typeof target === "string" ? [target] : targets(target);
    let chosen = entries.filter((e) => asked.includes(e.sensor.id));
    if (!chosen.length && entries.length === 1) chosen = entries;
    if (!chosen.length) {
      const picked = await vscode.window.showQuickPick(entries.map((e) => ({ label: e.sensor.properties.name, description: e.host?.properties.name, entry: e })), { placeHolder: "Which sensor?" });
      if (!picked) return undefined;
      chosen = [picked.entry];
    }
    const sensorWords = chosen.length === 1 ? chosen[0].sensor.properties.name : `${chosen.length} sensors`;
    const title = chosen.length === 1 ? arrayOffsetTitle(sensorWords, chosen[0].host?.properties.name) : arrayOffsetTitle(sensorWords);
    let offset = offsetGiven;
    if (offset === undefined) {
      const now = chosen[0].sensor.properties.array_offset;
      const text = await vscode.window.showInputBox({
        title,
        prompt: "How far astern of the ship, in metres unless you give a unit; 0 for at the ship. Its cuts are drawn, and their port and starboard told, from there.",
        placeHolder: "such as 300 m",
        ...(now && { value: `${now.value} ${UNIT_LABELS[now.unit] ?? now.unit}` }),
        validateInput: (typed) => {
          const read = readArrayOffset(typed);
          if (!("problem" in read) && read.warning) return { message: read.warning, severity: vscode.InputBoxValidationSeverity.Warning };
          return meaning(read, () => ((read as { value: number }).value === 0 ? "at the ship" : `${describeDistance(read as { value: number; unit: string }, displaySettings)} astern`));
        },
      });
      if (text === undefined) return undefined;
      const read = readArrayOffset(text);
      if ("problem" in read) return report(read.problem);
      offset = read.value === 0 ? null : { value: read.value, unit: read.unit };
    }
    let mode = modeGiven;
    if (!mode && offset) {
      const modes = [
        { label: "Worm in the hole", detail: "Back along the ship's own track, so it lags through a turn (as legacy Debrief, by default)", mode: "worm_in_hole" as const },
        { label: "Plain", detail: "Straight astern of the ship, along its course then", mode: "plain" as const },
      ];
      mode = (await vscode.window.showQuickPick(modes, { title: `${title}: how does the array follow the ship?` }))?.mode;
      if (!mode) return undefined;
    }
    // The unit as typed or given: the service refuses one that is not a length, in its own words.
    const sent = { sensor_ids: chosen.map((e) => e.sensor.id), offset: (offset ?? null) as Length | null, mode: mode ?? "worm_in_hole" };
    const done = await sense((o, allow) => deps.service()!.setArrayOffset(o.store.id, o.item.id, o.base!, agent, sent, allow));
    if (done.problem) return (report(done.problem), done);
    if (done.answer && !done.answer.changed) void vscode.window.showInformationMessage(`${sensorWords} is so already.`);
    return done;
  };
  // A cut's menu (right-click, or press and hold, on one of its lines on the map): keep
  // either of its bearings, make it ambiguous again, select it, or keep a side for more.
  const cutMenuCommand = async (cutId?: string) => {
    const opened = session.current;
    const entry = opened ? sensorsOf(opened.plot).find((e) => e.cuts.some((c) => c.id === cutId)) : undefined;
    const cut = entry?.cuts.find((c) => c.id === cutId);
    if (!entry || !cut) return report("There is no such cut in this plot.");
    const props = cut.properties;
    // The course its sides are told by, where its sensor was (its array astern, if it has one).
    const course = placeOfCut(entry, cut)?.course;
    type Pick = vscode.QuickPickItem & { run: () => Thenable<unknown> };
    const picks: Pick[] = [];
    for (const choice of cutChoices(cut, course)) {
      picks.push({ label: choice.label, detail: choice.detail, run: () => vscode.commands.executeCommand("debrief.resolveAmbiguity", { keep: choice.keep, cut_ids: [cut.id] }) });
    }
    if (props.ambiguous_bearing) {
      picks.push({
        label: "Keep a side for more cuts…",
        detail: `Port or starboard, for ${entry.sensor.properties.name}'s cuts in the time window, selected, or all`,
        run: () => vscode.commands.executeCommand("debrief.resolveAmbiguity", { feature: { id: entry.sensor.id } }),
      });
    }
    picks.push({ label: "Select this cut", run: async () => session.select([cut.id], "outline") });
    const said = describeCut(cut, entry.sensor.properties.name, course).split("\n").slice(1).join(" · ");
    const picked = await vscode.window.showQuickPick(picks, { title: cutTitle(cut, entry.sensor.properties.name), placeHolder: said });
    if (picked) await picked.run();
    return undefined;
  };
  // The cut current time is at, for a sensor (the Outline's sensor menu, the Command
  // Palette): its bearings and sides said, and its menu, so a keyboard reaches every cut
  // the map shows emphasised.
  const currentCutCommand = async (target?: Target | string) => {
    const opened = session.current;
    if (!opened) return report("Open a plot first.");
    const entries = sensorsOf(opened.plot);
    const asked = typeof target === "string" ? [target] : targets(target);
    let entry = entries.find((e) => asked.includes(e.sensor.id)) ?? (entries.length === 1 ? entries[0] : undefined);
    if (!entry && entries.length) {
      entry = (await vscode.window.showQuickPick(entries.map((e) => ({ label: e.sensor.properties.name, description: e.host?.properties.name, entry: e })), { placeHolder: "Which sensor?" }))?.entry;
      if (!entry) return undefined;
    }
    if (!entry) return report("This plot has no sensors.");
    const range = session.time?.range;
    const now = session.time ? cutNow(entry, Date.parse(session.time.current), range && { start: Date.parse(range.start), end: Date.parse(range.end) }) : undefined;
    if (!now) return report(`${entry.sensor.properties.name} has no cut at or before current time in the time window.`);
    return vscode.commands.executeCommand("debrief.cutMenu", now.id);
  };
  return { resolveAmbiguityCommand, setArrayOffsetCommand, cutMenuCommand, currentCutCommand };
}
