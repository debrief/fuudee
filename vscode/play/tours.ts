/**
 * The playground's Walkthroughs panel (CAP-25): the same walkthroughs as VS Code's Get
 * Started page, step by step, from the same words (walkthroughs/tours.json), so the two
 * cannot drift apart. A step is ticked when the reader does what it asks: the host says
 * each thing done (an event), from what actually happened, never from a button pressed.
 *
 * The panel folds like every side panel. It is a list of steps, each a heading button that
 * opens it (aria-expanded), the step to do next open; a status line says each step done
 * and what comes next, for screen readers too. Its buttons only take the reader to the right
 * place, or open the walkthrough's copy of serial 1: the reader does the step.
 */
import tours from "../walkthroughs/tours.json";
import { stepParts, type TourSource, type TourStep } from "../walkthroughs/contribute.mjs";

export const TOURS: TourSource[] = tours.tours;
export type { TourSource, TourStep };

/** What a step's button does: open a walkthrough's copy, bring a panel or control into view, click one, select features, import the log. */
export type TourAction = { verb: "open" | "focus" | "click" | "select"; target: string } | { verb: "import-log"; target: "" };

/** A button's actions, in order: "select:track-red-one;click:find-jumps". */
export function parseActions(text: string): TourAction[] {
  return text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part === "import-log") return { verb: "import-log", target: "" } as const;
      const [verb, ...rest] = part.split(":");
      if (!["open", "focus", "click", "select"].includes(verb) || !rest.length) throw new Error(`Not a walkthrough action: ${part}`);
      return { verb: verb as "open" | "focus" | "click" | "select", target: rest.join(":") };
    });
}

/**
 * The walkthrough step a call to the playground's Python completes, when it succeeded: the
 * change itself, however the reader made it (a form, the map, the keyboard), as VS Code
 * ticks its steps by the tool service's requests (src/walkthroughs.ts).
 */
export function callEvent(call: string, args: unknown[], result: string): string | undefined {
  let outcome: Record<string, unknown>;
  try {
    outcome = JSON.parse(result) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (!outcome || typeof outcome !== "object" || outcome.error || outcome.conflict || outcome.confirm) return undefined;
  const change = (): Record<string, unknown> => {
    try {
      return ((JSON.parse(String(args[1])) as { change?: Record<string, unknown> }).change ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  switch (call) {
    case "clean":
      return ({ remove_jumps: "jumpsRemoved", smooth: "smoothed", mark: "fixMarked" } as Record<string, string>)[String(change().kind)];
    case "track": {
      const action = (change().edit as { action?: string } | undefined)?.action;
      // A shear, not a stretch: the step asks for a shear (panel review, 17 Oct 2026).
      return change().kind === "edit" && action === "shear" ? "sheared" : undefined;
    }
    case "annotate":
      return change().kind === "add" ? "annotationAdded" : undefined;
    case "frequencies":
      return "frequenciesSet";
    // The walkthrough's log only: a file of the reader's own is not the step's import.
    case "import_tour_log":
      return outcome.item ? "imported" : undefined;
    case "collate":
      if (!outcome.changed) return undefined;
      return ({ take: "newDataTaken", prefer: "sourceChosen" } as Record<string, string>)[String(change().kind)];
    case "export_image":
      return outcome.data ? "imageExported" : undefined;
    case "open_revision":
      return "imageTraced";
    default:
      return undefined;
  }
}

/** The walkthrough an event belongs to: each step waits for an event of its own. */
export const tourOfEvent = (event: string): string | undefined => TOURS.find((t) => t.steps.some((s) => s.event === event))?.id;

/**
 * Whether something the reader did counts for a walkthrough's step (panel review, 17 Oct 2026):
 * only in the walkthrough shown, only on its copy of serial 1, and Coverage only once its log is
 * imported. A change to another plot, or in a walkthrough not shown, ticks nothing.
 */
export function counts(event: string, at: { active: string; copy: string | undefined; item: string | undefined; done: ReadonlySet<string> }): boolean {
  if (tourOfEvent(event) !== at.active || !at.copy || at.item !== at.copy) return false;
  if (event === "coverageShown") return at.done.has("imported");
  return true;
}

/** How far through a walkthrough the reader is: steps done, and the first not done. */
export function progressOf(tour: TourSource, done: ReadonlySet<string>): { done: number; total: number; next?: number } {
  const next = tour.steps.findIndex((s) => !done.has(s.event));
  return { done: tour.steps.filter((s) => done.has(s.event)).length, total: tour.steps.length, ...(next >= 0 && { next }) };
}

/** A step's words as page elements: **bold**, *italic* and `keys`, the rest as text. Never HTML. */
export function inline(text: string, document: Document): Node[] {
  const nodes: Node[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let at = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > at) nodes.push(document.createTextNode(text.slice(at, m.index)));
    const element = document.createElement(m[1] ? "strong" : m[2] ? "em" : "kbd");
    element.textContent = m[1] ?? m[2] ?? m[3];
    nodes.push(element);
    at = m.index + m[0].length;
  }
  if (at < text.length) nodes.push(document.createTextNode(text.slice(at)));
  return nodes;
}

/** Where the reader's choice of walkthrough is kept: this browser, every read and write guarded. */
export interface TourMemory {
  load(): string | undefined;
  save(tour: string): void;
}

/** The panel: a choice of walkthrough, its steps, and a line saying what was done and what is next. */
export class TourPanel {
  private tour: TourSource;
  private readonly done = new Set<string>();
  private readonly open = new Set<string>();
  private readonly list: HTMLOListElement;
  private readonly summary: HTMLElement;
  private readonly said: HTMLElement;
  private readonly picker: HTMLSelectElement;

  constructor(
    private readonly element: HTMLElement,
    private readonly act: (actions: TourAction[], step: TourStep) => Promise<void>,
    private readonly memory?: TourMemory,
    /** A step's picture, the same SVG as VS Code's (theme colours as CSS variables), as text. */
    private readonly media?: (file: string) => Promise<string>,
  ) {
    const document = element.ownerDocument;
    this.tour = TOURS.find((t) => t.id === memory?.load()) ?? TOURS[0];
    const label = Object.assign(document.createElement("label"), { className: "tour-pick" });
    label.append(Object.assign(document.createElement("span"), { textContent: "Walkthrough" }));
    this.picker = document.createElement("select");
    this.picker.id = "tour-pick";
    this.picker.append(...TOURS.map((t) => new Option(t.title, t.id)));
    this.picker.value = this.tour.id;
    this.picker.onchange = () => this.choose(this.picker.value);
    label.append(this.picker);
    this.summary = Object.assign(document.createElement("p"), { className: "detail tour-summary" });
    this.list = Object.assign(document.createElement("ol"), { className: "tour-steps" });
    this.said = Object.assign(document.createElement("p"), { className: "detail tour-said" });
    this.said.setAttribute("role", "status");
    element.replaceChildren(label, this.summary, this.list, this.said);
    this.render();
  }

  /** The walkthrough shown, for tests. */
  get current(): string {
    return this.tour.id;
  }

  /** The events done so far, for tests. */
  get events(): string[] {
    return [...this.done];
  }

  /** Start a walkthrough again: none of its steps done (a fresh copy is made). */
  restart(id: string): void {
    const tour = TOURS.find((t) => t.id === id);
    for (const step of tour?.steps ?? []) this.done.delete(step.event);
    this.open.clear();
    if (id === this.tour.id) {
      this.said.textContent = "";
      this.render();
    }
  }

  /** Show another walkthrough: its next step open. */
  choose(id: string): void {
    const tour = TOURS.find((t) => t.id === id);
    if (!tour) return;
    this.tour = tour;
    this.picker.value = id;
    this.open.clear();
    this.memory?.save(id);
    this.said.textContent = "";
    this.render();
  }

  /** The reader did something a step asks: tick every step waiting for it, and say so. */
  doneWith(event: string | undefined): void {
    if (!event || this.done.has(event)) return;
    this.done.add(event);
    const step = this.tour.steps.find((s) => s.event === event);
    if (!step) return this.render();
    const progress = progressOf(this.tour, this.done);
    const next = progress.next !== undefined ? this.tour.steps[progress.next] : undefined;
    this.said.textContent = next
      ? `Done: ${step.title}. Next: ${next.title}.`
      : `Done: ${step.title}. That is the whole of ${this.tour.title}.`;
    // The step done closes, and the next to do opens, unless the reader opened others.
    this.open.delete(step.id);
    this.render();
  }

  private readonly pictures = new Map<string, Promise<SVGElement | undefined>>();

  /** Put a step's picture in, inline so it takes the page's theme colours; quietly none if it cannot be read. */
  private picture(into: HTMLElement, file: string): void {
    if (!this.media) return;
    let loaded = this.pictures.get(file);
    if (!loaded) {
      loaded = this.media(file).then(
        (text) => {
          const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
          if (svg.nodeName !== "svg") return undefined;
          // Our own files, but drawn only: nothing in them runs.
          svg.querySelectorAll("script, foreignObject").forEach((e) => e.remove()); // not user-facing
          svg.setAttribute("aria-hidden", "true");
          svg.setAttribute("focusable", "false");
          return svg as unknown as SVGElement;
        },
        () => undefined,
      );
      this.pictures.set(file, loaded);
    }
    void loaded.then((svg) => svg && into.isConnected && into.replaceChildren(into.ownerDocument.importNode(svg, true)));
  }

  private render(): void {
    const document = this.element.ownerDocument;
    const progress = progressOf(this.tour, this.done);
    const next = progress.next !== undefined ? this.tour.steps[progress.next] : undefined;
    if (next && !this.open.size) this.open.add(next.id);
    this.summary.replaceChildren(...inline(`${this.tour.description} ${progress.done} of ${progress.total} done.`, document));
    // Keep the keyboard where it was across a redraw.
    const focused = this.list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focus : undefined;
    this.list.replaceChildren(
      ...this.tour.steps.map((step, index) => {
        const isDone = this.done.has(step.event);
        const item = Object.assign(document.createElement("li"), { className: `tour-step${isDone ? " done" : ""}${step === next ? " next" : ""}` });
        const bodyId = `tour-${this.tour.id}-${step.id}`;
        const head = Object.assign(document.createElement("button"), { type: "button", className: "tour-head" });
        head.dataset.focus = `head-${step.id}`;
        head.setAttribute("aria-expanded", String(this.open.has(step.id)));
        head.setAttribute("aria-controls", bodyId);
        const mark = Object.assign(document.createElement("span"), { className: "tour-mark", textContent: isDone ? "✓" : String(index + 1) });
        mark.setAttribute("aria-hidden", "true");
        head.append(mark, Object.assign(document.createElement("span"), { className: "tour-title", textContent: step.title }));
        // Said to screen readers as part of the button: never by the tick alone.
        head.append(Object.assign(document.createElement("span"), { className: "visually-hidden", textContent: isDone ? ", done" : step === next ? ", next" : "" }));
        head.onclick = () => {
          if (this.open.has(step.id)) this.open.delete(step.id);
          else this.open.add(step.id);
          this.render();
        };
        const body = Object.assign(document.createElement("div"), { className: "tour-body", id: bodyId, hidden: !this.open.has(step.id) });
        const { text, where, keys, button } = stepParts(step, "play");
        const go = Object.assign(document.createElement("button"), { type: "button", className: isDone ? "" : "primary", textContent: button });
        go.dataset.focus = `go-${step.id}`;
        go.onclick = () => void this.act(parseActions(step.play.action ?? ""), step);
        const keyLine = Object.assign(document.createElement("p"), { className: "tour-keys" });
        keyLine.append(Object.assign(document.createElement("span"), { className: "detail", textContent: "Keyboard: " }), ...inline(keys, document));
        const picture = Object.assign(document.createElement("div"), { className: "tour-media" });
        picture.setAttribute("role", "img");
        picture.setAttribute("aria-label", step.alt);
        if (this.open.has(step.id)) this.picture(picture, step.media);
        body.append(
          picture,
          Object.assign(document.createElement("p"), {}),
          ...(where ? [Object.assign(document.createElement("p"), { className: "detail" })] : []),
          keyLine,
          go,
        );
        (body.children[1] as HTMLElement).append(...inline(text, document));
        if (where) (body.children[2] as HTMLElement).append(...inline(where, document));
        item.append(head, body);
        return item;
      }),
    );
    if (focused) this.list.querySelector<HTMLElement>(`[data-focus="${focused}"]`)?.focus();
  }
}
