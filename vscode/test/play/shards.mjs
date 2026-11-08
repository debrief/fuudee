// The playground's plays, found and shared out into parts (review of 7 Nov 2026, finding 5).
//
// Each module in test/play may export `plays`, a list of descriptors:
//   { name, cost, start, play }       a play that starts on a fresh page of its own, or
//   { name, cost, after, play }       one that carries on, on the same page, after the play named;
//   site: true                        only with a built site (play.mjs's second argument).
// start is "blank" (a fresh page, nothing loaded), "ready" (the playground loaded, Python ready) or
// "arranged" (ready, and the panels arranged as play.mjs's arrange() leaves them). cost is about the
// seconds it takes in CI, starting included. play(ctx) is given what play.mjs's ctx holds.
//
// A play that starts and those after it are a unit, played in that order on one page, never split.
// Units are shared out into parts by cost, the longest first, each to the part with least so far, and
// there are as many parts as keep each under BUDGET seconds (or, if one unit is longer, under it).
// So a new play needs only its descriptor: CI's matrix is this file's --matrix.
//
//   node test/play/shards.mjs --matrix    the parts as CI's matrix, JSON
//   node test/play/shards.mjs             the parts, their plays and costs
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The seconds of play a part aims at, under CI's install and build (about a minute). */
export const BUDGET = 240;
const STARTS = ["blank", "ready", "arranged"];

/** Every module's plays, in file order. */
export async function discover(folder = import.meta.dirname) {
  const files = readdirSync(folder)
    .filter((f) => f.endsWith(".mjs") && f !== "play.mjs" && f !== "shards.mjs")
    .sort();
  const plays = [];
  for (const file of files) {
    const module = await import(pathToFileURL(path.join(folder, file)).href);
    for (const play of module.plays ?? []) plays.push({ ...play, file });
  }
  return plays;
}

/** The plays as units: each play that starts, then those after it, in order. Throws on a descriptor that cannot be placed. */
export function unitsOf(plays) {
  const problems = [];
  const byName = new Map();
  for (const p of plays) {
    const where = `${p.file}: play "${p.name}"`;
    if (typeof p.name !== "string" || !/^[a-z][a-z0-9-]*$/.test(p.name)) problems.push(`${where}: a name is lower case, digits and hyphens`);
    if (byName.has(p.name)) problems.push(`${where}: the name is ${byName.get(p.name).file}'s too`);
    byName.set(p.name, p);
    if (!(Number.isFinite(p.cost) && p.cost > 0)) problems.push(`${where}: cost is its seconds in CI, more than 0`);
    if (typeof p.play !== "function") problems.push(`${where}: play is a function of ctx`);
    if ((p.start === undefined) === (p.after === undefined)) problems.push(`${where}: give start or after, not both or neither`);
    if (p.start !== undefined && !STARTS.includes(p.start)) problems.push(`${where}: start is one of ${STARTS.join(", ")}`);
  }
  const next = new Map();
  for (const p of plays.filter((x) => x.after !== undefined)) {
    if (!byName.has(p.after)) problems.push(`${p.file}: play "${p.name}" is after "${p.after}", which no module has`);
    else if (next.has(p.after)) problems.push(`${p.file}: plays "${next.get(p.after).name}" and "${p.name}" are both after "${p.after}"`);
    else next.set(p.after, p);
  }
  if (problems.length) throw new Error(`The playground's plays cannot be placed:\n  ${problems.join("\n  ")}`);
  const units = plays
    .filter((p) => p.start !== undefined)
    .map((first) => {
      const chain = [first];
      for (let p = next.get(first.name); p; p = next.get(p.name)) chain.push(p);
      return { name: first.name, start: first.start, site: chain.some((p) => p.site), plays: chain, cost: chain.reduce((sum, p) => sum + p.cost, 0) };
    });
  const placed = units.reduce((sum, u) => sum + u.plays.length, 0);
  if (placed !== plays.length) throw new Error(`The playground's plays cannot be placed: ${plays.length - placed} follow one another in a ring, with no start`);
  return units.sort((a, b) => a.name.localeCompare(b.name));
}

/** The units in n parts, by cost: the longest first, each to the part with least so far. */
export function shareOut(units, n) {
  const parts = Array.from({ length: n }, () => ({ cost: 0, units: [] }));
  for (const unit of [...units].sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name))) {
    const least = parts.reduce((best, part) => (part.cost < best.cost ? part : best));
    least.units.push(unit);
    least.cost += unit.cost;
  }
  for (const part of parts) part.units.sort((a, b) => a.name.localeCompare(b.name));
  return parts;
}

/** As few parts as keep each within BUDGET, or within the longest unit if that is longer. */
export function partsFor(units) {
  const most = Math.max(BUDGET, ...units.map((u) => u.cost));
  for (let n = 1; ; n++) if (shareOut(units, n).every((p) => p.cost <= most)) return n;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const units = unitsOf(await discover());
  const n = partsFor(units);
  const parts = shareOut(units, n);
  if (process.argv[2] === "--matrix") {
    const include = parts.map((p, i) => ({ part: i + 1, of: n, plays: p.units.map((u) => u.name).join(", ") }));
    console.log(JSON.stringify({ include }));
  } else {
    parts.forEach((p, i) => {
      console.log(`part ${i + 1} of ${n}, about ${p.cost} s:`);
      for (const u of p.units) console.log(`  ${u.name} (${u.start}${u.site ? ", with the site" : ""}, ${u.cost} s): ${u.plays.map((x) => x.name).join(", ")}`);
    });
  }
}
