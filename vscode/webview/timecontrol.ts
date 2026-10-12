/**
 * The current-time control (SUB-26): a slider over the plot's period, step
 * buttons and the time it shows. The map webview puts it over the map; a page
 * hosting the map, such as the blog's playground, can place it elsewhere.
 */
import { DEFAULT_SETTINGS, formatTime } from "@debrief/kernel";
import type { TimeState } from "@debrief/schemas";

const dated = { ...DEFAULT_SETTINGS, time_style: "date_time" as const };
// Steps the buttons and arrow keys move by: about a hundredth of the plot's period.
const STEPS = [1, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400].map((s) => s * 1000);

export class TimeControl {
  time?: TimeState;
  private readonly slider: HTMLInputElement;
  private readonly label: HTMLElement;
  private step = 1000;

  /** element gets the control's parts; moved is called as the analyst moves current time. */
  constructor(
    private readonly element: HTMLElement,
    private readonly moved: (time: TimeState) => void,
  ) {
    element.classList.add("timebar");
    element.hidden = true;
    element.innerHTML =
      `<button class="step back" title="Step back" aria-label="Step back">‹</button>` +
      `<input type="range" aria-label="Current time">` +
      `<button class="step forward" title="Step forward" aria-label="Step forward">›</button>` +
      `<span class="time-label" aria-live="polite"></span>`;
    this.slider = element.querySelector("input")!;
    this.label = element.querySelector(".time-label")!;
    this.slider.addEventListener("input", () => this.moveTo(Number(this.slider.value)));
    this.slider.addEventListener("keydown", (event) => {
      const by = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[event.key];
      if (by === undefined) return;
      event.preventDefault();
      this.moveTo(Number(this.slider.value) + by * this.step);
    });
    element.querySelector(".back")!.addEventListener("click", () => this.moveTo(Number(this.slider.value) - this.step));
    element.querySelector(".forward")!.addEventListener("click", () => this.moveTo(Number(this.slider.value) + this.step));
  }

  /** Show current time as set elsewhere (a plot opening, a tool, another view); none hides the control. */
  show(time: TimeState | undefined): void {
    this.time = time;
    this.element.hidden = !time;
    if (!time) return;
    const [start, end] = [Date.parse(time.range.start), Date.parse(time.range.end)];
    this.step = STEPS.find((s) => s >= (end - start) / 100) ?? STEPS.at(-1)!;
    this.slider.min = String(start);
    this.slider.max = String(end);
    this.slider.step = "1000"; // dragging reaches any second; buttons and arrow keys move by step
    this.slider.value = String(Date.parse(time.current));
    this.slider.title = `${formatTime(start, dated)} to ${formatTime(end, dated)}`;
    this.label.textContent = formatTime(Date.parse(time.current), dated);
    this.slider.setAttribute("aria-valuetext", this.label.textContent);
  }

  private moveTo(ms: number): void {
    if (!this.time) return;
    const [start, end] = [Date.parse(this.time.range.start), Date.parse(this.time.range.end)];
    ms = Math.max(start, Math.min(end, ms));
    this.show({ current: new Date(ms).toISOString(), range: this.time.range });
    this.moved(this.time);
  }
}
