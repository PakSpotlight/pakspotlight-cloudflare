/**
 * Archive data access.
 *
 * Read-only against the same public Supabase endpoints the website uses, with the same
 * 3-minute cache window. Nothing here writes to Supabase, so no auth is involved.
 *
 * The app deliberately does not use @supabase/supabase-js: the viewer only needs two REST calls
 * and a JSON file, and skipping the client keeps the native dependency surface small.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Drama, mapRow, RawRow } from "./dramas";

const SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
const SUPABASE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";

/** Public site origin — used for deep links, share URLs and the update manifest. */
export const SITE_ORIGIN = "https://classictvpakistan.com";

const CACHE_KEY = "ctv.catalog";
const CACHE_TIME_KEY = "ctv.catalog.time";
const CACHE_TTL_MS = 3 * 60 * 1000;

const DEFAULT_CATEGORIES = ["Serial / Series", "Long Play", "Comedy", "Shorts"];

export type Catalog = {
  rows: Drama[];
  categories: string[];
  featuredIds: number[];
  fetchedAt: number;
  /** True when the network failed and these rows came from the on-device cache. */
  stale: boolean;
};

function authHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Accept: "application/json",
  };
}

async function fetchRows(): Promise<Drama[]> {
  const url = `${SUPABASE_URL}/rest/v1/Drama?select=*&order=id.desc`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Could not reach the archive (${res.status}).`);
  const data = (await res.json()) as RawRow[];
  if (!Array.isArray(data)) throw new Error("The archive returned an unexpected response.");
  return data.map(mapRow);
}

async function fetchCategories(): Promise<string[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/thumbnails/config/categories.json?t=${Date.now()}`);
    if (!res.ok) return DEFAULT_CATEGORIES;
    const list = (await res.json()) as unknown[];
    if (Array.isArray(list) && list.length > 0) {
      const cleaned = list.map((x) => String(x || "").trim()).filter(Boolean);
      if (cleaned.length > 0) return cleaned;
    }
  } catch {
    // Keep the built-in list when the config file is unreachable.
  }
  return DEFAULT_CATEGORIES;
}

async function fetchFeaturedIds(): Promise<number[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/thumbnails/config/featured.json?t=${Date.now()}`);
    if (!res.ok) return [];
    const list = (await res.json()) as unknown[];
    if (!Array.isArray(list)) return [];
    return list.map(Number).filter((n) => !Number.isNaN(n) && n > 0);
  } catch {
    return [];
  }
}

async function readCache(): Promise<Catalog | null> {
  try {
    const [rawRows, rawTime, rawCategories, rawFeatured] = await Promise.all([
      AsyncStorage.getItem(CACHE_KEY),
      AsyncStorage.getItem(CACHE_TIME_KEY),
      AsyncStorage.getItem(`${CACHE_KEY}.categories`),
      AsyncStorage.getItem(`${CACHE_KEY}.featured`),
    ]);
    if (!rawRows || !rawTime) return null;
    const rows = JSON.parse(rawRows) as Drama[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return {
      rows,
      categories: rawCategories ? (JSON.parse(rawCategories) as string[]) : DEFAULT_CATEGORIES,
      featuredIds: rawFeatured ? (JSON.parse(rawFeatured) as number[]) : [],
      fetchedAt: Number(rawTime) || 0,
      stale: false,
    };
  } catch {
    return null;
  }
}

async function writeCache(catalog: Catalog): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(catalog.rows)),
      AsyncStorage.setItem(CACHE_TIME_KEY, String(catalog.fetchedAt)),
      AsyncStorage.setItem(`${CACHE_KEY}.categories`, JSON.stringify(catalog.categories)),
      AsyncStorage.setItem(`${CACHE_KEY}.featured`, JSON.stringify(catalog.featuredIds)),
    ]);
  } catch {
    // A full disk is not a reason to fail the screen.
  }
}

export function isCacheFresh(catalog: Catalog | null): boolean {
  if (!catalog) return false;
  return Date.now() - catalog.fetchedAt < CACHE_TTL_MS;
}

/** Network-first with an on-device cache behind it. Throws only when there is nothing to show. */
export async function fetchCatalog(): Promise<Catalog> {
  const [rows, categories, featuredIds] = await Promise.all([fetchRows(), fetchCategories(), fetchFeaturedIds()]);
  const catalog: Catalog = { rows, categories, featuredIds, fetchedAt: Date.now(), stale: false };
  await writeCache(catalog);
  return catalog;
}

/**
 * Cache-first: return fresh cache immediately, otherwise go to the network.
 * On a network failure the previous cache is served and flagged stale.
 */
export async function loadCatalog(options?: { force?: boolean }): Promise<Catalog> {
  const cached = await readCache();
  if (!options?.force && isCacheFresh(cached) && cached) return cached;

  try {
    return await fetchCatalog();
  } catch (error) {
    if (cached) return { ...cached, stale: true };
    throw error;
  }
}

export async function readCachedCatalog(): Promise<Catalog | null> {
  return readCache();
}
