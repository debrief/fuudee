/**
 * Reading file catalogues in the extension (SUB-15, SUB-17, SUB-23).
 *
 * Read-only: every write goes through the Python service, where domain logic
 * lives (PRN-03). Items are found by walking the catalogue's folders and
 * trusting each item's parent link, never the catalogue's child links, as
 * debrief-stac does. Every file is validated on reading.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadConfig, type ConfigError } from "@debrief/config";
import {
  parseDocument,
  type DebriefFeatureCollection,
  type KnownStore,
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
}

export function knownStores(configFile?: string): { stores: KnownStore[]; problem?: string } {
  try {
    return { stores: configFile ? loadConfig(configFile).stores : loadConfig().stores };
  } catch (error) {
    return { stores: [], problem: (error as ConfigError).message };
  }
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
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
      const raw = readJson(itemFile) as { links?: { rel?: string; href?: string }[] };
      const parented = (raw.links ?? []).some((l) => l.rel === "parent" && l.href === `../${CATALOGUE_FILE}`);
      if (!parented) continue;
      const item = parseDocument("stac_item", readFileSync(itemFile, "utf8"));
      const p = item.properties;
      plots.push({
        id: item.id,
        title: p.title ?? item.id,
        start: p.start_datetime ?? p.datetime ?? undefined,
        end: p.end_datetime ?? p.datetime ?? undefined,
      });
    }
    return { store, title: catalogue.title ?? store.title, plots };
  } catch (error) {
    return { store, title: store.title, plots: [], problem: (error as Error).message };
  }
}

function assetPath(store: KnownStore, item: StacItem, asset: { href: string }): string {
  return path.join(store.location, item.id, asset.href.replace(/^\.\//, ""));
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
  return { store, item, plot, files };
}
