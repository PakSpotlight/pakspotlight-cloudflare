import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Catalog, fetchCatalog, loadCatalog, readCachedCatalog } from "./api";
import { Drama, groupDramas, heroPicks, titleKey } from "./dramas";
import { getMyList, subscribeMyList, toggleMyList as toggleMyListStorage } from "./storage";

type CatalogValue = {
  catalog: Catalog | null;
  rows: Drama[];
  series: Drama[][];
  categories: string[];
  episodeCounts: Record<number, number>;
  heroCandidates: Drama[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
  groupFor: (drama: Drama) => Drama[];
  byId: (id: number | string | undefined) => Drama | null;
  myList: string[];
  isSaved: (drama: Drama) => boolean;
  toggleSaved: (drama: Drama) => Promise<boolean>;
};

const EMPTY: Drama[] = [];

const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myList, setMyList] = useState<string[]>([]);

  const load = useCallback(async (options: { force?: boolean; silent?: boolean }) => {
    if (options.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      if (options.silent) {
        const fresh = await fetchCatalog();
        setCatalog(fresh);
      } else {
        // Show whatever is on the device first, then reconcile with the network.
        const cached = await readCachedCatalog();
        if (cached) setCatalog(cached);
        const fresh = await loadCatalog({ force: options.force });
        setCatalog(fresh);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load({});
  }, [load]);

  useEffect(() => {
    void getMyList().then(setMyList);
    return subscribeMyList(() => {
      void getMyList().then(setMyList);
    });
  }, []);

  const value = useMemo<CatalogValue>(() => {
    const rows = catalog?.rows ?? EMPTY;
    const series = groupDramas(rows);
    const episodeCounts: Record<number, number> = {};
    for (const group of series) {
      // Key every episode, not just the group head: curated rows deep-link to arbitrary episode
      // ids, and a card for episode 7 should still say how many episodes the series has.
      for (const episode of group) episodeCounts[episode.id] = group.length;
    }
    const byId = (id: number | string | undefined): Drama | null => {
      if (id === undefined || id === null || id === "") return null;
      const numeric = Number(id);
      if (!Number.isNaN(numeric)) {
        const match = rows.find((r) => r.id === numeric);
        if (match) return match;
      }
      const asKey = String(id);
      return rows.find((r) => titleKey(r) === asKey || String(r.id) === asKey) ?? null;
    };

    return {
      catalog,
      rows,
      series,
      categories: catalog?.categories ?? [],
      episodeCounts,
      heroCandidates: heroPicks(rows, catalog?.featuredIds ?? []),
      loading,
      refreshing,
      error,
      refresh: () => void load({ silent: true }),
      groupFor: (drama: Drama) => series.find((g) => g.some((e) => e.id === drama.id)) ?? [drama],
      byId,
      myList,
      isSaved: (drama: Drama) => myList.includes(titleKey(drama)),
      toggleSaved: async (drama: Drama) => {
        const added = await toggleMyListStorage(drama);
        setMyList(await getMyList());
        return added;
      },
    };
  }, [catalog, loading, refreshing, error, myList, load]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return value;
}
