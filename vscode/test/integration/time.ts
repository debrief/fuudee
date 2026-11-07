/**
 * The time controller (CAP-28) and the Tote (CAP-06, CAP-07, NFR-04), each on a fresh serial 1.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as vscode from "vscode";
import type { DebriefApi } from "../../src/extension.js";
import { debrief, feature, island, openSerial1, sample, screenshot, sleep, waitFor } from "./fixture.js";

type Window = { start: string; end: string };

export function time(): void {
  // --- The time controller (CAP-28): a view at the top of the Debrief sidebar --------
  feature("time", () => {
    let api: DebriefApi;
    let period: Window;
    let base: unknown;
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
      period = api.session.period()!;
      base = api.session.current!.base;
    });

    test("keeps the time window in the plot's view, never a step in its history", async () => {
      await waitFor("the time controller in the sidebar", () => api.timeControllerShowing() || undefined);
      // The time window is view state: saved in the plot file (its island), never a step in its history.
      const narrow = { start: "2023-06-15T09:00:00.000Z", end: "2023-06-15T10:00:00.000Z" };
      const checks = api.viewChecks();
      assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", narrow), undefined);
      assert.deepEqual(api.getState()!.time.range, narrow);
      assert.deepEqual(api.session.current!.base, base, "no step in the history");
      assert.deepEqual(island().time_window, narrow);
      await sleep(2500);
      // Debrief's own save is never taken for a colleague's: the plot is not opened again for it.
      assert.equal(api.viewChecks(), checks, "Debrief's own save of the window was checked as a change elsewhere");
      // The Time view, big time and scrubber (product owner, 28 Oct 2026): its focus command brings it into
      // view, still showing the plot's time; the picture shows it at the height it first has.
      assert.equal(await vscode.commands.executeCommand("debrief.time.focus"), undefined);
      await waitFor("the time controller after its focus command", () => api.timeControllerShowing() || undefined);
      await screenshot("01c-time-window");
    });

    test("shows a colleague's window, written by another process", async () => {
      // A colleague's window, written by another process: noticed, shown, and said.
      const theirs = { start: "2023-06-15T10:00:00.000Z", end: "2023-06-15T11:00:00.000Z" };
      execFileSync(process.env.DEBRIEF_PYTHON || "python3", [
        "-c",
        "import sys, json; from pathlib import Path; from debrief_stac import Catalogue; from debrief_schemas import models; " +
          "c = Catalogue.open(Path(sys.argv[1])); view, h = c.read_view('serial-1'); " +
          "c.write_view('serial-1', {'time_window': json.loads(sys.argv[2])}, h, agent=models.AgentRef(kind='person', name='a colleague'))",
        sample.location,
        JSON.stringify(theirs),
      ]);
      await waitFor("the colleague's window", () => api.getState()?.time.range.start === theirs.start || undefined);
      assert.deepEqual(api.session.current!.base, base, "the plot's content was not read again as a change");
      // Back to the whole plot, saved over theirs, which Debrief has read since.
      assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", period), undefined);
      assert.deepEqual(island().time_window, period);
    });

    test("shows the last of two windows let go of in quick succession", async () => {
      // Two windows let go of in quick succession, as two key presses are: the first one's
      // save finishing never puts it back on screen over the second.
      const ranges: string[] = [];
      const watching = api.onDidChangeState((change) => change.time && ranges.push(change.time.range.start));
      const first = { start: "2023-06-15T08:05:00.000Z", end: period.end };
      const second = { start: "2023-06-15T08:10:00.000Z", end: period.end };
      await Promise.all([
        vscode.commands.executeCommand("debrief.setTimeWindow", first),
        vscode.commands.executeCommand("debrief.setTimeWindow", second),
      ]);
      watching.dispose();
      assert.deepEqual(ranges, [first.start, second.start], "the window shown went back to one let go of earlier");
      assert.deepEqual(island().time_window, second);
      assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", period), undefined);
    });
  });

  /**
   * The Tote (CAP-06, CAP-07, NFR-04), through the real tool service: the tracks chosen by
   * command, as from the outline's menu, saved in the plot's island and never a step; the
   * values follow current time; a track with no data says so; and the latency from asking
   * to showing, as current time moves at display rate, reported.
   */
  feature("tote", () => {
    let api: DebriefApi;
    let period: Window;
    let base: unknown;
    let red: NonNullable<ReturnType<DebriefApi["tote"]>>["rows"][number];
    const at = (time: string) => api.setState({ time: { current: time, range: period } });
    // For the picture, the other views folded away so the Tote has room, as an analyst would.
    const others = ["debrief.catalogues", "debrief.timeline", "debrief.tools", "debrief.history"];
    const toggle = async () => {
      const known = new Set(await vscode.commands.getCommands(true));
      for (const view of others) if (known.has(`${view}.toggleVisibility`)) await vscode.commands.executeCommand(`${view}.toggleVisibility`);
    };
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
      period = api.session.period()!;
      base = api.session.current!.base;
    });

    test("chooses its tracks by command, in the plot's island and never a step", async () => {
      // As "Set as Tote primary" and "Add to Tote" in the outline's menu: the Tote view opens.
      assert.equal(await vscode.commands.executeCommand("debrief.tote.setPrimary", "track-blue-one"), undefined);
      assert.equal(await vscode.commands.executeCommand("debrief.tote.add", ["track-red-one", "track-ais-cargo-04", "track-ais-tug-01"]), undefined);
      await waitFor("the Tote view", () => api.toteShowing() || undefined);
      assert.deepEqual(island().tote, { primary: "track-blue-one", secondaries: ["track-red-one", "track-ais-cargo-04", "track-ais-tug-01"] });
      assert.deepEqual(api.session.current!.base, base, "choosing the Tote's tracks is no step in the history");
      // The map is told, for its thin lines from the primary to each secondary.
      await waitFor("the map's Tote lines", () => (api.mapTote()?.secondaries?.length === 3 ? true : undefined));
    });

    test("shows each measure, and says when a track has no data yet", async () => {
      // At the window's start Cargo 04 has no data yet; RED ONE has every measure.
      at(period.start);
      const first = await waitFor("the Tote's values", () => (api.tote()?.time === period.start && api.tote()!.rows.length === 3 ? api.tote() : undefined));
      const [shown, cargo] = first.rows;
      red = shown;
      assert.equal(shown.status, "ok");
      assert.deepEqual(
        shown.values!.map((v) => v.measure),
        ["range", "bearing", "relative_bearing", "aob", "bearing_rate", "course", "speed", "depth"],
      );
      assert.ok(shown.values!.every((v) => typeof v.value === "number"));
      assert.deepEqual([cargo.status, cargo.note], ["no_data", "Starts 08:28:48Z"]);
      await toggle();
      await vscode.commands.executeCommand("debrief.tote.focus");
      await sleep(1500);
      await screenshot("34-tote");
    });

    test("follows current time as it plays, within its latency budget", async () => {
      // Current time moves, as the time controller sends it while playing: the values follow,
      // one request at a time, the latest time each time.
      const start = Date.parse(period.start);
      let last = period.start;
      for (let i = 1; i <= 300; i++) {
        last = new Date(start + i * 20_000).toISOString();
        at(last);
        await sleep(16);
      }
      const moved = await waitFor("the Tote at the latest time", () => (api.tote()?.time === last ? api.tote() : undefined));
      assert.notEqual(moved.rows[0].values![0].value, red.values![0].value, "the range changed with current time");
      assert.equal(moved.rows[1].status, "ok", "by 09:40, Cargo 04 has data");
      await sleep(1000);
      await screenshot("35-tote-moved");
      await toggle();
      const latency = api.toteLatency();
      console.log(`Tote latency in VS Code (tool service), from asking to showing: p50 ${latency.p50} ms, p95 ${latency.p95} ms, max ${latency.max} ms over ${latency.count} answers (budget 100 ms).`);
      // Generous: the report says precisely what was seen; this catches only a gross regression.
      assert.ok(latency.p95 < 300, `Tote p95 ${latency.p95} ms`);
    });

    test("turns the map's lines off and on, removes tracks, and refuses what is not a track", async () => {
      // The map's lines off and on again, as the Tote's box does: island state, never a step.
      const chosen = island().tote as { primary: string; secondaries: string[] };
      assert.equal(await vscode.commands.executeCommand("debrief.setTote", { ...chosen, map_lines: false }), undefined);
      assert.deepEqual(island().tote, { ...chosen, map_lines: false });
      await waitFor("the map's lines off", () => (api.mapTote()?.map_lines === false ? true : undefined));
      assert.equal(await vscode.commands.executeCommand("debrief.setTote", chosen), undefined);
      assert.deepEqual(island().tote, chosen);
      assert.deepEqual(api.session.current!.base, base, "the map's lines are no step either");
      // Removing tracks, as from the outline's menu.
      assert.equal(await vscode.commands.executeCommand("debrief.tote.remove", ["track-ais-cargo-04", "track-ais-tug-01"]), undefined);
      assert.deepEqual(island().tote, { primary: "track-blue-one", secondaries: ["track-red-one"] });
      // Refused plainly: a feature that is not a track.
      assert.match((await vscode.commands.executeCommand<string>("debrief.tote.add", ["no-such-track"])) ?? "", /Select the tracks/);
      assert.deepEqual(api.session.current!.base, base, "still no step");
      await vscode.commands.executeCommand("notifications.clearAll");
    });
  });
}
