/**
 * Reading file catalogues in the extension (SUB-15, SUB-17, SUB-23).
 *
 * Read-only: every write goes through the Python service, where domain logic
 * lives (PRN-03). Items are found by walking the catalogue's folders and
 * trusting each item's parent link, never the catalogue's child links, as
 * debrief-stac does. Every file is validated on reading.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadConfig, type ConfigError } from "@debrief/config";
import {
  parseDocument,
  type DebriefFeatureCollection,
  type KnownStore,
  type Presentation,
  type StacItem,
} from "@debrief/schemas";

export const CATALOGUE_FILE = "catalog.json";

export interface PlotSummary {
  id: string;
  title: string;
  start?: string;
  end?: string;
}

export interface CatalogueView {
  store: KnownStore;
  title: string;
  plots: PlotSummary[];
  problem?: string;
}

export interface OpenedPlot {
  store: KnownStore;
  item: StacItem;
  plot: DebriefFeatureCollection;
  /** Assets other than the plot itself: sources, supporting files and payloads. */
  files: { key: string; title: string; kind: string; href: string }[];
  /** Where the plot's history stood when it was read, from the tool service (SUB-28). */
  base?: { current: number; plot_hash: string };
  /** The analyst's colours and hidden features (SUB-22), and the hash to pass back when changing them. */
  presentation: Presentation;
  presentationHash: string;
}

/** The file that changes whenever anyone changes the plot's history. */
export function headFile(store: KnownStore, itemId: string): string {
  return path.join(store.location, itemId, "history", "head.json");
}

/** The plot's presentation (SUB-22), changed by anyone sharing the catalogue. */
export function presentationFile(store: KnownStore, itemId: string): string {
  return path.join(store.location, itemId, "presentation.json");
}

const presentationHashOf = (text: string | undefined) =>
  text === undefined ? "" : `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

/** The hash of the presentation on disk now ("" if there is none), as the service gives it. */
export function presentationHashOnDisk(store: KnownStore, itemId: string): string | undefined {
  try {
    return presentationHashOf(readFileSync(presentationFile(store, itemId), "utf8"));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "" : undefined;
  }
}

/** Where the plot's history stands on disk now, or undefined if it cannot be read. */
export function headOnDisk(store: KnownStore, itemId: string): { current: number; plot_hash: string } | undefined {
  try {
    const head = parseDocument("history_head", readFileSync(headFile(store, itemId), "utf8"));
    return { current: head.current, plot_hash: head.plot_hash };
  } catch {
    return undefined;
  }
}

export function knownStores(configFile?: string): { stores: KnownStore[]; problem?: string } {
  try {
    return { stores: configFile ? loadConfig(configFile).stores : loadConfig().stores };
  } catch (error) {
    return { stores: [], problem: (error as ConfigError).message };
  }
}

/** Item summaries by file, kept until the file changes, so refreshing is cheap. */
const summaries = new Map<string, { mtimeMs: number; size: number; summary?: PlotSummary }>();

function summarise(itemFile: string): PlotSummary | undefined {
  const { mtimeMs, size } = statSync(itemFile);
  const cached = summaries.get(itemFile);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.summary;
  const text = readFileSync(itemFile, "utf8");
  const raw = JSON.parse(text) as { links?: { rel?: string; href?: string }[] };
  const parented = (raw.links ?? []).some((l) => l.rel === "parent" && l.href === `../${CATALOGUE_FILE}`);
  let summary: PlotSummary | undefined;
  if (parented) {
    const item = parseDocument("stac_item", text);
    const p = item.properties;
    summary = {
      id: item.id,
      title: p.title ?? item.id,
      start: p.start_datetime ?? p.datetime ?? undefined,
      end: p.end_datetime ?? p.datetime ?? undefined,
    };
  }
  summaries.set(itemFile, { mtimeMs, size, summary });
  return summary;
}

export function readCatalogue(store: KnownStore): CatalogueView {
  const root = store.location;
  if (!existsSync(path.join(root, CATALOGUE_FILE))) {
    return { store, title: store.title, plots: [], problem: `No catalogue found at ${root}` };
  }
  try {
    const catalogue = parseDocument("stac_catalog", readFileSync(path.join(root, CATALOGUE_FILE), "utf8"));
    const plots: PlotSummary[] = [];
    for (const name of readdirSync(root).sort()) {
      const itemFile = path.join(root, name, `${name}.json`);
      if (!statSync(path.join(root, name)).isDirectory() || !existsSync(itemFile)) continue;
      const summary = summarise(itemFile);
      if (summary) plots.push(summary);
    }
    return { store, title: catalogue.title ?? store.title, plots };
  } catch (error) {
    return { store, title: store.title, plots: [], problem: (error as Error).message };
  }
}

/** An asset's file, which must lie inside its item's folder. */
function assetPath(store: KnownStore, item: StacItem, asset: { href: string }): string {
  const folder = path.resolve(store.location, item.id);
  const file = path.resolve(folder, asset.href);
  if (!file.startsWith(folder + path.sep)) throw new Error(`${item.id} refers to a file outside its folder: ${asset.href}`);
  return file;
}

export function openPlot(store: KnownStore, itemId: string): OpenedPlot {
  const item = parseDocument(
    "stac_item",
    readFileSync(path.join(store.location, itemId, `${itemId}.json`), "utf8"),
  );
  const plotAsset = item.assets.plot;
  if (!plotAsset) throw new Error(`${itemId} has no plot`);
  const plot = parseDocument("plot", readFileSync(assetPath(store, item, plotAsset), "utf8"));
  const files = Object.entries(item.assets)
    .filter(([key]) => key !== "plot")
    .map(([key, asset]) => ({
      key,
      title: asset.title ?? path.basename(asset.href),
      kind: String(asset["debrief:asset_kind"] ?? "file"),
      href: assetPath(store, item, asset),
    }));
  const presentationPath = presentationFile(store, itemId);
  const presentationText = existsSync(presentationPath) ? readFileSync(presentationPath, "utf8") : undefined;
  const presentation = presentationText
    ? parseDocument("presentation", presentationText)
    : { schema_version: plot.schema_version, features: [] };
  const presentationHash = presentationHashOf(presentationText);
  return { store, item, plot, files: files.filter((f) => f.key !== "presentation"), presentation, presentationHash };
}
