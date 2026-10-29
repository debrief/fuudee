// package.json's contributes.commands and contributes.menus as text: one entry to a line, as they
// have always been written, so the file stays easy to read and to compare.

/** An object on one line: {"key": value, ...}. */
function line(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return `{${Object.entries(value)
      .map(([k, v]) => `${JSON.stringify(k)}: ${line(v)}`)
      .join(", ")}}`;
  }
  return JSON.stringify(value);
}

const list = (entries, indent) => entries.map((e) => `${indent}${line(e)}`).join(",\n");

/** The text of package.json with its commands and menus replaced by these. */
export function withContribution(text, { commands, menus }) {
  const start = text.indexOf('    "commands": [');
  const end = text.indexOf('    "keybindings": [');
  if (start < 0 || end < start) throw new Error('package.json has no "commands" followed, after "menus", by "keybindings"');
  const menuBlocks = Object.entries(menus)
    .map(([id, entries]) => `      ${JSON.stringify(id)}: [\n${list(entries, "        ")}\n      ]`)
    .join(",\n");
  const block = `    "commands": [\n${list(commands, "      ")}\n    ],\n    "menus": {\n${menuBlocks}\n    },\n`;
  return text.slice(0, start) + block + text.slice(end);
}
