/**
 * VS Code's track edits (CAP-01, CAP-02, CAP-13 to CAP-18, EXT-14): how VS Code asks for each, with
 * input boxes and QuickPicks, and makes the change through the tool service. Registered by the shared
 * registration (webview/panels/flows/tracks.ts), as the playground's forms are; out of activate()
 * (review of 7 Nov 2026, finding 2), given what they need of it.
 */
import * as vscode from "vscode";
import type { LineStringGeometry, Speed, TimeRange, TrackEdit } from "@debrief/schemas";
import { formatBearing, formatPosition, formatQuantity, parsePosition, POSITION_EXAMPLE, UNIT_LABELS } from "@debrief/kernel";
import { defaultPivotIndex, describeDistance, describeSpeed, describeTurn, FIX_PROMPT, FIX_PROMPT_DR, fixIndexAt, fixMeans, fixToEdit, jumpSpeed, legNow, mergedName, mergePlan, periodIndices, readBearing, readDistance, readSpeed, readTurn, reckoningOf, type Anchor } from "../../webview/trackedit.js";
import { legExtent } from "../../webview/tma.js";
import { MODE_LABELS, type PlottingMode } from "../importmode.js";
import { count, describeTimes, settings as displaySettings } from "../format.js";
import { describeJump, describeMark, describeWindow, fixRows, isDeadReckoned, jumpsFound, markAt, readThreshold, readWindow, smoothingNote, trackLabel } from "../../webview/fixes.js";
import { FIX_COLOURS } from "../../webview/palette.js";
import { featureIdsOf } from "../views/outline.js";
import type { PlotFeature } from "../hidden.js";
import type { CleanChange, ToolService, TrackChange } from "../service.js";
import type { Session } from "../session.js";
import type { MapPanel } from "../panels/map.js";
import type { Target } from "../../webview/panels/flows/register.js";
import type { EditGiven, FixMoveGiven, JumpsGiven, MarkGiven, MergeGiven, PlottingModeGiven, PlottingModeOptions, SmoothGiven, SplitGiven, TrackEditsHost, TrackTarget } from "../../webview/panels/flows/tracks.js";

export type TrackFeature = Extract<PlotFeature, { properties: { kind: "track" } }>;

/** What the track edits need of activate(). */
export interface TrackEditsDeps {
  session: Session;
  map: MapPanel;
  /** The tool service, while it runs. */
  service(): ToolService | undefined;
  /** A problem said as a warning, and returned. */
  report(problem: string | undefined): string | undefined;
  changeTrack(change: TrackChange, confirm?: (message: string) => Promise<boolean>): Promise<{ problem?: string; feature?: string; features?: string[]; notes?: string[] }>;
  cleanTrack(change: CleanChange): Promise<{ problem?: string; summary?: string }>;
  trackTarget(target?: string | Target): TrackFeature | undefined;
  trackById(id?: string): TrackFeature | undefined;
}

export function trackEditCommands(deps: TrackEditsDeps) {
  const { session, map, report, changeTrack, cleanTrack, trackTarget, trackById } = deps;
  const trackDone = (done: { problem?: string }) => {
    report(done.problem);
    return done;
  };
  /** What a move or rotation changes: the whole track, or only its fixes in the time window shown. */
  async function chooseExtent(track: TrackFeature, verb: string): Promise<{ period?: TimeRange } | undefined> {
    const window = session.time?.range;
    const { times } = track.properties;
    const whole = { label: "Whole track", description: describeTimes(times[0], times.at(-1)), period: undefined as TimeRange | undefined };
    // A TMA solution split into legs: the leg current time is in, as This leg drags it on the map.
    const tma = (track.properties as { tma?: { leg_starts?: string[] | null } }).tma;
    const leg = tma ? legExtent(times, tma.leg_starts, session.time ? Date.parse(session.time.current) : undefined) : undefined;
    if (!window && !leg) return {};
    const inWindow = window ? periodIndices(times.map(Date.parse), { start: Date.parse(window.start), end: Date.parse(window.end) }).length : 0;
    const items = [
      whole,
      ...(leg
        ? [
            {
              label: "This leg",
              description: `Leg ${leg.leg} of ${leg.legs} · ${describeTimes(leg.period.start, leg.period.end)}`,
              detail: "The leg current time is in; the other legs stay where they are.",
              period: leg.period as TimeRange | undefined,
            },
          ]
        : []),
      ...(window
        ? [
            {
              label: "Current time window",
              description: `${describeTimes(window.start, window.end)} · ${count(inWindow, "fix", "fixes")}`,
              detail: "Only the fixes in the window change; the track jumps where they meet the rest.",
              period: window as TimeRange | undefined,
            },
          ]
        : []),
    ];
    const picked = await vscode.window.showQuickPick(items, { title: `${verb} ${track.properties.name}`, placeHolder: `What of ${track.properties.name} to ${verb.toLowerCase()}?` });
    return picked && { period: picked.period };
  }
  /** The input box's note on what was typed: what it means, or what is wrong. */
  const meaning = (read: { problem: string } | unknown, means: () => string): vscode.InputBoxValidationMessage => {
    if (read && typeof read === "object" && "problem" in read) return { message: (read as { problem: string }).problem, severity: vscode.InputBoxValidationSeverity.Error };
    return { message: `Means ${means()}`, severity: vscode.InputBoxValidationSeverity.Info };
  };

  // "Move track…": what moves, the distance and the bearing. With a change given, no questions.
  const moveCommand = async (target?: TrackTarget, given?: EditGiven) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to move.") };
    const name = track.properties.name;
    if (given && typeof given === "object") return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit: { ...given, action: "move" } }));
    const extent = await chooseExtent(track, "Move");
    if (!extent) return {};
    const distanceText = await vscode.window.showInputBox({
      title: `Move ${name}`,
      prompt: "How far: each fix moves this far along the bearing, along its own geodesic",
      placeHolder: `such as 1.2 ${UNIT_LABELS[displaySettings.length_unit]}`,
      validateInput: (text) => {
        const read = readDistance(text, displaySettings);
        return meaning(read, () => describeDistance(read as { value: number; unit: string }, displaySettings));
      },
    });
    const distance = distanceText === undefined ? undefined : readDistance(distanceText, displaySettings);
    if (!distance || "problem" in distance) return {};
    const bearingText = await vscode.window.showInputBox({
      title: `Move ${name} ${describeDistance(distance, displaySettings)}`,
      prompt: "Which way: a bearing in degrees true",
      placeHolder: "such as 045",
      validateInput: (text) => {
        const read = readBearing(text);
        return meaning(read, () => formatBearing({ value: read as number, unit: "deg" }, displaySettings));
      },
    });
    const bearing = bearingText === undefined ? undefined : readBearing(bearingText);
    if (bearing === undefined || typeof bearing !== "number") return {};
    const edit: TrackEdit = { action: "move", distance: distance as never, bearing: { value: bearing, unit: "deg" }, ...(extent.period && { period: extent.period }) };
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit }));
  };
  // "Rotate track…": what turns, about which pivot, and by how much. With a change given, no questions.
  const rotateCommand = async (target?: TrackTarget, given?: EditGiven) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to rotate.") };
    const name = track.properties.name;
    const current = session.time?.current;
    if (given && typeof given === "object") {
      const edit: TrackEdit = { ...given, action: "rotate" };
      return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit, ...(current && !edit.pivot && { current_time: current }) }));
    }
    const extent = await chooseExtent(track, "Rotate");
    if (!extent) return {};
    const times = track.properties.times.map(Date.parse);
    const positions = track.geometry.coordinates as [number, number][];
    const span = extent.period && { start: Date.parse(extent.period.start), end: Date.parse(extent.period.end) };
    const indices = periodIndices(times, span);
    if (!indices.length) return { problem: report(`${name} has no fixes in the time window, so nothing was rotated.`) };
    const at = (i: number) => formatPosition({ longitude: positions[i][0], latitude: positions[i][1] }, displaySettings);
    const nearest = defaultPivotIndex(times, indices, current ? Date.parse(current) : undefined);
    const fix = (i: number) => `${at(i)} at ${describeTimes(track.properties.times[i])}`;
    const pivots = [
      { label: current && nearest !== indices[0] ? "Fix nearest current time" : "First fix", description: fix(nearest), pivot: positions[nearest] },
      ...(nearest !== indices[0] ? [{ label: "First fix", description: fix(indices[0]), pivot: positions[indices[0]] }] : []),
      { label: "Last fix", description: fix(indices[indices.length - 1]), pivot: positions[indices[indices.length - 1]] },
      { label: "A position I type…", description: "", pivot: undefined as [number, number] | undefined },
    ];
    const chosen = await vscode.window.showQuickPick(pivots, { title: `Rotate ${name}`, placeHolder: "Rotate about which position? Each fix keeps its range from it." });
    if (!chosen) return {};
    let pivot = chosen.pivot;
    if (!pivot) {
      const typed = await vscode.window.showInputBox({
        title: `Rotate ${name}`,
        prompt: "Rotate about this position",
        placeHolder: POSITION_EXAMPLE,
        validateInput: (text) => {
          try {
            const p = parsePosition(text);
            return { message: `Means ${formatPosition(p, displaySettings)}`, severity: vscode.InputBoxValidationSeverity.Info };
          } catch (error) {
            return { message: (error as Error).message, severity: vscode.InputBoxValidationSeverity.Error };
          }
        },
      });
      if (typed === undefined) return {};
      const p = parsePosition(typed);
      pivot = [p.longitude, p.latitude];
    }
    const angleText = await vscode.window.showInputBox({
      title: `Rotate ${name} about ${formatPosition({ longitude: pivot[0], latitude: pivot[1] }, displaySettings)}`,
      prompt: "By how much: degrees, positive or 'clockwise' turns clockwise, negative or 'anticlockwise' the other way",
      placeHolder: "such as 10, or 10 anticlockwise",
      validateInput: (text) => {
        const read = readTurn(text);
        return meaning(read, () => describeTurn(read as number, displaySettings));
      },
    });
    const angle = angleText === undefined ? undefined : readTurn(angleText);
    if (angle === undefined || typeof angle !== "number") return {};
    const edit: TrackEdit = { action: "rotate", angle: { value: angle, unit: "deg" }, pivot, ...(extent.period && { period: extent.period }) };
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit }));
  };
  /** Which end of what changes a shear or a stretch holds: the other end is the one that moves. Undefined for Escape, or a problem when it cannot be done. */
  async function chooseAnchor(track: TrackFeature, verb: string, period?: TimeRange): Promise<{ anchor: Anchor; now: NonNullable<ReturnType<typeof legNow>> } | { problem: string } | undefined> {
    const times = track.properties.times.map(Date.parse);
    const span = period && { start: Date.parse(period.start), end: Date.parse(period.end) };
    const indices = periodIndices(times, span);
    const name = track.properties.name;
    const now = legNow(track.geometry.coordinates as [number, number][], times, indices, displaySettings);
    if (!now) return { problem: `${name} has fixes at only one time there, so it cannot be ${verb === "Shear" ? "sheared" : "stretched"}: that needs fixes at two times.` };
    const at = (i: number) => describeTimes(track.properties.times[i]);
    const [first, last] = [indices[0], indices[indices.length - 1]];
    const picked = await vscode.window.showQuickPick(
      [
        { label: "Hold the start", description: `${at(first)}; the end moves`, anchor: "start" as Anchor },
        { label: "Hold the end", description: `${at(last)}; the start moves`, anchor: "end" as Anchor },
      ],
      { title: `${verb} ${name}: now ${now.said}`, placeHolder: "Which end stays where it is?" },
    );
    return picked && { anchor: picked.anchor, now };
  }
  const speedMeaning = (positive: boolean) => (text: string) => {
    const read = readSpeed(text, displaySettings, positive);
    return meaning(read, () => describeSpeed(read as { value: number; unit: string }, displaySettings));
  };
  // "Shear track…": what changes, which end is held, and the course and speed the rest then makes good. With a change given, no questions.
  const shearCommand = async (target?: TrackTarget, given?: EditGiven) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to shear.") };
    const name = track.properties.name;
    if (given && typeof given === "object") return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit: { ...given, action: "shear" } }));
    const extent = await chooseExtent(track, "Shear");
    if (!extent) return {};
    const held = await chooseAnchor(track, "Shear", extent.period);
    if (!held) return {};
    if ("problem" in held) return { problem: report(held.problem) };
    const courseText = await vscode.window.showInputBox({
      title: `Shear ${name}, holding the ${held.anchor}`,
      prompt: `The course it then makes good, from its first fix to its last, in degrees true (now ${held.now.said})`,
      value: held.now.course,
      validateInput: (text) => {
        const read = readBearing(text);
        return meaning(read, () => formatBearing({ value: read as number, unit: "deg" }, displaySettings));
      },
    });
    const course = courseText === undefined ? undefined : readBearing(courseText);
    if (course === undefined || typeof course !== "number") return {};
    const speedText = await vscode.window.showInputBox({
      title: `Shear ${name} to ${formatBearing({ value: course, unit: "deg" }, displaySettings)}`,
      prompt: `The speed it then makes good (now ${held.now.said})`,
      value: held.now.speed,
      validateInput: speedMeaning(false),
    });
    const speed = speedText === undefined ? undefined : readSpeed(speedText, displaySettings);
    if (!speed || "problem" in speed) return {};
    const edit: TrackEdit = { action: "shear", anchor: held.anchor, course: { value: course, unit: "deg" }, speed: speed as never, ...(extent.period && { period: extent.period }) };
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit }));
  };
  // "Stretch track…": what changes, which end is held, and the speed the rest then makes good, on the same course. With a change given, no questions.
  const stretchCommand = async (target?: TrackTarget, given?: EditGiven) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to stretch.") };
    const name = track.properties.name;
    if (given && typeof given === "object") return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit: { ...given, action: "stretch" } }));
    const extent = await chooseExtent(track, "Stretch");
    if (!extent) return {};
    const held = await chooseAnchor(track, "Stretch", extent.period);
    if (!held) return {};
    if ("problem" in held) return { problem: report(held.problem) };
    if (!held.now.moves) return { problem: report(`${name} ends where it starts there, so it cannot be stretched: shear it instead.`) };
    const speedText = await vscode.window.showInputBox({
      title: `Stretch ${name}, holding the ${held.anchor}`,
      prompt: `The speed it then makes good, on the same course (now ${held.now.said})`,
      value: held.now.speed,
      validateInput: speedMeaning(true),
    });
    const speed = speedText === undefined ? undefined : readSpeed(speedText, displaySettings, true);
    if (!speed || "problem" in speed) return {};
    const edit: TrackEdit = { action: "stretch", anchor: held.anchor, speed: speed as never, ...(extent.period && { period: extent.period }) };
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit }));
  };
  // "Split track at current time…": the two parts' names, offered as "X (1)" and "X (2)". With options given, no questions.
  const splitCommand = async (target?: TrackTarget, options?: SplitGiven) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to split.") };
    const at = options?.at ?? session.time?.current;
    if (!at) return { problem: report("Set current time first: the track is split there.") };
    const name = track.properties.name;
    let names = options?.names;
    if (!options) {
      const when = describeTimes(at);
      const ask = (part: string, value: string) =>
        vscode.window.showInputBox({ title: `Split ${name} at ${when}`, prompt: `Name for the part ${part}`, value, validateInput: (text) => (text.trim() ? undefined : "Give the part a name.") });
      const first = await ask(`before ${when}`, `${name} (1)`);
      if (first === undefined) return {};
      const second = await ask(`from ${when} on`, `${name} (2)`);
      if (second === undefined) return {};
      names = [first.trim(), second.trim()];
    }
    const done = await changeTrack({ kind: "split", feature: track.id, at, ...(names && { names }) });
    if (!done.problem && done.features) session.select(done.features, "command");
    return trackDone(done);
  };
  // "Merge selected tracks": the tracks selected, or the ids given, joined in time order. Asked for
  // the merged track's name, and, if speeds, courses or depths would not be kept, asked first
  // whether to merge anyway. With the ids given (agents, tests), no questions; what was not kept comes back.
  const mergeCommand = async (target?: string[] | Target, others?: readonly unknown[] | MergeGiven) => {
    const nodes = Array.isArray(others) ? featureIdsOf(others as never) : [];
    const ids = Array.isArray(target) ? target : nodes.length ? nodes : session.selection;
    const tracks = ids.map(trackById).filter((t): t is TrackFeature => !!t);
    if (tracks.length < 2) return { problem: report("Select two or more tracks to merge.") };
    let name = others && !Array.isArray(others) ? (others as MergeGiven).name : undefined;
    if (!Array.isArray(target)) {
      const { ordered, lost } = mergePlan(tracks);
      if (lost.length) {
        const go = "Merge anyway";
        const answer = await vscode.window.showWarningMessage(
          `Merging ${ordered.map((t) => t.properties.name).join(", ")} keeps only what every track has.`,
          { modal: true, detail: `${lost.join(". ")}. Undo puts them back.` },
          go,
        );
        if (answer !== go) return {};
      }
      name = await vscode.window.showInputBox({
        title: `Merge ${count(ordered.length, "track", "tracks")}`,
        prompt: "Name for the merged track",
        value: mergedName(ordered.map((t) => t.properties.name)),
        validateInput: (text) => (text.trim() ? undefined : "Give the merged track a name."),
      });
      if (name === undefined) return {};
      name = name.trim();
    }
    const done = await changeTrack({ kind: "merge", features: tracks.map((t) => t.id), ...(name && { name }) });
    if (!done.problem && done.feature) session.select([done.feature], "command");
    return trackDone(done);
  };

  // Cleaning tracks (CAP-01, EXT-14): what would change is shown first, on the map and in a
  // list, and changed only when the analyst says, as one step. Each command takes what agents
  // and tests give it instead of asking, and returns what happened.
  /** Ring fixes on the map for the analyst to check, or draw a change previewed; nothing to take them away. */
  const showFixes = (shown?: { feature_id: string; fix_times?: string[]; preview?: LineStringGeometry; message?: string }) => map.showFixes(shown);
  const colourName = (colour: string) => FIX_COLOURS.find((c) => c.colour === colour)?.name.toLowerCase();

  // "Find and remove jumps…": the threshold (offered as the track's default), then the jumps found,
  // ringed on the map and listed, all ticked; those left ticked are removed as one step. Given
  // options, no questions: the times to remove ("all" found), or none, to find them and ring them.
  const removeJumpsCommand = async (target?: TrackTarget, given?: JumpsGiven) => {
    const track = trackTarget(target);
    const opened = session.current;
    if (!track || !opened) return { problem: report("Select one track to find its jumps.") };
    const service = deps.service();
    if (!service || !opened.base) return { problem: report("Finding jumps needs Debrief's tool service. Run 'Debrief: Restart tool service'.") };
    const name = track.properties.name;
    // The unit as given: the service refuses one that is not a speed, in its own words.
    const find = (threshold?: { value: number; unit: string }) => service!.findJumps(opened.store.id, opened.item.id, opened.base!, track.id, threshold as Speed | undefined);
    let found;
    try {
      found = await find(given?.threshold);
      if (!given) {
        const median = found.median_speed ? `three times its median speed of ${formatQuantity(found.median_speed, displaySettings)}, at least 10 kn` : "at least 10 kn";
        const typed = await vscode.window.showInputBox({
          title: `Find jumps in ${name}`,
          prompt: `A fix is a jump when reaching it from the fix before needs more than this speed. Offered: ${median}.`,
          value: formatQuantity(found.threshold, displaySettings),
          validateInput: (text) => {
            const read = readThreshold(text, displaySettings);
            return meaning(read, () => `faster than ${formatQuantity(read as { value: number; unit: string }, displaySettings)} to reach`);
          },
        });
        if (typed === undefined) return {};
        const threshold = readThreshold(typed, displaySettings);
        if ("problem" in threshold) return {};
        if (threshold.value !== found.threshold.value || threshold.unit !== found.threshold.unit) found = await find(threshold);
      }
    } catch (error) {
      return { problem: report((error as Error).message) };
    }
    const times = found.jumps.map((j) => j.time);
    const dr = isDeadReckoned(track.properties);
    const said = jumpsFound(dr ? trackLabel(track.properties) : name, times.length, found.threshold, displaySettings, dr);
    if (!times.length) {
      showFixes(undefined);
      if (!given) void vscode.window.showInformationMessage(said);
      return { found: [], threshold: found.threshold };
    }
    showFixes({ feature_id: track.id, fix_times: times, message: said });
    let chosen: string[] | undefined;
    if (given?.times) chosen = given.times === "all" ? times : given.times;
    else if (given) return { found: times, threshold: found.threshold }; // asked only to find them: they stay ringed on the map
    else {
      const items = found.jumps.map((jump) => ({ ...describeJump(jump, displaySettings), time: jump.time }));
      const list = vscode.window.createQuickPick<(typeof items)[number]>();
      list.title = said.split(". ")[0];
      list.placeholder = "Untick any that are real; those ticked are removed as one step. Each is ringed on the map.";
      list.canSelectMany = true;
      list.ignoreFocusOut = true;
      list.items = items;
      list.selectedItems = items;
      // An unticked jump's ring goes from the map, so the map shows what will be removed.
      list.onDidChangeSelection((ticked) => showFixes({ feature_id: track.id, fix_times: ticked.map((t) => t.time), message: said }));
      chosen = await new Promise<string[] | undefined>((resolve) => {
        list.onDidAccept(() => resolve(list.selectedItems.map((t) => t.time)));
        list.onDidHide(() => resolve(undefined));
        list.show();
      });
      list.dispose();
    }
    if (!chosen?.length) {
      showFixes(undefined);
      return { found: times, threshold: found.threshold };
    }
    const done = await cleanTrack({ kind: "remove_jumps", feature: track.id, times: chosen, threshold: found.threshold });
    showFixes(undefined);
    report(done.problem);
    return { ...done, found: times, removed: done.problem ? 0 : chosen.length, threshold: found.threshold };
  };

  // "Smooth track…": what to smooth, over how many fixes, then the track drawn as it would be,
  // with how far fixes would move; Apply makes it one step. Given a window, it is applied, unless
  // apply is false: then the preview stays on the map.
  const smoothCommand = async (target?: TrackTarget, given?: SmoothGiven) => {
    const track = trackTarget(target);
    const opened = session.current;
    if (!track || !opened) return { problem: report("Select one track to smooth.") };
    const service = deps.service();
    if (!service || !opened.base) return { problem: report("Smoothing needs Debrief's tool service. Run 'Debrief: Restart tool service'.") };
    const name = track.properties.name;
    let window = given?.window;
    let period = given?.period;
    if (!given) {
      // What to smooth: the whole track, or its fixes in the time window, whose first and last stay put.
      const shown = session.time?.range;
      const { times } = track.properties;
      const extents = [
        { label: "Whole track", description: describeTimes(times[0], times.at(-1)), period: undefined as TimeRange | undefined },
        ...(shown
          ? [{ label: "Current time window", description: `${describeTimes(shown.start, shown.end)} · ${count(periodIndices(times.map(Date.parse), { start: Date.parse(shown.start), end: Date.parse(shown.end) }).length, "fix", "fixes")}`, detail: "Only the fixes in the window are smoothed; its first and last fixes stay where they are.", period: shown }]
          : []),
      ];
      const extent = extents.length > 1 ? await vscode.window.showQuickPick(extents, { title: `Smooth ${name}`, placeHolder: `What of ${name} to smooth?` }) : extents[0];
      if (!extent) return {};
      period = extent.period;
      const typed = await vscode.window.showInputBox({
        title: `Smooth ${name}`,
        prompt: "Over how many fixes: an odd number; the first and last fixes of what is smoothed stay where they are",
        value: "5",
        validateInput: (text) => {
          const read = readWindow(text);
          return meaning(read, () => describeWindow(read as number));
        },
      });
      const read = typed === undefined ? undefined : readWindow(typed);
      if (typeof read !== "number") return {};
      window = read;
    }
    let preview;
    try {
      preview = await service.previewSmoothing(opened.store.id, opened.item.id, opened.base, track.id, window!, period);
    } catch (error) {
      return { problem: report((error as Error).message) };
    }
    const note = smoothingNote(name, window!, preview.summary);
    if (!preview.moved) {
      if (!given) void vscode.window.showInformationMessage(`${name}: no fix would move, so there is nothing to smooth.`);
      return { summary: preview.summary, moved: 0 };
    }
    showFixes({ feature_id: track.id, fix_times: [], preview: preview.preview, message: note });
    // Asked only to preview: it stays on the map until the next change or debrief.showFixes.
    if (given?.apply === false) return { summary: preview.summary, moved: preview.moved };
    const apply = given ? true : (await vscode.window.showInformationMessage(note, { detail: "The dashed line shows the track as smoothing would leave it." }, "Apply", "Cancel")) === "Apply";
    if (!apply) {
      showFixes(undefined);
      return { summary: preview.summary, moved: preview.moved };
    }
    const done = await cleanTrack({ kind: "smooth", feature: track.id, window: window!, ...(period && { period }) });
    showFixes(undefined);
    report(done.problem);
    return { ...done, moved: preview.moved };
  };

  // "Fixes…": the fix list of a track, to choose one; then its colour, label or comment, each one step.
  // From the map (a right-click on a fix), the fix is given. With a change given, no questions.
  type MarkChanges = MarkGiven;
  /** The fix list of a track, the fix nearest current time offered: the time of the fix chosen, or undefined for Escape. */
  async function chooseFix(track: TrackFeature, placeholder: string): Promise<string | undefined> {
    const rows = fixRows(track, displaySettings, colourName).map((row) => ({ label: row.label, description: row.description, detail: row.mark || undefined, time: row.time }));
    const current = session.time ? Date.parse(session.time.current) : undefined;
    const near = current === undefined ? 0 : rows.reduce((best, row, i) => (Math.abs(Date.parse(row.time) - current) < Math.abs(Date.parse(rows[best].time) - current) ? i : best), 0);
    const quick = vscode.window.createQuickPick<(typeof rows)[number]>();
    quick.title = `Fixes of ${track.properties.name}`;
    quick.placeholder = placeholder;
    quick.items = rows;
    quick.matchOnDescription = true;
    quick.matchOnDetail = true;
    quick.activeItems = rows[near] ? [rows[near]] : [];
    const at = await new Promise<string | undefined>((resolve) => {
      quick.onDidAccept(() => resolve(quick.selectedItems[0]?.time ?? quick.activeItems[0]?.time));
      quick.onDidHide(() => resolve(undefined));
      quick.show();
    });
    quick.dispose();
    return at;
  }
  const markFixCommand = async (target?: TrackTarget, time?: string, change?: MarkChanges) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to mark one of its fixes.") };
    const at = time ?? (await chooseFix(track, "Choose a fix to colour, label or comment on; type a time to find one"));
    if (!at) return {};
    let changes = change;
    if (!changes) {
      // The fix chosen, ringed on the map while the analyst says what to do to it.
      showFixes({ feature_id: track.id, fix_times: [at] });
      const asked = await askMarkChange(track, at);
      showFixes(undefined);
      if (asked === "move") return vscode.commands.executeCommand("debrief.moveFix", track.id, at);
      changes = asked;
      if (!changes) return {};
    }
    const { colour_name, ...members } = changes;
    const done = await cleanTrack({ kind: "mark", feature: track.id, time: at, changes: members, ...(colour_name && { colour_name }) });
    report(done.problem);
    return done;
  };
  /** What to do to a fix: its colour, label or comment, asked in VS Code's lists and input boxes; or move it. */
  async function askMarkChange(track: TrackFeature, at: string): Promise<MarkChanges | "move" | undefined> {
    const name = track.properties.name;
    const mark = markAt(track, at);
    const when = describeTimes(at);
    const actions = [
      { label: "Colour…", description: mark?.colour ? `now ${colourName(mark.colour) ?? mark.colour}` : "", act: "colour" },
      { label: "Label…", description: mark?.label ? `now '${mark.label}'` : "", act: "label" },
      { label: "Comment…", description: mark?.comment ? `now: ${mark.comment.split("\n")[0]}` : "", act: "comment" },
      ...(mark?.colour ? [{ label: "Remove its own colour", description: "drawn in the track's colour again", act: "uncolour" }] : []),
      // Force on only (decision, product owner, 15 Oct 2026): whatever the track's intervals, at any zoom.
      mark?.show_label
        ? { label: "Stop always showing its time label", description: "shown only where the track's label interval falls", act: "label-off" }
        : { label: "Always show its time label", description: "whatever the track's label interval, at any zoom", act: "label-on" },
      mark?.show_symbol
        ? { label: "Stop always showing its symbol", description: "shown only where the track's symbol interval falls", act: "symbol-off" }
        : { label: "Always show its symbol", description: "whatever the track's symbol interval, at any zoom", act: "symbol-on" },
      { label: "Move…", description: "this fix alone, to a position you type", act: "move" },
    ];
    const action = await vscode.window.showQuickPick(actions, { title: `Fix of ${name} at ${when}`, placeHolder: describeMark(mark, colourName) || "Give this fix a colour, a label or a comment of its own" });
    if (!action) return undefined;
    if (action.act === "move") return "move";
    if (action.act === "uncolour") return { colour: null };
    if (action.act === "label-on" || action.act === "label-off") return { show_label: action.act === "label-on" };
    if (action.act === "symbol-on" || action.act === "symbol-off") return { show_symbol: action.act === "symbol-on" };
    if (action.act === "colour") {
      const picked = await vscode.window.showQuickPick(FIX_COLOURS.map((c) => ({ label: c.name, colour: c.colour })), { title: `Colour for the fix of ${name} at ${when}` });
      return picked && { colour: picked.colour, colour_name: picked.label.toLowerCase() };
    }
    const typed = await vscode.window.showInputBox({
      title: `${action.act === "label" ? "Label" : "Comment"} for the fix of ${name} at ${when}`,
      prompt: action.act === "label" ? "Drawn on the map beside the fix. Leave empty to remove it." : "Shown when you point at the fix, and in the Timeline. Leave empty to remove it.",
      value: (action.act === "label" ? mark?.label : mark?.comment) ?? "",
    });
    return typed === undefined ? undefined : { [action.act]: typed.trim() || null };
  }
  // "Move a fix…": the fix list, then where it goes, typed in any notation Debrief reads. Only that fix moves;
  // its time, its recorded course and speed and its mark stay. From the map's fix menu, the fix is given;
  // with a change given ({position} or {distance, bearing}), no questions.
  const moveFixCommand = async (target?: TrackTarget, time?: string, given?: FixMoveGiven) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to move one of its fixes.") };
    const name = track.properties.name;
    const at = time ?? (await chooseFix(track, "Choose a fix to move; type a time to find one"));
    if (!at) return {};
    if (given && typeof given === "object") return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit: { ...given, action: "move_fix", fix_time: at } }));
    const index = fixIndexAt(track.properties.times, at);
    if (index < 0) return { problem: report(`${name} has no fix at ${describeTimes(at)}.`) };
    const positions = track.geometry.coordinates as [number, number][];
    const times = track.properties.times.map(Date.parse);
    const jump = jumpSpeed(positions, times);
    const here = positions[index];
    showFixes({ feature_id: track.id, fix_times: [track.properties.times[index]] });
    const typed = await vscode.window.showInputBox({
      title: `Move the fix of ${name} at ${describeTimes(at)}`,
      prompt: reckoningOf(track.properties) ? FIX_PROMPT_DR : FIX_PROMPT,
      value: formatPosition({ longitude: here[0], latitude: here[1] }, displaySettings),
      placeHolder: POSITION_EXAMPLE,
      validateInput: (text) => {
        try {
          const p = parsePosition(text);
          const to: [number, number] = [p.longitude, p.latitude];
          const said = fixMeans(name, positions, times, index, to, jump, reckoningOf(track.properties), displaySettings);
          return { message: `Means ${formatPosition(p, displaySettings)}. ${said}`, severity: vscode.InputBoxValidationSeverity.Info };
        } catch (error) {
          return { message: (error as Error).message, severity: vscode.InputBoxValidationSeverity.Error };
        }
      },
    });
    showFixes(undefined);
    if (typed === undefined) return {};
    const p = parsePosition(typed);
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit: fixToEdit(track.properties.times[index], [p.longitude, p.latitude]) }));
  };
  // "Plot over the ground or by dead reckoning…": the track's plotting mode, chosen as it was
  // imported, changed as one step. With the mode given ("otg" or "dr"), no questions. Over the ground after a
  // change made while plotted by dead reckoning loses that change (decision, product owner, 14 Oct 2026): asked,
  // the analyst confirms in a dialog first; given, it is refused, saying why, unless options say to discard it.
  const plottingModeCommand = async (target?: TrackTarget, given?: PlottingModeGiven, options?: PlottingModeOptions) => {
    const track = trackTarget(target);
    if (!track) return { problem: report("Select one track to plot over the ground or by dead reckoning.") };
    const name = track.properties.name;
    const now: PlottingMode = (track.properties.plotting_mode as PlottingMode | undefined) ?? "otg";
    let mode = given;
    if (!mode) {
      const items = (["otg", "dr"] as const).map((m) => ({ label: MODE_LABELS[m], description: m === now ? "as it is plotted now" : "", mode: m }));
      const picked = await vscode.window.showQuickPick(items, {
        title: `How is ${name} plotted?`,
        placeHolder: "By dead reckoning, each fix after the first is placed by the course and speed at the fix before; its positions as logged are kept.",
      });
      if (!picked || picked.mode === now) return {};
      mode = picked.mode;
    }
    const discard = !!given && mode === "otg" && options?.discard_dr_changes === true;
    const edit: TrackEdit = { action: "set_plotting_mode", plotting_mode: mode, ...(discard && { discard_dr_changes: true }) };
    const confirmLoss = async (message: string) => {
      const go = "Plot over the ground";
      return (await vscode.window.showWarningMessage(message, { modal: true }, go)) === go;
    };
    return trackDone(await changeTrack({ kind: "edit", feature: track.id, edit }, given ? undefined : confirmLoss));
  };
  const commands: Omit<TrackEditsHost, "frequencies"> = { move: moveCommand, rotate: rotateCommand, shear: shearCommand, stretch: stretchCommand, split: splitCommand, merge: mergeCommand, removeJumps: removeJumpsCommand, smooth: smoothCommand, markFix: markFixCommand, moveFix: moveFixCommand, plottingMode: plottingModeCommand };
  return { commands, trackDone, showFixes, meaning };
}
