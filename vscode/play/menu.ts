/**
 * The playground's context menus: a track's in the Outline (right-click, press and hold, Shift+F10)
 * and a docked panel's (its tab's menu, or its group's ⋯; dock.ts). One at a time. A list of buttons
 * with the menu roles; ↑ and ↓ move through it, Home and End to its ends, Enter chooses, Escape and
 * Tab close it, the keyboard going back where it came from. A press outside, or a click into a frame
 * (the map), closes it.
 */
export interface MenuItem {
  label: string;
  act: () => void;
  /** Why it cannot act: shown so (aria-disabled, the reason its title), still reachable and chosen to say why. */
  disabled?: string;
}

let shown: { element: HTMLElement; from: HTMLElement | undefined } | undefined;

/** Close the menu open, if any; the keyboard back where it came from, if asked. */
export function closeMenu(focus = true): void {
  const was = shown;
  shown = undefined;
  was?.element.remove();
  if (was && focus && was.from?.isConnected) was.from.focus();
}

/** Whether a menu is open. */
export const menuOpen = (): boolean => !!shown;

/** Open a menu at a point (within the window), named for screen readers, the keyboard on its first item. */
export function openMenu(items: MenuItem[], options: { label: string; x: number; y: number; from?: HTMLElement; className?: string }): HTMLElement {
  closeMenu(false);
  const element = document.createElement("div");
  element.className = `context-menu ${options.className ?? ""}`.trim();
  element.setAttribute("role", "menu");
  element.setAttribute("aria-label", options.label);
  const buttons = items.map(({ label, act, disabled }) => {
    const button = Object.assign(document.createElement("button"), { textContent: label, type: "button" });
    button.setAttribute("role", "menuitem");
    if (disabled) {
      button.setAttribute("aria-disabled", "true");
      button.title = disabled;
    }
    button.tabIndex = -1;
    button.onclick = () => {
      closeMenu(false);
      act();
    };
    return button;
  });
  element.append(...buttons);
  element.onkeydown = (e) => {
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      buttons[(at + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length].focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      buttons[e.key === "Home" ? 0 : buttons.length - 1].focus();
    }
  };
  document.body.append(element);
  const box = element.getBoundingClientRect();
  element.style.left = `${Math.max(0, Math.min(options.x, innerWidth - box.width - 4))}px`;
  element.style.top = `${Math.max(0, Math.min(options.y, innerHeight - box.height - 4))}px`;
  shown = { element, from: options.from };
  buttons[0]?.focus();
  return element;
}

// A press outside the menu closes it; so does a click into a frame (the map), which reaches no
// listener here: the page loses the focus to it.
// (Not in a unit test's node, which has no page.)
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (e) => void (shown && !shown.element.contains(e.target as Node) && closeMenu(false)), true);
  addEventListener("blur", () => setTimeout(() => shown && document.activeElement instanceof HTMLIFrameElement && closeMenu(false)));
}
