/**
 * The playground's side panels fold away, each by its heading (decision, 14 Oct 2026).
 *
 * Each panel is a section whose heading holds a button: the heading stays a heading,
 * so a screen reader's list of headings still finds every panel, and the button says
 * whether the panel is open (aria-expanded) and which part it shows (aria-controls).
 * (A heading inside a details element's summary is not one: the summary is a button,
 * and a button's content is read as plain text.)
 *
 * Which panels are folded is remembered in this browser, for the next visit. Storage
 * can be missing, full or refused (a private window, blocked site data): then nothing
 * is remembered, and every panel starts open.
 */

/** Where the folded panels are remembered: their ids, as a JSON list. */
export const FOLDED_KEY = "debrief.play.folded";

/** The parts of browser storage this needs; window.localStorage, or a stand-in in tests. */
export type FoldStorage = Pick<Storage, "getItem" | "setItem">;

/** The panels remembered as folded; none if storage cannot be read or holds something else. */
export function readFolded(storage: () => FoldStorage | undefined): Set<string> {
  try {
    const text = storage()?.getItem(FOLDED_KEY);
    const ids: unknown = text ? JSON.parse(text) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Remember the folded panels, if storage allows; quietly not, if not. */
export function writeFolded(storage: () => FoldStorage | undefined, folded: Set<string>): void {
  try {
    storage()?.setItem(FOLDED_KEY, JSON.stringify([...folded].sort()));
  } catch {
    // Not remembered: the panels still fold, for this visit.
  }
}

/** The browser's local storage, or none where reading it throws. */
export const browserStorage = (): FoldStorage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * The side column's folding panels. Each is a section with an id panel-<name>, a heading
 * button (button.fold) and the part it shows (.panel-body). Folding fires a "fold" event on
 * the section, so what a panel shows can wait until it is open.
 */
export class Folds {
  private readonly folded: Set<string>;
  /** In the docked layout (dock.ts) tabs show and hide the panels: every body is shown, and what was folded is kept for the narrow layout. */
  private suspended = false;

  /** remember false: start every panel open, and keep folding to this visit (an embedded demo). */
  constructor(
    private readonly sections: HTMLElement[],
    private readonly remember = true,
    private readonly storage: () => FoldStorage | undefined = browserStorage,
  ) {
    this.folded = remember ? readFolded(storage) : new Set();
    for (const section of sections) {
      const button = this.buttonOf(section);
      button.addEventListener("click", () => this.setOpen(section.id, !this.isOpen(section.id)));
      this.show(section);
    }
  }

  isOpen(id: string): boolean {
    return !this.folded.has(id);
  }

  setOpen(id: string, open: boolean): void {
    if (open === this.isOpen(id)) return;
    if (open) this.folded.delete(id);
    else this.folded.add(id);
    if (this.remember) writeFolded(this.storage, this.folded);
    const section = this.sections.find((s) => s.id === id);
    if (!section || this.suspended) return;
    this.show(section);
    section.dispatchEvent(new CustomEvent("fold", { detail: { open } }));
  }

  /** Suspend folding (the docked layout), or take it up again as it was (the narrow one). */
  suspend(on: boolean): void {
    if (on === this.suspended) return;
    this.suspended = on;
    for (const section of this.sections) this.show(section);
  }

  private buttonOf(section: HTMLElement): HTMLButtonElement {
    const button = section.querySelector<HTMLButtonElement>(":scope > .panel-head button.fold, :scope > h2 button.fold");
    if (!button) throw new Error(`${section.id} has no heading button to fold it`);
    return button;
  }

  private show(section: HTMLElement): void {
    const open = this.suspended || this.isOpen(section.id);
    section.classList.toggle("folded", !open);
    this.buttonOf(section).setAttribute("aria-expanded", String(open));
    const body = section.querySelector<HTMLElement>(":scope > .panel-body");
    if (body) body.hidden = !open;
  }
}
