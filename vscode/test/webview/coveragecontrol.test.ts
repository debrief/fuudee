// The Coverage view's control in jsdom (review, 7 Nov 2026, finding 10): what it asks the host
// for, one step at a time, from its buttons, period lists and bars.
import type { CoverageReport } from "@debrief/schemas";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoverageControl, type CoverageControlHost } from "../../webview/coveragecontrol.js";

const repo = path.resolve(__dirname, "../../..");
const report = JSON.parse(readFileSync(path.join(repo, "schemas/fixtures/webview_message/valid/show-coverage.json"), "utf8")).coverage as CoverageReport;

let element: HTMLElement;
let host: { [K in keyof CoverageControlHost]: ReturnType<typeof vi.fn> };
let control: CoverageControl;
const q = <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector)!;

beforeEach(() => {
  element = document.createElement("div");
  document.body.append(element);
  host = { choose: vi.fn(), link: vi.fn(), take: vi.fn(), dismiss: vi.fn(), reviewed: vi.fn() };
  control = new CoverageControl(element, host);
});

describe("the Coverage view", () => {
  it("asks for a plot until it has a report", () => {
    control.show(undefined);
    expect(q(".cov-empty").hidden).toBe(false);
    expect(q(".cov-body").hidden).toBe(true);
    control.show(report);
    expect(q(".cov-empty").hidden).toBe(true);
    expect(q(".cov-platform-name").textContent).toBe("BLUE ONE");
  });
  it("draws current time across the bars only inside the plot's period", () => {
    control.show(report);
    control.setTime(Date.parse("2023-06-15T09:00:00.000Z"));
    expect(element.classList.contains("cov-has-now")).toBe(true);
    expect(Number(element.style.getPropertyValue("--cov-now"))).toBeCloseTo(0.5, 6);
    control.setTime(Date.parse("2023-06-15T11:00:00.000Z"));
    expect(element.classList.contains("cov-has-now")).toBe(false);
    expect(element.style.getPropertyValue("--cov-now")).toBe("-1");
  });
  it("takes new data as one step, saying so, and asks nothing more until the host answers", () => {
    control.show(report);
    q<HTMLButtonElement>(".cov-take").click();
    expect(host.take).toHaveBeenCalledTimes(1);
    expect(host.take.mock.calls[0][0]).toMatchObject({ catalogue: "debrief-sample", item: "blue-one-nav-log" });
    expect(q(".cov-status").textContent).toBe("Taking the new data…");
    q<HTMLButtonElement>(".cov-dismiss").click();
    expect(host.dismiss).not.toHaveBeenCalled();
    control.say("Nothing new to take.");
    expect(q(".cov-status").textContent).toBe("Nothing new to take.");
    q<HTMLButtonElement>(".cov-dismiss").click();
    expect(host.dismiss).toHaveBeenCalledTimes(1);
  });
  it("readies Set when another source is picked for a period, and chooses it with Enter", () => {
    control.show(report);
    const list = q<HTMLSelectElement>("select[data-track=track-blue-one]");
    const set = list.parentElement!.querySelector<HTMLButtonElement>(".cov-set")!;
    expect(set.disabled).toBe(true);
    list.value = "1";
    list.dispatchEvent(new Event("change", { bubbles: true }));
    expect(set.disabled).toBe(false);
    expect(host.choose).not.toHaveBeenCalled();
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(host.choose).toHaveBeenCalledWith("track-blue-one", { start: "2023-06-15T09:00:00.000Z", end: "2023-06-15T09:30:00.000Z" }, expect.objectContaining({ item: "blue-one-nav-log", track: "track-blue-one" }));
  });
  it("chooses a source by a click on its bar within one of its periods", () => {
    control.show(report);
    const bar = element.querySelectorAll<HTMLElement>(".cov-bar")[1];
    bar.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 24, right: 400, bottom: 24, x: 0, y: 0, toJSON: () => ({}) });
    // 09:15, a quarter of the way past the middle of eight o'clock to ten.
    bar.dispatchEvent(new MouseEvent("click", { clientX: 250, bubbles: true }));
    expect(host.choose).toHaveBeenCalledTimes(1);
    expect(host.choose.mock.calls[0][1]).toEqual({ start: "2023-06-15T09:00:00.000Z", end: "2023-06-15T09:30:00.000Z" });
  });
  it("confirms a proposed source as the platform", () => {
    control.show(report);
    q<HTMLButtonElement>(".cov-link[data-linked=true]").click();
    expect(host.link).toHaveBeenCalledWith("track-blue-one", expect.objectContaining({ item: "blue-one-nav-log" }), true);
  });
});
