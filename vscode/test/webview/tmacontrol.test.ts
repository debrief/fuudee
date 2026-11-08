// The Bearings view's control in jsdom (review, 7 Nov 2026, finding 10): what it shows, the
// status line and the message line, and when it lays itself out again (#122, #123): a resize
// under a box being dragged waits for the box; ⋯ opened or closed lays it out there and then.
import type { TmaResidualRow, TmaView } from "@debrief/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TmaControl, type TmaControlHost } from "../../webview/tmacontrol.js";
import { drawn, resized, sized } from "./setup.js";

const T0 = Date.parse("2023-06-15T09:00:00.000Z");
const T = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

function row(i: number, residual: number): TmaResidualRow {
  const bearing = 40 + i;
  return { id: `cut-${i}`, sensor_id: "sensor-a", time: T(i * 2), bearing, measured: bearing, calculated: bearing - residual, residual, colour: "#1f77b4" };
}

function solutionView(residuals = [0.4, -0.2, 0.1, 0.3, -0.5, 0.2, 0, -0.1, 0.3, -0.3]): TmaView {
  const rows = residuals.map((r, i) => row(i, r));
  return {
    plot_id: "serial-1",
    solution_id: "solution-a",
    title: "RED ONE solution",
    error_cut_off: 3,
    residuals: { solution_id: "solution-a", rows, counted: rows.length, excluded: 0, without: 0, rms: 0.29 },
    solutions: [
      {
        id: "solution-a",
        name: "RED ONE solution",
        contact: "RED ONE",
        cuts: rows.length,
        colour: "#d62728",
        period: { start: T(0), end: T(18) },
        times: [T(0), T(9), T(18)],
        courses: [90, 90, 90],
        speeds: [5, 5, 5],
      },
    ],
    coverage: [],
  };
}

function host(): TmaControlHost & { drawn: ReturnType<typeof vi.fn> } {
  return { create: vi.fn(), guess: vi.fn(), exclude: vi.fn(), split: vi.fn(), time: vi.fn(), resolve: vi.fn(), resolveCuts: vi.fn(), select: vi.fn(), cutOff: vi.fn(), drawn: vi.fn() };
}

let element: HTMLElement;
let told: ReturnType<typeof host>;
let control: TmaControl;
const q = <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector)!;

/** The view and its plot laid out at a size, as the browser would. */
function layOut(width: number, plotHeight: number): void {
  sized(element, { width });
  sized(q(".tma-plot"), { width, height: plotHeight });
  resized(element);
}

const pointer = (type: string, x: number, y: number) => q(".tma-canvas").dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));

beforeEach(() => {
  element = document.createElement("div");
  document.body.append(element);
  told = host();
  control = new TmaControl(element, told);
});

afterEach(() => vi.useRealTimers());

describe("the Bearings view, nothing chosen", () => {
  it("says what to select, and shows no plot", () => {
    expect(q(".tma-empty").hidden).toBe(false);
    expect(q(".tma-empty").textContent).toBe("Select a sensor or a TMA solution in the Outline to see its bearings here.");
    expect(q(".tma-body").hidden).toBe(true);
  });
  it("says it is waiting, busy, until a view is shown", () => {
    control.waiting("Reading the bearings…");
    expect(q(".tma-empty").textContent).toBe("Reading the bearings…");
    expect(element.getAttribute("aria-busy")).toBe("true");
    control.show(solutionView());
    expect(element.hasAttribute("aria-busy")).toBe(false);
    expect(q(".tma-empty").hidden).toBe(true);
  });
});

describe("a solution shown", () => {
  beforeEach(() => {
    control.show(solutionView());
    layOut(500, 300);
  });
  it("draws the Bearing and Error panes and tells the host the plot's size", () => {
    expect(control.plotState.drawn).toEqual(["bearing", "error"]);
    // 300 px of plot: 28 above the panes for their names and ticks, 6 below.
    const [height, widths] = told.drawn.mock.calls.at(-1)!;
    expect(height).toBe(266);
    expect(widths).toHaveLength(2);
    expect(drawn(q(".tma-canvas")).filter((c) => c.name === "arc").length).toBeGreaterThan(10);
    expect(q(".tma-canvas").getAttribute("aria-label")).toMatch(/^Bearings and residuals of RED ONE solution, time upward from .*; panes Bearing, Error: RMS/);
  });
  it("puts the whole status line in its tooltip: the cue, the RMS, the bearings off scale", () => {
    const line = q(".tma-statusline");
    expect(q(".tma-rms").textContent).toMatch(/^RMS 0\.\d° over 10 cuts/);
    expect(line.title).toBe(`${q(".tma-cue").textContent!.replace(/\s+/g, " ").trim()} · ${q(".tma-rms").textContent}`);
    expect(q(".tma-cue").dataset.state).toBe("within");
  });
  it("says a message on one line, whole in its tooltip, and clears it after a while", () => {
    vi.useFakeTimers();
    control.say("Zoomed: 09:02 to 09:10.");
    const status = q(".tma-status");
    expect(status.textContent).toBe("Zoomed: 09:02 to 09:10.");
    expect(status.title).toBe("Zoomed: 09:02 to 09:10.");
    // The message and Select bearings' hint share the one line beneath the plot.
    expect(status.parentElement).toBe(q(".tma-select-hint").parentElement);
    vi.advanceTimersByTime(6000);
    expect(status.textContent).toBe("");
    expect(status.hasAttribute("title")).toBe(false);
  });
  it("with Select bearings on, says what a box does and marks the view for its hint", () => {
    q<HTMLButtonElement>(".tma-select").click();
    expect(element.classList.contains("tma-selecting")).toBe(true);
    expect(q(".tma-select").getAttribute("aria-pressed")).toBe("true");
    expect(q(".tma-status").textContent).toMatch(/^Select bearings on: box the Bearing pane's dots/);
    q<HTMLButtonElement>(".tma-select").click();
    expect(element.classList.contains("tma-selecting")).toBe(false);
  });
  it("hides a pane, remembers it, and never hides the last", () => {
    q<HTMLButtonElement>(".tma-pane[data-pane=error]").click();
    expect(control.plotState.drawn).toEqual(["bearing"]);
    q<HTMLButtonElement>(".tma-pane[data-pane=bearing]").click();
    expect(control.plotState.drawn).toEqual(["bearing"]);
    expect(q(".tma-status").textContent).toBe("One pane at least stays shown.");
  });
});

describe("laid out again as the view changes size (#122, #123)", () => {
  beforeEach(() => {
    control.show(solutionView());
    layOut(500, 300);
    told.drawn.mockClear();
  });
  it("lays out at once when the view is resized, wide from 640 px", () => {
    layOut(800, 300);
    expect(element.classList.contains("tma-wide")).toBe(true);
    expect(told.drawn).toHaveBeenCalledTimes(1);
  });
  it("waits for a box being dragged, then lays out once it is let go", () => {
    const { boxes } = control.plotState;
    const error = boxes.error!;
    const x = error.x + error.w / 2;
    pointer("pointerdown", x, error.top + 40);
    pointer("pointermove", x + 30, error.top + 120);
    layOut(800, 300);
    // Not under the box: its pixels still the times and values it was drawn over.
    expect(element.classList.contains("tma-wide")).toBe(false);
    expect(told.drawn).not.toHaveBeenCalled();
    pointer("pointerup", x + 30, error.top + 120);
    expect(control.plotState.zoomed).toBe(true);
    expect(element.classList.contains("tma-wide")).toBe(true);
    expect(told.drawn.mock.calls.at(-1)![1].reduce((a: number, b: number) => a + b)).toBeGreaterThan(600);
  });
  it("lays out a box given up, too", () => {
    const error = control.plotState.boxes.error!;
    pointer("pointerdown", error.x + 10, error.top + 10);
    layOut(800, 300);
    expect(element.classList.contains("tma-wide")).toBe(false);
    q(".tma-canvas").dispatchEvent(new PointerEvent("pointercancel"));
    expect(element.classList.contains("tma-wide")).toBe(true);
  });
  it("draws the plot to its new height as ⋯ opens and closes, with no resize to wait for", () => {
    const more = q<HTMLButtonElement>(".tma-more-button");
    // ⋯ open takes 26 px from the plot: drawn to that there and then.
    sized(q(".tma-plot"), { width: 500, height: 274 });
    more.click();
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(q(".tma-more").hidden).toBe(false);
    expect(told.drawn.mock.calls.at(-1)![0]).toBe(240);
    sized(q(".tma-plot"), { width: 500, height: 300 });
    more.click();
    expect(q(".tma-more").hidden).toBe(true);
    expect(told.drawn.mock.calls.at(-1)![0]).toBe(266);
  });
  it("waits for a box being dragged before laying out for ⋯ too", () => {
    const error = control.plotState.boxes.error!;
    pointer("pointerdown", error.x + 10, error.top + 10);
    sized(q(".tma-plot"), { width: 500, height: 274 });
    q<HTMLButtonElement>(".tma-more-button").click();
    expect(told.drawn).not.toHaveBeenCalled();
    pointer("pointerup", error.x + 10, error.top + 10);
    expect(told.drawn.mock.calls.at(-1)![0]).toBe(240);
  });
});
