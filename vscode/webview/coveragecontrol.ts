/**
 * Coverage (CAP-08 to CAP-12): collation with coverage visible, for the open plot.
 *
 * One component for every host: VS Code shows it as the Coverage view in the Debrief
 * sidebar, below Catalogues (webview/coverage.ts); the playground in its side column.
 * The host asks Python for the plot's coverage (debrief/coverage) and shows it here; this
 * only draws it and says what the analyst chose. Every choice is one recorded step,
 * made by the host through the tool service, except setting new data aside and clearing
 * a review flag, which are view state in the plot's island.
 *
 * - **May need review** (CAP-12): items the plot drew from were revised since. Says which,
 *   with **Reviewed** to clear the flag until one is revised again.
 * - **New data** (CAP-10): items that came into the folder tree after the plot, with data
 *   for its platforms or within its period. Each is marked with a sparkle and the words
 *   *New data*, never colour alone, its reason as its tooltip and its label for screen
 *   readers, with **Take** (CAP-11, one step) and **Not now**.
 * - **Platforms** (CAP-09): each of the plot's tracks, then a line for each source of data
 *   for it (the plot's own, items linked, items proposed because the name matches) with a
 *   bar of the periods it covers along the time all of them cover; the periods the plot's
 *   track takes from it are solid, the rest outlined. Proposed sources have **Same
 *   platform** and **Not this platform**; linked ones not supplying anything, **Unlink**.
 *   Under the bars, each period in which two or more sources have data (or one the plot
 *   has not taken) has a list choosing which supplies it. Choosing on the list, or
 *   clicking a source's bar in that period, is one step.
 * - Narrow (a sidebar, a phone): bars take the width there is, words wrap, and nothing
 *   scrolls sideways. Current time is a thin line across every bar.
 * - Keyboard: Tab reaches every button and list; the lists choose with the arrow keys.
 */
import { DEFAULT_SETTINGS, formatTime, type FormatSettings } from "@debrief/kernel";
import type { CoverageItem, CoveragePeriod, CoveragePlatform, CoverageReport, CoverageSource, ItemRevision, SourceTrackRef, TimeRange } from "@debrief/schemas";
import { along, extentOf, linkWords, rangeOf } from "./coveragelogic.js";

export interface CoverageControlHost {
  /** Choose which source supplies a period of a track: one step. */
  choose(track: string, period: TimeRange, source: SourceTrackRef): void;
  /** Confirm or link (true), or refuse or unlink (false), a source as the track's platform: one step. */
  link(track: string, source: SourceTrackRef, linked: boolean): void;
  /** Take an item's new data into the plot: one step. */
  take(item: ItemRevision): void;
  /** Set an item's new data aside for now: the plot's island. */
  dismiss(item: ItemRevision): void;
  /** The analyst reviewed the plot against the revised items: the plot's island. */
  reviewed(): void;
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const refOf = (s: CoverageSource): SourceTrackRef => ({ catalogue: s.catalogue, item: s.item, track: s.track, name: s.name });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export class CoverageControl {
  private report?: CoverageReport;
  private extent?: { start: number; end: number };
  private readonly body: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly status: HTMLElement;
  /** What the analyst last asked for, said while the host works on it. */
  private busy = false;
  /** Platforms the analyst opened or folded, by track: kept as the view is drawn again. */
  private readonly folded = new Map<string, boolean>();

  constructor(
    private readonly element: HTMLElement,
    private readonly host: CoverageControlHost,
    private readonly settings: FormatSettings = DEFAULT_SETTINGS,
  ) {
    element.classList.add("cov");
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", "Coverage");
    element.innerHTML = `<p class="cov-empty">Open a plot to see which catalogue items have data for it.</p><div class="cov-body"></div><p class="cov-status" aria-live="polite"></p>`;
    this.empty = element.querySelector(".cov-empty")!;
    this.body = element.querySelector(".cov-body")!;
    this.status = element.querySelector(".cov-status")!;
    this.body.addEventListener("click", (event) => this.clicked(event));
    this.body.addEventListener("change", (event) => this.changed(event));
    this.body.addEventListener(
      "toggle",
      (event) => {
        const details = event.target as HTMLDetailsElement;
        if (details.dataset?.track) this.folded.set(details.dataset.track, details.open);
      },
      true,
    );
  }

  /** The plot's coverage, or none (no plot open). */
  show(report: CoverageReport | undefined): void {
    this.report = report;
    this.extent = extentOf(report);
    this.busy = false;
    this.status.textContent = "";
    this.empty.hidden = !!report;
    this.body.hidden = !report;
    this.body.innerHTML = report ? this.html(report) : "";
  }

  /** Current time, as a line across every bar; outside the bars, none. */
  setTime(ms: number | undefined): void {
    const extent = this.extent;
    const inside = ms !== undefined && extent && ms >= extent.start && ms <= extent.end;
    this.element.style.setProperty("--cov-now", inside ? String(along(ms!, extent!)) : "-1");
    this.element.classList.toggle("cov-has-now", !!inside);
  }

  /** Something the host has to say once it has answered: why a choice was refused, say. */
  say(text: string): void {
    this.busy = false;
    this.status.textContent = text;
  }

  private time(iso: string): string {
    return formatTime(Date.parse(iso), this.settings);
  }

  private period(p: { start: string; end: string }): string {
    return p.start === p.end ? `at ${this.time(p.start)}` : `${this.time(p.start)} to ${this.time(p.end)}`;
  }

  private html(report: CoverageReport): string {
    const parts: string[] = [];
    if (report.review) {
      parts.push(
        `<section class="cov-review" aria-label="May need review"><p><span class="cov-flag" aria-hidden="true">⚑</span> ${escape(report.review.note)}.</p>` +
          `<button type="button" class="cov-reviewed" title="You have reviewed this plot against the revised items: clear the flag until one is revised again">Reviewed</button></section>`,
      );
    }
    const fresh = report.items.filter((i) => i.new_data);
    if (fresh.length) {
      parts.push(`<section class="cov-new" aria-labelledby="cov-new-heading"><h3 id="cov-new-heading">New data</h3><ul>${fresh.map((i) => this.newItem(i)).join("")}</ul></section>`);
    }
    const revised = report.items.filter((i) => i.revised);
    if (revised.length) {
      parts.push(
        `<section class="cov-new" aria-labelledby="cov-revised-heading"><h3 id="cov-revised-heading">Revised since taken</h3><ul>${revised.map((i) => this.revisedItem(i)).join("")}</ul></section>`,
      );
    }
    if (report.start && report.end) {
      parts.push(`<p class="cov-axis"><span>${escape(this.time(report.start))}</span><span>${escape(this.time(report.end))}</span></p>`);
    }
    parts.push(report.platforms.length ? report.platforms.map((p) => this.platform(p)).join("") : `<p class="cov-quiet">The plot has no tracks.</p>`);
    const others = report.items.filter((i) => i.role !== "this_plot").length;
    parts.push(`<p class="cov-quiet">${others ? `Looking in ${plural(others, "other item")} in the folders this plot draws from.` : "No other items in the folders this plot draws from."}</p>`);
    return parts.join("");
  }

  private newItem(item: CoverageItem): string {
    const mark = item.new_data!;
    const ref = escape(JSON.stringify({ catalogue: item.catalogue, item: item.item, revision: mark.revision }));
    return (
      `<li class="cov-item" aria-label="${escape(`${item.title}. ${mark.note}`)}">` +
      `<span class="cov-name" title="${escape(mark.note)}"><span class="cov-spark" aria-hidden="true">✦</span> <span class="cov-tag">New data</span> ${escape(item.title)}</span>` +
      `<span class="cov-why">${escape(mark.note)}</span>` +
      `<span class="cov-actions"><button type="button" class="cov-take" data-ref="${ref}" title="Take its data into this plot, as one step: Undo takes it back">Take</button>` +
      `<button type="button" class="cov-dismiss" data-ref="${ref}" title="Set it aside: the mark clears until it is revised">Not now</button></span></li>`
    );
  }

  private revisedItem(item: CoverageItem): string {
    const ref = escape(JSON.stringify({ catalogue: item.catalogue, item: item.item, revision: item.revision }));
    return (
      `<li class="cov-item"><span class="cov-name"><span class="cov-flag" aria-hidden="true">⚑</span> ${escape(item.title)}</span>` +
      `<span class="cov-why">Revised since this plot took data from it.</span>` +
      `<span class="cov-actions"><button type="button" class="cov-take" data-ref="${ref}" title="Read the periods it supplies again from its revision now, and take anything new, as one step">Take again</button></span></li>`
    );
  }

  private platform(platform: CoveragePlatform): string {
    const swatch = platform.colour ? `<i class="cov-swatch" style="background:${escape(platform.colour)}"></i>` : "";
    const sources = platform.sources.map((s, i) => this.source(platform, s, i)).join("");
    const choices = platform.periods.filter((p) => p.sources.length > 1 || p.chosen === undefined || p.chosen === null);
    const list = choices.length
      ? `<div class="cov-choices" role="group" aria-label="${escape(`Which source supplies ${platform.name}`)}">${choices.map((p) => this.choice(platform, p)).join("")}</div>`
      : "";
    // Open where there is a choice to make (two sources with data for one period), unless the
    // analyst folded it; folded otherwise, so a study of fifty items stays readable.
    const choose = platform.periods.filter((p) => p.sources.length > 1).length;
    const open = this.folded.get(platform.track) ?? choose > 0;
    const said = [plural(platform.sources.length, "source"), choose ? `${plural(choose, "period")} to choose` : ""].filter(Boolean).join(" · ");
    return (
      `<details class="cov-platform" data-track="${escape(platform.track)}"${open ? " open" : ""}>` +
      `<summary class="cov-head">${swatch}<span class="cov-platform-name">${escape(platform.name)}</span> <span class="cov-quiet">${escape(said)}</span></summary>` +
      sources +
      list +
      `</details>`
    );
  }

  private source(platform: CoveragePlatform, source: CoverageSource, at: number): string {
    const extent = this.extent;
    const supplied = platform.periods.filter((p) => p.chosen === at);
    const spans = source.spans
      .map((s) => this.segment(s, "cov-span", `${source.title}: data ${this.period(s)}`))
      .join("");
    const solid = supplied.map((p) => this.segment(p, "cov-supplied", `Supplies ${platform.name} ${this.period(p)}`)).join("");
    const ref = escape(JSON.stringify(refOf(source)));
    let actions = "";
    if (source.link === "proposed") {
      actions =
        `<button type="button" class="cov-link" data-ref="${ref}" data-linked="true" title="${escape(`${source.name} in ${source.title} is ${platform.name}`)}">Same platform</button>` +
        `<button type="button" class="cov-link" data-ref="${ref}" data-linked="false" title="${escape(`${source.name} in ${source.title} is another platform: stop proposing it`)}">Not this platform</button>`;
    } else if (source.link === "linked" && !supplied.length) {
      actions = `<button type="button" class="cov-link" data-ref="${ref}" data-linked="false" title="${escape(`${source.name} in ${source.title} is not ${platform.name} after all`)}">Unlink</button>`;
    }
    const said = `${source.title}, ${linkWords(source)}, ${plural(source.fixes, "fix", "fixes")}${supplied.length ? `, supplying ${plural(supplied.length, "period")}` : ""}${source.revised ? ", revised since taken" : ""}`;
    return (
      `<div class="cov-source cov-${escape(source.link)}" data-at="${at}">` +
      `<div class="cov-label"><span class="cov-title" title="${escape(said)}">${escape(source.title)}</span>` +
      `<span class="cov-quiet">${escape(linkWords(source))}${source.name !== platform.name ? ` · ${escape(source.name)}` : ""} · ${plural(source.fixes, "fix", "fixes")}${source.revised ? " · revised" : ""}</span>` +
      (actions ? `<span class="cov-actions">${actions}</span>` : "") +
      `</div>` +
      `<div class="cov-bar" data-at="${at}" role="img" aria-label="${escape(`${said}. Data ${source.spans.map((s) => this.period(s)).join("; ") || "none"}`)}">${extent ? spans + solid : ""}</div>` +
      `</div>`
    );
  }

  private segment(range: { start: string; end: string }, kind: string, title: string): string {
    const extent = this.extent!;
    const left = along(Date.parse(range.start), extent) * 100;
    const right = along(Date.parse(range.end), extent) * 100;
    return `<span class="${kind}" style="left:${left.toFixed(3)}%;width:${Math.max(right - left, 0).toFixed(3)}%" title="${escape(title)}"></span>`;
  }

  private choice(platform: CoveragePlatform, period: CoveragePeriod): string {
    const label = `Source for ${platform.name} ${this.period(period)}`;
    const options = period.sources
      .map((i) => `<option value="${i}"${period.chosen === i ? " selected" : ""}>${escape(platform.sources[i].title)}</option>`)
      .join("");
    const none = period.chosen === undefined || period.chosen === null ? `<option value="" selected>Not taken</option>` : "";
    const data = escape(JSON.stringify(rangeOf(period)));
    return (
      `<label class="cov-choice"><span class="cov-when">${escape(this.period(period))}</span>` +
      `<select data-track="${escape(platform.track)}" data-period="${data}" aria-label="${escape(label)}">${none}${options}</select></label>`
    );
  }

  private platformOf(el: Element): CoveragePlatform | undefined {
    const track = el.closest<HTMLElement>(".cov-platform")?.dataset.track;
    return this.report?.platforms.find((p) => p.track === track);
  }

  private clicked(event: Event): void {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("button");
    if (button) {
      if (this.busy) return;
      if (button.classList.contains("cov-reviewed")) return this.ask("Clearing the review flag…", () => this.host.reviewed());
      const ref = button.dataset.ref ? JSON.parse(button.dataset.ref) : undefined;
      if (button.classList.contains("cov-take")) return this.ask("Taking the new data…", () => this.host.take(ref as ItemRevision));
      if (button.classList.contains("cov-dismiss")) return this.ask("Setting it aside…", () => this.host.dismiss(ref as ItemRevision));
      if (button.classList.contains("cov-link")) {
        const platform = this.platformOf(button);
        if (platform) this.ask("Saving…", () => this.host.link(platform.track, ref as SourceTrackRef, button.dataset.linked === "true"));
      }
      return;
    }
    // A click on a source's bar, in a period it has data for: it supplies that period.
    const bar = target.closest<HTMLElement>(".cov-bar");
    const platform = bar && this.platformOf(bar);
    if (!bar || !platform || !this.extent || this.busy) return;
    const at = Number(bar.dataset.at);
    const box = bar.getBoundingClientRect();
    const x = (event as MouseEvent).clientX;
    if (!box.width || x === undefined) return;
    const ms = this.extent.start + ((x - box.left) / box.width) * (this.extent.end - this.extent.start);
    const slack = ((this.extent.end - this.extent.start) * 4) / box.width; // four pixels either side
    const period = platform.periods.find((p) => p.sources.includes(at) && Date.parse(p.start) - slack <= ms && ms <= Date.parse(p.end) + slack);
    if (!period || period.chosen === at) return;
    const source = platform.sources[at];
    this.ask(`${source.title} supplies ${platform.name} ${this.period(period)}…`, () => this.host.choose(platform.track, rangeOf(period), refOf(source)));
  }

  private changed(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select.tagName !== "SELECT" || !select.value) return;
    const platform = this.platformOf(select);
    if (!platform) return;
    const source = platform.sources[Number(select.value)];
    const period = JSON.parse(select.dataset.period!) as TimeRange;
    this.ask(`${source.title} supplies ${platform.name} ${this.period(period)}…`, () => this.host.choose(platform.track, period, refOf(source)));
  }

  private ask(saying: string, act: () => void): void {
    this.busy = true;
    this.status.textContent = saying;
    act();
  }
}
