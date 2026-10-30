/**
 * What the panel's Bearings says while Bearings is popped out (product owner, 28 Oct 2026), the
 * same in both hosts: where it went, Bring back, and Focus that window. VS Code draws it as a page
 * of its own (src/panels/bearingsplaceholder.ts); the playground in its Bearings panel (play/host.ts).
 */
export interface PoppedOutSaid {
  status: string;
  bringBack: { label: string; title: string };
  focus: { label: string; title: string };
}

/** The placeholder's words: in a window of its own, or (VS Code only) an editor tab. */
export function poppedOutSaid(inWindow: boolean): PoppedOutSaid {
  return {
    status: `Bearings is open in ${inWindow ? "its own window" : "an editor tab of its own"}.`,
    bringBack: { label: "Bring back", title: "Close the popped-out Bearings and show it here again" },
    focus: { label: inWindow ? "Focus that window" : "Show that tab", title: "Bring the popped-out Bearings to the front" },
  };
}
