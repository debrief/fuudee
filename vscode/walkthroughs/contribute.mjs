// The walkthroughs' one source (tours.json) as each host shows it (CAP-25). VS Code's
// Get Started page reads package.json's contributes.walkthroughs, written from tours.json
// by scripts/walkthroughs.mjs; the playground's Walkthroughs panel reads tours.json itself.
// Both put a step's words together here, so the two cannot drift apart.

/** The context key a step's event sets in VS Code, which ticks the step off. */
export const contextKey = (event) => `debrief.walkthrough.${event}`;

/** Where the walkthroughs' pictures are, inside the extension. */
export const MEDIA = "media/walkthroughs";

/**
 * workbench.action.openWalkthrough's toSide: the Get Started page opens in a column beside the
 * editors, so the map a step opens (in the first column) sits beside the walkthrough, not on top of it.
 */
export const BESIDE = true;

/** A command link, as VS Code's walkthroughs show a button: its arguments JSON, URL-encoded. */
export function commandLink(command, args) {
  return args?.length ? `command:${command}?${encodeURIComponent(JSON.stringify(args))}` : `command:${command}`;
}

/** The parts of a step a host shows, in order: what to do, where, the keyboard, and the button. */
export function stepParts(step, host) {
  const own = step[host] ?? {};
  return { text: step.text, where: own.where, keys: own.keys ?? step.keys, button: own.button };
}

/**
 * The Markdown VS Code's Get Started page draws: bold and links, but neither `code` nor *italics*,
 * which it would show with their marks; those are written plainly there.
 */
export const plainForVSCode = (text) => text.replace(/`([^`]+)`/g, "$1").replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1$2");

/** The command that opens a walkthrough's copy: its first step's button. */
export const OPEN = "debrief.walkthrough.open";

/**
 * A step's button on VS Code's Get Started page. Every step after the first runs through
 * debrief.walkthrough.do, which opens the walkthrough's copy first if another plot is open, so
 * a button never acts on the analyst's own plot (panel review, 17 Oct 2026).
 */
export function vscodeButton(step, tour) {
  const { command, args = [] } = step.vscode;
  return command === OPEN ? commandLink(command, args) : commandLink("debrief.walkthrough.do", [tour, command, ...args]);
}

/** A step's description on VS Code's Get Started page: Markdown, the button a link alone on its line. */
export function vscodeDescription(step, tour) {
  const { text, where, keys, button } = stepParts(step, "vscode");
  return [text, where, `**Keyboard:** ${keys}`].filter(Boolean).map(plainForVSCode).concat(`[${button}](${vscodeButton(step, tour)})`).join("\n\n");
}

/**
 * A step's argument that names the walkthrough's TMA solution (Bearings and TMA): its id is not
 * known until the analyst makes it, so each host puts in the latest solution of the copy when
 * the button is pressed (latestSolution), and refuses, saying why, while there is none.
 */
export const SOLUTION = "$solution";

/** The plot's latest TMA solution, as its features are listed: the last track tagged as one. */
export function latestSolution(features) {
  return [...(features ?? [])].reverse().find((f) => f?.properties?.kind === "track" && f.properties.tma)?.id;
}

/** A step's arguments with SOLUTION put as the solution's id: undefined if one is asked for and there is none. */
export function withSolution(args, features) {
  if (!JSON.stringify(args ?? []).includes(SOLUTION)) return args;
  const id = latestSolution(features);
  if (!id) return undefined;
  const put = (value) => (value === SOLUTION ? id : Array.isArray(value) ? value.map(put) : value);
  return put(args);
}

/**
 * A drag of a TMA solution (Bearings and TMA), the same in both hosts: one of its legs, once it is
 * split into legs (This leg, or a period), is the last step's (product owner, 25 Oct 2026: the
 * step ends on a leg dragged, not on the split); otherwise a move is the fourth step's (its start
 * put at RED ONE's range) and a shear the fifth's (the first leg fitted about that start; product
 * owner, 25 Oct 2026, "fit properly"). A rotation or a stretch of the whole solution is no step's.
 * False for a track that is not a solution (legs undefined); undefined for any other change.
 */
export function tmaDragEvent(legs, action, part) {
  if (legs === undefined) return false;
  if (!["move", "rotate", "shear", "stretch"].includes(String(action))) return undefined;
  if (legs > 1 && part) return "legDragged";
  return { move: "solutionMoved", shear: "solutionSheared" }[String(action)];
}

/** What a button says when its step needs the solution and there is none yet. */
export const NO_SOLUTION = "Make the solution first: Make a first guess, this walkthrough's third step.";

/**
 * The walkthrough after this one, in tours.json's order; none after the last. Both hosts offer
 * it when a walkthrough ends (product owner, 23 Oct 2026): the next is never left to be found
 * in a list.
 */
export function nextTour(tours, id) {
  const at = tours.tours.findIndex((t) => t.id === id);
  return at >= 0 ? tours.tours[at + 1] : undefined;
}

/** The words that offer the next walkthrough, the same in both hosts. */
export const nextLabel = (tour) => `Next walkthrough: ${tour.title}`;
export const ALL_DONE = "All walkthroughs done";
/** What both hosts say the moment a walkthrough's steps are all ticked: it is done, or, after the last, that all are. */
export const doneLabel = (tour, after) => (after ? `${tour.title}: done.` : `${ALL_DONE}.`);

/** The extension's id, as VS Code names its walkthroughs: publisher.name. */
export const EXTENSION = "debrief.debrief";

/**
 * What a walkthrough's last step adds on VS Code's Get Started page: a link that opens the next
 * walkthrough there, alone on its line so the page draws it as a button; after the last, that all are done.
 */
export function vscodeNext(tours, tour, extension = EXTENSION) {
  const next = nextTour(tours, tour.id);
  return next
    ? `[${nextLabel(next)}](${commandLink("workbench.action.openWalkthrough", [`${extension}#${next.id}`, BESIDE])})`
    : `**${ALL_DONE}** once this step is done: this is the last walkthrough.`;
}

/** contributes.walkthroughs, from tours.json. */
export function walkthroughsContribution(tours, extension = EXTENSION) {
  return tours.tours.map((tour) => ({
    id: tour.id,
    title: tour.title,
    description: tour.description,
    steps: tour.steps.map((step, index) => ({
      id: `${tour.id}.${step.id}`,
      title: step.title,
      description: index === tour.steps.length - 1 ? `${vscodeDescription(step, tour.id)}\n\n${vscodeNext(tours, tour, extension)}` : vscodeDescription(step, tour.id),
      media: { svg: `${MEDIA}/${step.media}`, altText: step.alt },
      completionEvents: [`onContext:${contextKey(step.event)}`],
    })),
  }));
}

/**
 * package.json's text with its walkthroughs replaced by those given: only that part of the
 * file changes, so the rest keeps its hand-kept layout. Placed before "commands" the first time.
 */
export function withWalkthroughs(text, walkthroughs) {
  const block = JSON.stringify(walkthroughs, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : `    ${line}`))
    .join("\n");
  const entry = `    "walkthroughs": ${block},\n`;
  const start = text.indexOf('    "walkthroughs": [');
  if (start < 0) {
    const at = text.indexOf('    "commands": [');
    if (at < 0) throw new Error('package.json has no "commands" to put the walkthroughs before');
    return text.slice(0, at) + entry + text.slice(at);
  }
  const end = text.indexOf("\n    ],\n", start);
  if (end < 0) throw new Error("package.json's walkthroughs do not end where expected");
  return text.slice(0, start) + entry + text.slice(end + "\n    ],\n".length);
}
