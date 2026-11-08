// The Tote's control in jsdom (review, 7 Nov 2026, finding 10): the table built from the
// tracks chosen, values written in place while playing, and the keyboard kept on a remove.
import type { ToteResult, ToteTrack, ToteView } from "@debrief/schemas";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToteControl } from "../../webview/totecontrol.js";

const repo = path.resolve(__dirname, "../../..");
const shown = JSON.parse(readFileSync(path.join(repo, "schemas/fixtures/webview_message/valid/show-tote.json"), "utf8")) as {
  tote_tracks: ToteTrack[];
  tote_view: ToteView;
  tote: ToteResult;
};

let element: HTMLElement;
let changed: ReturnType<typeof vi.fn>;
let control: ToteControl;
const q = <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector)!;
const columns = () => Array.from(element.querySelectorAll<HTMLElement>("thead th")).map((th) => th.dataset.track);

beforeEach(() => {
  element = document.createElement("div");
  document.body.append(element);
  changed = vi.fn();
  control = new ToteControl(element, { changed });
});

describe("the Tote with no plot", () => {
  it("asks for a plot, its lists off and no table", () => {
    expect(element.classList.contains("tote-empty")).toBe(true);
    expect(q<HTMLSelectElement>(".tote-primary").disabled).toBe(true);
    expect(q<HTMLSelectElement>(".tote-primary").options[0].text).toBe("Open a plot first");
    expect(q(".tote-scroll").hidden).toBe(true);
  });
});

describe("the Tote with tracks chosen", () => {
  beforeEach(() => control.show({ tracks: shown.tote_tracks, view: shown.tote_view, result: shown.tote }));

  it("puts the primary first, then the secondaries as chosen, a row a measure", () => {
    expect(columns()).toEqual(["track-blue-one", "track-red-one", "track-tug-01", "track-gone"]);
    expect(q("thead th").classList.contains("tote-col-primary")).toBe(true);
    expect(element.querySelectorAll("tbody tr")).toHaveLength(shown.tote.measures.length);
    expect(q("tbody tr[data-measure=range] th").textContent).toBe("Range nmi");
  });
  it("says under the table why a track has no values now", () => {
    const whys = Array.from(element.querySelectorAll(".tote-whys li")).map((li) => li.textContent);
    expect(whys).toEqual(["Tug 01 Ended 10:35:00Z", "track-gone No longer in the plot"]);
    expect(q(".tote-whys").hidden).toBe(false);
  });
  it("offers only the tracks not chosen to add, and none once every one is", () => {
    expect(Array.from(q<HTMLSelectElement>(".tote-add").options).map((o) => o.value)).toEqual([""]);
    expect(q<HTMLSelectElement>(".tote-add").options[0].text).toBe("Every track is in the Tote");
  });
  it("writes new values into the cells already there: nothing rebuilt, the keyboard where it was", () => {
    const remove = q<HTMLButtonElement>("button.tote-remove[data-track=track-red-one]");
    remove.focus();
    const cell = q("td[data-track=track-red-one][data-measure=range]");
    const before = cell.textContent;
    const later: ToteResult = structuredClone(shown.tote);
    later.rows[0].values = later.rows[0].values!.map((v) => (v.measure === "range" ? { ...v, value: 3704 } : v));
    control.show({ result: later });
    expect(q("td[data-track=track-red-one][data-measure=range]")).toBe(cell);
    expect(cell.textContent).not.toBe(before);
    expect(cell.textContent).toBe("2.00");
    expect(document.activeElement).toBe(remove);
  });
  it("removes a secondary from the keyboard, says so, saves the choice, and keeps the keyboard on the next ×", () => {
    q<HTMLButtonElement>("button.tote-remove[data-track=track-red-one]").dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(columns()).toEqual(["track-blue-one", "track-tug-01", "track-gone"]);
    expect(changed).toHaveBeenLastCalledWith({ ...shown.tote_view, secondaries: ["track-tug-01", "track-gone"] });
    expect(q(".tote-status").textContent).toBe("RED ONE removed from the Tote.");
    expect((document.activeElement as HTMLElement).dataset.track).toBe("track-tug-01");
    expect(Array.from(q<HTMLSelectElement>(".tote-add").options).map((o) => o.text)).toEqual(["Add a secondary…", "RED ONE"]);
  });
  it("adds a secondary from the list, its name shown until its values arrive", () => {
    control.show({ view: { primary: "track-blue-one", secondaries: [] } });
    expect(q(".tote-hint").textContent).toMatch(/^Add the tracks to measure from the primary/);
    const add = q<HTMLSelectElement>(".tote-add");
    add.value = "track-tug-01";
    add.dispatchEvent(new Event("change"));
    expect(columns()).toEqual(["track-blue-one", "track-tug-01"]);
    expect(changed).toHaveBeenLastCalledWith({ primary: "track-blue-one", secondaries: ["track-tug-01"] });
    expect(q(".tote-hint").hidden).toBe(true);
  });
});
