// The walkthroughs' one source (tours.json) as each host shows it (CAP-25). VS Code's
// Get Started page reads package.json's contributes.walkthroughs, written from tours.json
// by scripts/walkthroughs.mjs; the playground's Walkthroughs panel reads tours.json itself.
// Both put a step's words together here, so the two cannot drift apart.

/** The context key a step's event sets in VS Code, which ticks the step off. */
export const contextKey = (event) => `debrief.walkthrough.${event}`;

/** Where the walkthroughs' pictures are, inside the extension. */
export const MEDIA = "media/walkthroughs";

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

/** A step's description on VS Code's Get Started page: Markdown, the button a link alone on its line. */
export function vscodeDescription(step) {
  const { text, where, keys, button } = stepParts(step, "vscode");
  return [text, where, `**Keyboard:** ${keys}`].filter(Boolean).map(plainForVSCode).concat(`[${button}](${commandLink(step.vscode.command, step.vscode.args)})`).join("\n\n");
}

/** contributes.walkthroughs, from tours.json. */
export function walkthroughsContribution(tours) {
  return tours.tours.map((tour) => ({
    id: tour.id,
    title: tour.title,
    description: tour.description,
    steps: tour.steps.map((step) => ({
      id: `${tour.id}.${step.id}`,
      title: step.title,
      description: vscodeDescription(step),
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
