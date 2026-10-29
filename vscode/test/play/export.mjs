// Exporting images in the playground (SUB-25, EXT-05, OUT-04), played as a reader would: the
// map exported as a PNG and as an SVG, each read back from the file saved for its image ID
// (PNG iTXt and XMP, SVG metadata); the footer in a corner, and not, the only difference
// between two images of one view; the SVG's labels where the map placed them; the light
// colours; the export logged in the plot's island and never a step; asked in VS Code's three
// steps, its finish offering Copy ID (no Show in folder: a download, §5). Then the plot changes,
// and the image is traced back by its file and by its ID typed from the footer: the plot is
// shown as it was at that step, read-only (a change refused, and said), until Go to latest.
// Down to 210 px, in a wider font, the panel never scrolls sideways.
import { resizeTo, showPanel } from "./dock.mjs";
import { choose, exportMap, findSource } from "./questions.mjs";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

/** Each text chunk of a PNG: keyword to text (iTXt, tEXt), its CRCs not checked here. */
function pngTexts(data) {
  assert.equal(data.subarray(0, 8).toString("latin1"), "\x89PNG\r\n\x1a\n");
  const texts = {};
  let at = 8;
  while (at < data.length) {
    const length = data.readUInt32BE(at);
    const kind = data.subarray(at + 4, at + 8).toString("latin1");
    const body = data.subarray(at + 8, at + 8 + length);
    if (kind === "tEXt" || kind === "iTXt") {
      const zero = body.indexOf(0);
      const keyword = body.subarray(0, zero).toString("latin1");
      if (kind === "tEXt") texts[keyword] = body.subarray(zero + 1).toString("latin1");
      else {
        const compressed = body[zero + 1] === 1;
        let rest = body.subarray(zero + 3);
        rest = rest.subarray(rest.indexOf(0) + 1); // language
        rest = rest.subarray(rest.indexOf(0) + 1); // translated keyword
        texts[keyword] = (compressed ? inflateSync(rest) : rest).toString("utf8");
      }
    }
    at += 12 + length;
    if (kind === "IEND") break;
  }
  return texts;
}

export async function playExport(page, shot) {
  const map = page.frameLocator(".frame-map");
  const historyRows = () => page.locator("#history li").count();
  const stepNow = async () => Number((await page.locator("#history li .detail", { hasText: "current" }).first().innerText()).match(/step (\d+)/)[1]);
  await page.selectOption("#plots", "serial-1");
  await showPanel(page, "outline");
  await page.locator('#outline li[data-id="track-blue-one"]').waitFor();
  await page.waitForTimeout(500);
  await showPanel(page, "export");
  const timings = [];
  const SIZES = { screen: "As on screen", slide: "Slide, 1600 × 900", a4_landscape: "A4 landscape" };
  const exportImage = async ({ format, preset, theme, footer }, during) => {
    const done = await exportMap(page, { size: SIZES[preset], footer, light: theme === "light", format }, during);
    timings.push(`${format} ${preset} ${theme}: ${done.ms} ms`);
    return done;
  };

  // A PNG for a slide, with its ID in a corner: in iTXt and in XMP, read back from the file.
  const rows = await historyRows();
  const step = await stepNow();
  const png = await exportImage({ format: "png", preset: "slide", theme: "current", footer: true });
  const texts = pngTexts(png.data);
  const id = texts["debrief:figure"];
  assert.match(id, /^DBF1-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{16}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]$/);
  const xmp = texts["XML:com.adobe.xmp"];
  assert.ok(xmp.includes(`<dc:identifier>${id}</dc:identifier>`), "the ID is in the PNG's XMP too");
  const short = xmp.match(/<debrief:short>(DBF-[^<]+)<\/debrief:short>/)[1];
  assert.equal(texts.Software, "Debrief");
  assert.ok(!xmp.includes("Serial 1") && !xmp.includes("serial-1"), "nothing but the ID and the software: no plot title or item");
  assert.equal(png.name, `Serial-1 ${short}.png`);
  assert.match(png.said, new RegExp(`Its ID, ${short}, is in its metadata and its corner\\. The plot's export log has it\\.`));
  // VS Code's finish: Copy ID, and no Show in folder, a download not being a file the page can show (§5).
  assert.deepEqual(await png.toast.locator("button").allInnerTexts(), ["Copy ID"]);
  const size = await page.evaluate(async (b64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, png.data.toString("base64"));
  assert.deepEqual(size, [1600, 900], "a slide is 1600 × 900");
  // The export is in the plot's island: no step, the history as it was.
  assert.equal(await historyRows(), rows, "an export is never a step");
  assert.equal(await stepNow(), step);
  await page.mouse.move(2, 2); // off the button, so the picture shows it as it is
  await shot("export-01-exported");

  // The same view without its footer: the only pixels that differ are the footer's, in a corner.
  const bare = await exportImage({ format: "png", preset: "slide", theme: "current", footer: false });
  assert.match(bare.said, /in its metadata \(no footer\)/);
  // The footer is on again for the next image; only the size and colours are remembered, last time's size first.
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("debrief.play.export"))), { preset: "slide", theme: "current" });
  await showPanel(page, "export");
  await page.locator("#export-image").click();
  assert.equal(await page.locator("#ask-title").innerText(), "Export image (1 of 3): size");
  assert.match(await page.locator("#ask-buttons button.primary").innerText(), /^Slide, 1600 × 900/);
  await choose(page, "Slide, 1600 × 900");
  const shows = page.locator("dialog.track-form[open]");
  assert.equal(await shows.getByRole("checkbox", { name: /^Image ID in a corner/ }).isChecked(), true, "the footer is on again");
  await shows.getByRole("button", { name: "Cancel" }).click();
  const differ = await page.evaluate(
    async ([a, b]) => {
      const pixels = async (b64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${b64}`;
        await image.decode();
        const canvas = Object.assign(document.createElement("canvas"), { width: image.naturalWidth, height: image.naturalHeight });
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      };
      const [x, y] = await Promise.all([pixels(a), pixels(b)]);
      let box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1, count: 0 };
      for (let i = 0; i < x.data.length; i += 4) {
        if (Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2]) < 24) continue;
        const p = i / 4;
        const px = p % x.width;
        const py = Math.floor(p / x.width);
        box = { x0: Math.min(box.x0, px), y0: Math.min(box.y0, py), x1: Math.max(box.x1, px), y1: Math.max(box.y1, py), count: box.count + 1 };
      }
      return { ...box, width: x.width, height: x.height };
    },
    [png.data.toString("base64"), bare.data.toString("base64")],
  );
  assert.ok(differ.count > 50, "the footer is drawn");
  // About 1.4% of the image's width high (22 pixels on a slide), so it reads when Word shows the image at half a page's width.
  assert.ok(differ.y1 - differ.y0 >= 14 && differ.y1 - differ.y0 < 60, `the footer is sized to the image: ${JSON.stringify(differ)}`);
  assert.ok(differ.x1 - differ.x0 < 560, `only the footer differs: ${JSON.stringify(differ)}`);
  const inCorner = (differ.y1 > differ.height - 90 || differ.y0 < 90) && (differ.x0 < 600 || differ.x1 > differ.width - 600);
  assert.ok(inCorner, `the footer is in a corner: ${JSON.stringify(differ)}`);

  // An SVG as on screen: its ID in its metadata; the footer's text; labels where the map put them.
  const svg = await exportImage({ format: "svg", preset: "screen", theme: "current", footer: true });
  const text = svg.data.toString("utf8");
  const svgId = text.match(/<dc:identifier>(DBF1-[^<]+)<\/dc:identifier>/)[1];
  assert.notEqual(svgId, id, "each export its own ID");
  assert.equal(svgId.slice(0, 30), id.slice(0, 30), "the same plot and revision");
  // Its footer is its own: the same plot and revision as the PNG's, its export's two symbols another's.
  const svgShort = text.match(/<debrief:short>(DBF-[^<]+)<\/debrief:short>/)[1];
  assert.equal(svgShort.slice(0, 17), short.slice(0, 17), "the same plot and revision in the footer");
  assert.ok(text.includes(`<text class="debrief-footer"`) && text.includes(`>${svgShort}</text>`), "the footer's ID");
  const labels = await map.locator(".leaflet-tooltip.track-label").evaluateAll((all) => {
    const origin = document.getElementById("map").getBoundingClientRect();
    return all
      .filter((l) => getComputedStyle(l).visibility !== "hidden")
      .map((l) => {
        const range = document.createRange();
        range.selectNodeContents(l);
        const r = range.getBoundingClientRect();
        return { text: l.textContent, x: r.left - origin.left };
      });
  });
  assert.ok(labels.length >= 2, "tracks are labelled on screen");
  for (const label of labels) {
    const drawn = [...text.matchAll(/<text x="([\d.-]+)" y="[\d.-]+"[^>]*>([^<]*)<\/text>/g)].find((m) => m[2] === label.text);
    assert.ok(drawn, `${label.text} is in the SVG`);
    assert.ok(Math.abs(Number(drawn[1]) - label.x) < 1, `${label.text} where the map placed it: ${drawn[1]} and ${label.x}`);
  }
  // Light, for print: mostly white.
  const light = await exportImage({ format: "png", preset: "a4_landscape", theme: "light", footer: true });
  const lightness = await page.evaluate(async (b64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = Object.assign(document.createElement("canvas"), { width: image.naturalWidth, height: image.naturalHeight });
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const d = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let white = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) white++;
    return { white: white / (d.length / 4), width: canvas.width, height: canvas.height };
  }, light.data.toString("base64"));
  assert.deepEqual([lightness.width, lightness.height], [1754, 1240], "A4 landscape at 150 dots an inch");
  assert.ok(lightness.white > 0.4, `light: mostly white (${Math.round(lightness.white * 100)}%)`);
  assert.equal(await historyRows(), rows, "four exports, still no step");

  // A track selected while an image is drawn stays selected once the map is put back: the
  // map's own putting back never undoes it.
  await exportImage({ format: "png", preset: "a4_landscape", theme: "current", footer: true }, async () => {
    await map.locator("#exporting").waitFor({ state: "visible", timeout: 30000 });
    await page.locator('#outline li[data-id="track-blue-one"]').click();
  });
  await map.locator("#exporting").waitFor({ state: "hidden", timeout: 30000 });
  await map.locator('path.leaflet-interactive[stroke-opacity="0.3"]').first().waitFor({ timeout: 10000 }); // the others dimmed: BLUE ONE is selected
  assert.equal(await historyRows(), rows, "five exports, still no step");

  // The analyst carries on: the plot changes, one step.
  await page.locator('#outline li[data-id="track-blue-one"]').click();
  await page.locator("#obar-colour").click();
  await page.locator(`.obar-swatch[aria-label="Teal"]`).click();
  await page.waitForFunction((n) => document.querySelectorAll("#history li").length === n + 1, rows, { timeout: 60000 });
  const latest = await stepNow();
  await map.locator(`path.leaflet-interactive[stroke="#00a3a3"]`).first().waitFor();
  assert.ok(latest > step, "a new step, current now");

  // Traced by its file: the plot as it was when exported, read-only.
  await findSource(page, { file: { name: png.name, mimeType: "image/png", buffer: png.data } });
  const banner = map.locator(".revision-banner");
  await banner.waitFor({ state: "visible", timeout: 60000 });
  assert.equal(await banner.locator(".revision-text").innerText(), `The plot at step ${step} of ${latest}, as when image ${short} was exported. Read-only.`);
  // Only its words are a status a screen reader reads out; its button, outside that, is a full target.
  assert.equal(await banner.getAttribute("role"), null);
  assert.equal(await banner.locator(".revision-text").getAttribute("role"), "status");
  const target = await banner.locator("button").boundingBox();
  assert.ok(target.height >= 24 && target.width >= 24, `Go to latest is at least 24 px: ${JSON.stringify(target)}`);
  assert.match(await page.locator("#plot-title").innerText(), /\(read-only\)$/);
  await page.locator(".toast", { hasText: `Serial 1 at step ${step}, as when image ${short} was exported. It is shown read-only.` }).getByRole("button", { name: "Go to latest" }).waitFor();
  assert.match(await page.locator("#history li.shown .detail").innerText(), new RegExp(`step ${step} .*shown read-only`));
  const teal = `path.leaflet-interactive[stroke="#00a3a3"]`; // BLUE ONE as the plot has it now; no other feature is teal
  await page.waitForFunction((s) => !document.querySelector(".frame-map").contentDocument.querySelector(s), teal, { timeout: 10000 }); // not teal: as it was
  await shot("export-02-traced");
  // Nothing can be changed here: Undo is disabled, saying why, and Ctrl+Z does nothing (PAR-08); the history is as it was.
  assert.equal(await page.locator("#undo").isDisabled(), true);
  assert.match(await page.locator("#undo").getAttribute("title"), /shown read-only, so it cannot be changed/);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);
  assert.equal(await historyRows(), rows + 1);
  // Exported again from here, the image names the same revision: its short ID starts as the first's.
  const again = await exportImage({ format: "png", preset: "screen", theme: "current", footer: true });
  assert.match(again.said, new RegExp(`Its ID, ${short.slice(0, 17)}[0-9A-HJKMNP-TV-Z]-[0-9A-HJKMNP-TV-Z]{2},`));
  // Go to latest: the plot as it is, to change.
  await banner.locator("button", { hasText: "Go to latest" }).click();
  await banner.waitFor({ state: "hidden" });
  assert.doesNotMatch(await page.locator("#plot-title").innerText(), /read-only/);
  await map.locator(teal).first().waitFor({ timeout: 10000 }); // teal: as it is now

  // Traced by its ID, typed from the footer as a reader might: lower case, spaces, O for 0.
  const asked = await findSource(page, { id: "DBF-PTET-KG8R-B9EM-68" });
  assert.equal(await asked.locator(".form-note").innerText(), "That image ID has a character wrong: check it against the image.");
  const typed = asked.locator("#track-form-text");
  await typed.fill(short.toLowerCase().replace(/-/g, " ").replace(/0/g, "o"));
  assert.equal(await asked.locator(".form-note").innerText(), "");
  await typed.press("Enter");
  await banner.waitFor({ state: "visible", timeout: 60000 });
  assert.match(await banner.innerText(), new RegExp(`step ${step} of ${latest}`));
  await banner.locator("button").focus();
  await page.keyboard.press("Enter"); // the keyboard's way to the latest
  await banner.waitFor({ state: "hidden" });

  // A file with no ID in it is said to have none.
  await findSource(page, { file: { name: "plain.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') } });
  await page.locator(".toast", { hasText: "carries no Debrief image ID" }).waitFor();

  // BLUE ONE back to its colour, for what is played after.
  await page.locator("#undo").click();
  await page.waitForFunction(() => document.querySelector("#history li .detail")?.textContent?.includes("undone"));

  // Narrow, and in a wider font: the panel never scrolls sideways.
  const sideways = () =>
    page.evaluate(() =>
      ["#body-export"].flatMap((s) => {
        const el = document.querySelector(s);
        return el && el.scrollWidth > el.clientWidth + 1 ? [`${s} ${el.scrollWidth}/${el.clientWidth}`] : [];
      }),
    );
  const widths = [];
  for (const wide of [false, true]) {
    const style = wide ? await page.addStyleTag({ content: "#side *, .menu-panel * { letter-spacing: 0.1em !important; font-size: 15px !important }" }) : undefined;
    for (const width of [390, 280, 210]) {
      await resizeTo(page, width, 800);
      await showPanel(page, "export");
      await page.waitForTimeout(300);
      const over = await sideways();
      widths.push(`${wide ? "wide font, " : ""}${width} px: ${over.length ? over.join(", ") : "fits"}`);
      assert.deepEqual(over, [], `${wide ? "in a wide font, " : ""}at ${width} px nothing scrolls sideways`);
      if (width === 390 && !wide) {
        await showPanel(page, "export");
        await shot("export-03-phone");
      }
    }
    await style?.evaluate((s) => s.remove());
  }
  console.log(`Export panel (sideways scroll): ${widths.join("; ")}.`);
  console.log(`Exports in the playground, from Export to the file: ${timings.join("; ")}.`);
  await resizeTo(page, 1400, 820);
}
