// A synthetic exercise log at the track-heavy volume profile (NFR-06: the legacy sample's
// 12,000 narrative entries scaled by five), for the Timeline's scale check. Invented: two
// tracks and five sources logging every few seconds over a day; no real data.
const SOURCES = ['"BLUE ONE"', '"RED ONE"', "CONTROL", '"BLUE TWO"', '"SEA KING"'];
const TYPES = ["Sonar", "CSD", "Comms", "Weapons", "Log"];
const WORDS = ["contact", "bearing", "drawing left", "drawing right", "steady", "classified", "lost", "regained", "range", "closing", "opening", "course", "speed", "depth"];

const pad = (n, w = 2) => String(n).padStart(w, "0");
/** The REP time of a second into 15 Jun 2023. */
function when(second) {
  const day = 15 + Math.floor(second / 86400);
  const s = second % 86400;
  return `2306${pad(day)} ${pad(Math.floor(s / 3600))}${pad(Math.floor((s % 3600) / 60))}${pad(s % 60)}`;
}

/** count narrative lines, and a fix a minute for BLUE ONE and RED ONE, spread over 24 hours. */
export function narrativeLog(count = 60_000) {
  const lines = [";; Synthetic exercise log for the Timeline's scale check (NFR-06). Invented."];
  for (let minute = 0; minute <= 24 * 60; minute += 10) {
    const t = when(minute * 60);
    const lon = (minute / 1440) * 0.8;
    lines.push(`${t} "BLUE ONE" @A 37 00 00.00 N 075 ${pad(Math.floor(lon * 60))} 00.00 W 090.0 10.0 0`);
    lines.push(`${t} "RED ONE" @C 36 55 00.00 N 075 ${pad(Math.floor(lon * 60))} 00.00 W 090.0 6.0 20`);
  }
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < count; i++) {
    const second = Math.floor((i * 86400) / count);
    const words = Array.from({ length: 4 + Math.floor(random() * 14) }, () => WORDS[Math.floor(random() * WORDS.length)]).join(" ");
    const text = `${i % 997 === 0 ? "Marker " : ""}Entry ${i}: ${words}, ${pad(Math.floor(random() * 360), 3)}.`;
    lines.push(`;NARRATIVE2: ${when(second)} ${SOURCES[i % 5]} ${TYPES[(i >> 1) % 5]} ${text}`);
  }
  return lines.join("\n") + "\n";
}
