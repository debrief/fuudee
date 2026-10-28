/**
 * The playground's Outline toolbar (product owner, 28 Oct 2026): compact icon buttons above the
 * tree, each with a tooltip (title), a name (aria-label), aria-pressed where it toggles, and one
 * tab stop for the row (role="toolbar", a roving tabindex: ← → Home End move along it). A button
 * that cannot act stays reachable (aria-disabled), its reason in its tooltip and description.
 * What each button does and says is webview/outlinetoolbar.ts's; the colour popover is here:
 * the palette's swatches (arrow keys among them) and a custom colour typed or picked.
 */
import { hexColour, toolbarKey, type ColourButton, type ToolbarId, type VisibilityButton } from "../webview/outlinetoolbar.js";

/** The icons, 16 px, drawn in the text colour (currentColor), so they follow every theme and forced colours. */
const ICONS: Record<string, string> = {
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2.1" fill="currentColor"/>',
  "eye-closed": '<path d="M1.5 6.5S4 10.5 8 10.5s6.5-4 6.5-4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.6 9.2 2.3 11M8 10.5v2.2M12.4 9.2l1.3 1.8M5.6 10.2l-.7 2M10.4 10.2l.7 2" stroke="currentColor" stroke-width="1.2"/>',
  // Half open, half closed: some of the selection hidden.
  "eye-mixed": '<path d="M8 3.5C4 3.5 1.5 8 1.5 8S4 12.5 8 12.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 6a2 2 0 0 0 0 4Z" fill="currentColor"/><path d="M8 9.8c3.6 0 6.5-3.3 6.5-3.3M11.2 9.1l.8 1.8M13.5 7.8l1 1.3" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 2.5v11" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5"/>',
  colour: '<path d="M8 1.6a6.4 6.4 0 1 0 0 12.8c1.2 0 1.5-.9 1-1.8-.5-.8 0-1.8 1-1.8h1.8A2.6 2.6 0 0 0 14.4 8 6.4 6.4 0 0 0 8 1.6Z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="6.2" r="1.1" fill="currentColor"/><circle cx="8.2" cy="4.6" r="1.1" fill="currentColor"/><circle cx="11.1" cy="6.4" r="1.1" fill="currentColor"/><circle cx="4.9" cy="9.6" r="1.1" fill="currentColor"/>',
  "select-all": '<path d="M1.5 8.3 4 10.8l5-6M7 10.4l.5.4 6.3-6.9" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 13.5h13" stroke="currentColor" stroke-width="1.2"/>',
  "select-children": '<path d="M3 2v10.5h3.5M3 7.2h3.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="1.5" y="1" width="3" height="2.4" fill="currentColor"/><rect x="7.5" y="5.6" width="7" height="3.2" rx=".5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="7.5" y="10.9" width="7" height="3.2" rx=".5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  "clear-selection": '<path d="M1.5 3.5h9M1.5 7h7M1.5 10.5h5" stroke="currentColor" stroke-width="1.2"/><path d="m9.5 9 4.5 4.5M14 9l-4.5 4.5" stroke="currentColor" stroke-width="1.4"/>',
};

const icon = (name: string) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

/** What the toolbar shows for the selection now, from the host. */
export interface OutlineBarState {
  visibility: VisibilityButton;
  colour: ColourButton;
  /** Select all: how many rows it would select; why not, when none. */
  all: { count: number; reason?: string };
  children: { count: number; title: string; reason?: string };
  /** Clear selection: whether anything is selected. */
  selected: number;
  /** Why the buttons that change the plot cannot yet (Python starting). */
  waiting?: string;
}

export interface OutlineBarHost {
  state(): OutlineBarState;
  hideOrShow(): void;
  colour(colour: string, name?: string): void;
  selectAll(): void;
  selectChildren(): void;
  clearSelection(): void;
}

interface Button {
  id: ToolbarId;
  element: HTMLButtonElement;
  why: HTMLSpanElement;
}

export class OutlineBar {
  private readonly buttons: Button[];
  private focusAt = 0;
  private popover?: HTMLElement;

  constructor(
    private readonly element: HTMLElement,
    private readonly host: OutlineBarHost,
    private readonly palette: { name: string; colour: string }[],
  ) {
    element.setAttribute("role", "toolbar");
    element.setAttribute("aria-label", "The Outline's selection");
    element.setAttribute("aria-controls", "outline");
    const make = (id: ToolbarId, label: string, act: () => void): Button => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "obar-button";
      button.id = `obar-${id}`;
      button.dataset.action = id;
      button.setAttribute("aria-label", label);
      const why = Object.assign(document.createElement("span"), { id: `obar-why-${id}`, className: "visually-hidden" });
      button.setAttribute("aria-describedby", why.id);
      button.addEventListener("click", () => {
        this.focusAt = this.buttons.findIndex((b) => b.id === id);
        this.roving();
        if (button.getAttribute("aria-disabled") === "true") return;
        act();
      });
      return { id, element: button, why };
    };
    this.buttons = [
      make("visibility", "Hidden on map", () => host.hideOrShow()),
      make("colour", "Colour", () => this.openColour()),
      make("select-all", "Select all", () => host.selectAll()),
      make("select-children", "Select children", () => host.selectChildren()),
      make("clear-selection", "Clear selection", () => host.clearSelection()),
    ];
    const colour = this.buttons[1].element;
    colour.setAttribute("aria-haspopup", "dialog");
    colour.setAttribute("aria-expanded", "false");
    for (const b of this.buttons) element.append(b.element, b.why);
    element.addEventListener("keydown", (e) => {
      const at = this.buttons.findIndex((b) => b.element === document.activeElement);
      if (at < 0) return;
      const to = toolbarKey(at, this.buttons.length, e.key);
      if (to === undefined) return;
      e.preventDefault();
      this.focusAt = to;
      this.roving();
      this.buttons[to].element.focus();
    });
    this.update();
  }

  /** The keyboard's one stop in the row: the button last moved to. */
  private roving(): void {
    this.buttons.forEach((b, i) => (b.element.tabIndex = i === this.focusAt ? 0 : -1));
  }

  /** Show the selection as it is now: each button's icon, state, tooltip and whether it can act. */
  update(): void {
    const s = this.host.state();
    const set = (id: ToolbarId, title: string, enabled: boolean, iconName: string) => {
      const b = this.buttons.find((x) => x.id === id)!;
      b.element.title = title;
      b.why.textContent = title;
      b.element.setAttribute("aria-disabled", String(!enabled));
      b.element.classList.toggle("disabled", !enabled);
      if (b.element.dataset.icon !== iconName) {
        b.element.dataset.icon = iconName;
        b.element.innerHTML = icon(iconName);
      }
    };
    const v = s.visibility;
    const waiting = (title: string) => (s.waiting ? `${title} ${s.waiting}` : title);
    set("visibility", waiting(v.title), !!v.action && !s.waiting, v.state === "hidden" ? "eye-closed" : v.state === "mixed" ? "eye-mixed" : "eye");
    const visibility = this.buttons[0].element;
    visibility.setAttribute("aria-pressed", v.pressed);
    visibility.dataset.state = v.state;
    set("colour", waiting(s.colour.title), s.colour.enabled && !s.waiting, "colour");
    set("select-all", s.all.reason ? `Select all: ${s.all.reason}` : `Select all: every row listed in the Outline (${s.all.count.toLocaleString("en-GB")}), as Ctrl+A in it`, !s.all.reason, "select-all");
    set("select-children", s.children.title, !s.children.reason, "select-children");
    set("clear-selection", s.selected ? "Clear selection" : "Clear selection: nothing is selected.", s.selected > 0, "clear-selection");
    this.roving();
    if (this.popover && !(s.colour.enabled && !s.waiting)) this.closeColour(false);
  }

  // --- The colour popover --------------------------------------------------------------------

  /** The palette's swatches and a custom colour, under the colour button; the keyboard on the swatch of the colour they share, or the first. */
  private openColour(): void {
    if (this.popover) return this.closeColour();
    const s = this.host.state();
    const button = this.buttons[1].element;
    const pop = document.createElement("div");
    pop.className = "obar-popover";
    pop.id = "obar-colour-popover";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Colour the selected");
    const grid = document.createElement("div");
    grid.className = "obar-swatches";
    grid.setAttribute("role", "radiogroup");
    grid.setAttribute("aria-label", "Palette");
    const swatches = this.palette.map((c) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "obar-swatch";
      swatch.setAttribute("role", "radio");
      swatch.setAttribute("aria-checked", String(c.colour === s.colour.current));
      swatch.setAttribute("aria-label", c.name);
      swatch.title = `${c.name} (${c.colour})`;
      swatch.dataset.colour = c.colour;
      swatch.style.setProperty("--swatch", c.colour);
      swatch.onclick = () => this.choose(c.colour, c.name.toLowerCase());
      return swatch;
    });
    const start = Math.max(0, swatches.findIndex((w) => w.getAttribute("aria-checked") === "true"));
    swatches.forEach((w, i) => (w.tabIndex = i === start ? 0 : -1));
    grid.append(...swatches);
    grid.addEventListener("keydown", (e) => {
      const at = swatches.indexOf(document.activeElement as HTMLButtonElement);
      const to = at < 0 ? undefined : toolbarKey(at, swatches.length, e.key);
      if (to === undefined) return;
      e.preventDefault();
      swatches.forEach((w, i) => (w.tabIndex = i === to ? 0 : -1));
      swatches[to].focus();
    });
    const custom = document.createElement("div");
    custom.className = "obar-custom";
    const label = Object.assign(document.createElement("label"), { textContent: "Custom", htmlFor: "obar-custom-hex" });
    const picker = Object.assign(document.createElement("input"), { type: "color", id: "obar-custom-picker", value: s.colour.current ?? this.palette[0].colour });
    picker.setAttribute("aria-label", "Pick a custom colour");
    const hex = Object.assign(document.createElement("input"), { type: "text", id: "obar-custom-hex", value: s.colour.current ?? "", placeholder: "#rrggbb", spellcheck: false });
    hex.setAttribute("aria-describedby", "obar-custom-problem");
    hex.size = 8;
    const apply = Object.assign(document.createElement("button"), { type: "button", textContent: "Apply", className: "obar-apply" });
    const problem = Object.assign(document.createElement("div"), { id: "obar-custom-problem", className: "obar-problem", role: "status" });
    picker.oninput = () => (hex.value = picker.value);
    const typed = () => {
      const value = hexColour(hex.value);
      if (!value) {
        problem.textContent = "Type a colour as #rrggbb, such as the hex a palette gives.";
        hex.focus();
        return;
      }
      this.choose(value);
    };
    apply.onclick = typed;
    hex.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        typed();
      }
    };
    custom.append(label, picker, hex, apply);
    pop.append(grid, custom, problem);
    pop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.closeColour();
      }
    });
    // A press outside closes it, as a menu.
    const outside = (e: PointerEvent) => {
      if (!pop.contains(e.target as Node) && e.target !== button && !button.contains(e.target as Node)) this.closeColour(false);
    };
    document.addEventListener("pointerdown", outside, true);
    pop.addEventListener("focusout", (e) => {
      const to = e.relatedTarget as Node | null;
      if (to && !pop.contains(to) && to !== button) this.closeColour(false);
    });
    (pop as unknown as { cleanup: () => void }).cleanup = () => document.removeEventListener("pointerdown", outside, true);
    this.element.after(pop);
    this.popover = pop;
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", pop.id);
    swatches[start]?.focus();
  }

  private choose(colour: string, name?: string): void {
    this.closeColour();
    this.host.colour(colour, name);
  }

  /** Close the colour popover; the keyboard back on the colour button, if asked. */
  closeColour(focus = true): void {
    const pop = this.popover;
    if (!pop) return;
    this.popover = undefined;
    (pop as unknown as { cleanup?: () => void }).cleanup?.();
    pop.remove();
    const button = this.buttons[1].element;
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-controls");
    if (focus) button.focus();
  }
}
