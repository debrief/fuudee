// The playground's and the web demo's Content-Security-Policy (product owner, 17 Oct 2026), in a
// meta element at the top of every page (index.html, each frame, geodesic.html); a unit test
// holds every page to this text. The page fetches only its own site, and Pyodide from jsDelivr,
// which Python's worker loads (the worker is not under a meta element's policy). jsDelivr's
// files are taken as they come, with no integrity check: a risk the product owner accepts.
// 'wasm-unsafe-eval' lets Pyodide compile WebAssembly; inline style attributes are the map's.
export const CSP = [
  "default-src 'self'",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "object-src 'none'",
  "form-action 'none'",
  // 'self', not 'none': the web demo's <base> points at the playground's files beside it.
  "base-uri 'self'",
].join("; ");

/** The meta element, as each page has it. */
export const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;

/** The pages that carry it. */
export const CSP_PAGES = ["index.html", "frame-map.html", "frame-form.html", "frame-annotation.html", "frame-results.html", "geodesic.html"];
