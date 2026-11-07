/**
 * A view popped out of its panel into a window of its own, and brought back (product owner, 28 Oct
 * 2026; review of 7 Nov 2026, finding 7): the lifecycle both hosts share, free of VS Code and of the
 * DOM. One live place at a time: popped out, the panel shows a placeholder; popped out again, the
 * window comes to the front; the window closed by any means (its close box, Bring back, VS Code's
 * tab closed) brings the view back to the panel.
 *
 * VS Code's PoppableView (src/panels/poppableview.ts) runs it with an editor moved into a window of
 * its own; the playground (play/host.ts) with a browser window.
 */

/** How a pop out ended: in a window of its own, or (VS Code only) left an editor tab, and why. */
export interface PoppedOut {
  where: "window" | "tab";
  reason?: string;
}

/** The window a view is popped out into. */
export interface PoppedWindow {
  /** Brought to the front, the keyboard in it. */
  focus(): void;
  /** Closed (Bring back). Closed any other way, the host says so: PopOut.closed. */
  close(): void;
}

/** What a host does for a view that pops out. */
export interface PopOutHost<W extends PoppedWindow> {
  /** The view opened in a window of its own, or undefined if it could not be (the host says why). */
  open(): W | undefined;
  /** Live there now: the panel's placeholder shown, the context key set. */
  poppedOut(window: W): void;
  /** Where it ended up once placed (VS Code: moved into a new window, or left a tab). */
  placed(window: W): PoppedOut | Promise<PoppedOut>;
  /** Once placed, PopOut.popped says where: the placeholder may say it too. */
  settled?(window: W, popped: PoppedOut): void;
  /** Live in the panel again, the window gone. */
  cameBack(window: W): void;
}

export class PopOut<W extends PoppedWindow> {
  private live?: W;
  /** How the last pop out ended, for tests and agents. */
  popped?: PoppedOut;

  constructor(private readonly host: PopOutHost<W>) {}

  /** The window, while popped out. */
  get window(): W | undefined {
    return this.live;
  }

  /** Popped out: opened in a window of its own. Popped out already: that window to the front. */
  async popOut(): Promise<PoppedOut | undefined> {
    if (this.live) {
      this.live.focus();
      return this.popped ?? { where: "tab" };
    }
    const window = this.host.open();
    if (!window) return undefined;
    this.live = window;
    this.host.poppedOut(window);
    const popped = await this.host.placed(window);
    this.popped = popped;
    this.host.settled?.(window, popped);
    return popped;
  }

  /** The window closed, by any means: the view back in the panel. A window no longer live is ignored. */
  closed(window: W): void {
    if (this.live !== window) return;
    this.live = undefined;
    this.host.cameBack(window);
  }

  /** Bring back: the window closed, the view in the panel again. */
  bringBack(): void {
    const window = this.live;
    if (!window) return;
    window.close();
    this.closed(window);
  }

  /** The popped-out window brought to the front. */
  focusWindow(): void {
    this.live?.focus();
  }
}
