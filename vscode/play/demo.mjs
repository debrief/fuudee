// The web demo (DEP-06, DEP-07): the playground's page, every panel and the walkthroughs,
// served full screen at /demo/ beside the playground at /play/, whose files it uses (the
// <base> below). It opens the fixed sample serials; a file the reader chooses is read in the
// browser only, under Pyodide, never sent anywhere or stored (product owner, 17 Oct 2026).

/** The demo's page, made from the playground's index.html. */
export function demoPage(index, base = "../play/") {
  if (!index.includes('<meta charset="utf-8">') || !/<title>[^<]*<\/title>/.test(index)) throw new Error("index.html does not start as the web demo expects");
  return index
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<base href="${base}">`)
    .replace(/<title>[^<]*<\/title>/, "<title>Debrief web demo</title>");
}
