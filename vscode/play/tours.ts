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
 *
 * When a walkthrough's steps are all done, the next walkthrough is offered by a button in the
 * accent, the keyboard put on it; after the last, that all are done (product owner, 23 Oct 2026).
 * Before then, a quieter link skips to it: a reader stuck on a step, or who knows it already, is
 * never left to find the next in the list. Steps tick only from what was done, so there is no
 * skipping a step to wait for; the link is always there instead, below the steps.
 */
import tours from "../walkthroughs/tours.json";
import type { OutlineFocus } from "../webview/outlinemodel.js";
import { ALL_DONE, nextLabel, nextTour, stepParts, tmaDragEvent, type TourSource, type TourStep } from "../walkthroughs/contribute.mjs";

export const TOURS: TourSource[] = tours.tours;
export type { TourSource, TourStep };

/**
 * What a step's button does: open a walkthrough's copy, bring a panel or control into view, click
 * one, select features, import the log, or choose rows in the Outline under a sensor's or a
 * solution's row, Bearings following (product owner, 27 Oct 2026: outline:<sensor or solution>,
 * ?cut=<time>, ?period=<start>/<end>&make for the first guess's form, ?fix=<time>).
 */
type Verb = "open" | "focus" | "click" | "select" | "outline";
export type TourAction = { verb: Verb; target: string } | { verb: "import-log"; target: "" };
const VERBS: string[] = ["open", "focus", "click", "select", "outline"];

/** An outline action's target: the sensor or solution whose rows are chosen, and which (an OutlineFocus, as VS Code's step passes it). */
export function outlineTarget(target: string): { feature: string; focus?: OutlineFocus } {
  const [feature, query] = target.split("?");
  if (!query) return { feature };
  const focus: OutlineFocus = {};
  for (const part of query.split("&")) {
    const [key, value = ""] = part.split("=");
    if (key === "cut") focus.cut_time = value;
    else if (key === "fix") focus.fix_time = value;
    else if (key === "period") {
      const [start, end] = value.split("/");
      focus.period = { start, end };
    } else if (key === "make") focus.make = true;
    else throw new Error(`Not a choice in the Outline: ${part}`);
  }
  return { feature, focus };
}

/** A button's actions, in order: "select:track-red-one;click:find-jumps". */
export function parseActions(text: string): TourAction[] {
  return text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part === "import-log") return { verb: "import-log", target: "" } as const;
      const [verb, ...rest] = part.split(":");
      if (!VERBS.includes(verb) || !rest.length) throw new Error(`Not a walkthrough action: ${part}`);
      return { verb: verb as Verb, target: rest.join(":") };
    });
}

/**
 * The walkthrough step a call to the playground's Python completes, when it succeeded: the
 * change itself, however the reader made it (a form, the map, the keyboard), as VS Code
 * ticks its steps by the tool service's requests (src/walkthroughs.ts). legsOf says how many legs a
 * TMA solution has (undefined for a track that is not one): its drags are Bearings and TMA's steps,
 * not Tidy a track's shear.
 */
export function callEvent(call: string, args: unknown[], result: string, legsOf: (id: string) => number | undefined = () => undefined): string | undefined {
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
      if (change().kind !== "edit") return undefined;
      const edit = change().edit as { action?: string; period?: unknown } | undefined;
      const action = String(edit?.action);
      // A TMA solution dragged, by any of a track's drags, or one of its legs: Bearings and TMA's steps.
      const tma = tmaDragEvent(legsOf(String(change().feature)), action, !!edit?.period);
      if (tma !== false) return tma;
      // A shear, not a stretch: the step asks for a shear (panel review, 17 Oct 2026).
      return action === "shear" ? "sheared" : undefined;
    }
    case "sensor": {
      // A side kept: not both bearings made ambiguous again.
      const keep = (change().resolution as { keep?: string } | undefined)?.keep;
      return change().kind === "resolve" && keep && keep !== "ambiguous" ? "sideKept" : undefined;
    }
    case "tma_change": {
      const kind = change().kind;
      if (kind === "create") return outcome.feature ? "solutionMade" : undefined;
      // Left out, not counted again; nothing changed (already left out) is not it.
      // A split is not the step: dragging one of its legs is (tmaDragEvent).
      return kind === "exclude" && change().excluded && outcome.changed !== false ? "cutLeftOut" : undefined;
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
  /** Below the steps: the next walkthrough, or that all are done. */
  private readonly ahead: HTMLElement;

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
    this.ahead = Object.assign(document.createElement("div"), { className: "tour-ahead" });
    this.said = Object.assign(document.createElement("p"), { className: "detail tour-said" });
    this.said.setAttribute("role", "status");
    element.replaceChildren(label, this.summary, this.list, this.ahead, this.said);
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
    const after = nextTour({ tours: TOURS }, this.tour.id);
    this.said.textContent = next
      ? `Done: ${step.title}. Next: ${next.title}.`
      : `Done: ${step.title}. That is the whole of ${this.tour.title}. ${after ? `${nextLabel(after)}: the button below the steps.` : `${ALL_DONE}.`}`;
    // The step done closes, and the next to do opens, unless the reader opened others.
    this.open.delete(step.id);
    this.render();
    if (next) this.reveal(next.id);
    // The walkthrough just finished: the keyboard goes to what comes next, if the panel is in sight;
    // but never away from the map, or a form beside it, while the reader works there (a leg just
    // dragged, Bearings and TMA's last step): the status line, a live region, says it instead.
    const working = this.element.ownerDocument.activeElement?.tagName === "IFRAME";
    if (!next && !working) {
      const button = this.ahead.querySelector<HTMLElement>("button");
      if (button && (button.checkVisibility?.() ?? button.offsetParent !== null)) button.focus();
    }
  }

  /**
   * The step to do next brought into sight in a docked panel that scrolls (beneath Bearings, the
   * walkthroughs are compact: product owner, 25 Oct 2026): its words and button, from its heading
   * down as far as fits. Only the panel scrolls, never the page; narrow, nothing moves.
   */
  private revealing?: string;
  private reveal(stepId: string): void {
    this.revealing = stepId;
    const scroller = this.element.closest<HTMLElement>(".dock-panel");
    const body = this.list.querySelector<HTMLElement>(`#tour-${this.tour.id}-${stepId}`);
    const row = body?.closest<HTMLElement>("li");
    if (!scroller || !body || !row || scroller.scrollHeight <= scroller.clientHeight) return;
    const box = scroller.getBoundingClientRect();
    // The whole step if it fits; else its words down to its button, the heading and picture above them scrolled away.
    const from = row.getBoundingClientRect().top;
    const words = (body.querySelector("p") ?? body).getBoundingClientRect().top;
    const to = (body.querySelector("button") ?? body).getBoundingClientRect().bottom + 4;
    const top = to - from <= box.height ? from : words;
    if (to > box.bottom) scroller.scrollTop += Math.min(to - box.bottom, top - box.top);
    else if (top < box.top) scroller.scrollTop -= box.top - top;
  }

  /** What comes after this walkthrough: the next offered, quietly until its steps are all done; after the last, that all are. */
  private renderAhead(complete: boolean): void {
    const document = this.element.ownerDocument;
    const after = nextTour({ tours: TOURS }, this.tour.id);
    const button = (text: string, className: string, to: string) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className, textContent: text });
      b.onclick = () => {
        this.choose(to);
        // On to its first step's button, which opens its copy, as choosing it from the list would.
        this.list.querySelector<HTMLElement>(".tour-step.next .tour-body > button")?.focus();
      };
      return b;
    };
    if (!complete) {
      this.ahead.replaceChildren(...(after ? [button(`Skip to next walkthrough: ${after.title}`, "link tour-skip", after.id)] : []));
      return;
    }
    const said = Object.assign(document.createElement("p"), { className: "tour-complete" });
    said.append(Object.assign(document.createElement("strong"), { textContent: after ? `${this.tour.title}: done.` : `${ALL_DONE}.` }));
    said.append(after ? ` Every step is ticked. Go on to the next, or choose any walkthrough above.` : ` Every step of the last walkthrough is ticked.`);
    this.ahead.replaceChildren(
      said,
      after ? button(nextLabel(after), "tour-next", after.id) : button(`Start again: ${TOURS[0].title}`, "link tour-again", TOURS[0].id),
    );
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
    void loaded.then((svg) => {
      if (!svg || !into.isConnected) return;
      into.replaceChildren(into.ownerDocument.importNode(svg, true));
      // The step being brought into sight grew with its picture: brought into sight again.
      if (this.revealing && into.closest(`#tour-${this.tour.id}-${this.revealing}`)) this.reveal(this.revealing);
    });
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
    this.renderAhead(next === undefined);
  }
}
