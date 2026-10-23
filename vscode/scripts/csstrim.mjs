// Trims Dockview's stylesheet for the playground (scripts/build-play.mjs).
/**
 * A stylesheet less the rules only for Dockview's own themes (.dockview-theme-*). Its top-level rules
 * are found by their braces, skipping comments and quoted strings, where a brace is only text; a rule
 * is left out only if every one of its selectors is a Dockview theme's. Tested in test/unit/csstrim.test.ts.
 */
export function withoutThemes(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
    } else if (c === '"' || c === "'") {
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === "\\") i++;
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      rules.push(css.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (depth !== 0) throw new Error("dockview.css: its braces do not balance; not trimmed");
  const prelude = (rule) => {
    const bare = rule.replace(/\/\*[\s\S]*?\*\//g, "");
    return bare.slice(0, bare.indexOf("{")).trim();
  };
  const themed = (rule) => !prelude(rule).startsWith("@") && prelude(rule).split(",").every((selector) => /^\.dockview-theme-[\w-]+(\s|$|[.:[>~+])/.test(selector.trim()));
  return rules.filter((rule) => !themed(rule)).join("") + css.slice(start);
}

