import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Linking,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  findNodeHandle,
  TVFocusGuideView,
  useTVEventHandler,
} from "react-native";
import type { ColorValue } from "react-native";
import { Player } from "../components/Player";
import type { PlayerHandle, PlayerProgress } from "../components/Player";
import { clearTvPlaybackProgress, getTvPlaybackProgress, saveTvPlaybackProgress } from "../lib/tvPlaybackProgress";
import { useCatalog } from "../lib/catalog";
import {
  displayTitle,
  Drama,
  extractYouTubeId,
  normalize,
  seriesStartId,
  titleKey,
} from "../lib/dramas";
import { openInYouTube } from "../lib/youtube";
import { color, font } from "../theme";

type TvPage = "home" | "browse" | "library" | "info" | "details" | "player";
type NavItem = "home" | "browse" | "library" | "info";

const TV_SAFE = 34;
const TV_GOLD = "#D8B15A";

function formatPlayerTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

/* ============================================================
   Android TV focus plumbing (no TV fork APIs — everything this
   app needs ships in the stock react-native package):
   1. Every focusable Pressable hooks `onFocus`:
      • records which element is focused (for the search-trap logic)
      • scrolls its ancestor scroll container so the focused card
        is always visible (RN does NOT do this automatically).
   2. Android's native D-pad focus engine moves focus between
      focusable views; we seed it with `hasTVPreferredFocus` on one
      element per screen so the remote can never be "dead".
   ============================================================ */

type TvScrollable = {
  ref: any;
  kind: "scroll" | "flatlist";
  axis?: "x" | "y";
  cols?: number;
  rowStride?: number;
};

const tvScrollables = new Map<string, TvScrollable>();
const tvFocusableRefs = new Map<string, any>();
const tvRailOffsets = new Map<string, number>();
let tvLastFocusedKey = "";

function measureWithin(itemRef: any, ancestorRef: any): Promise<{ x: number; y: number } | null> {
  return new Promise((resolve) => {
    const node = itemRef && itemRef.current;
    const ancestor = ancestorRef && ancestorRef.current;
    if (!node || !ancestor) {
      resolve(null);
      return;
    }
    let handle: number | null = null;
    try {
      handle = findNodeHandle(ancestor) ?? null;
    } catch {
      handle = null;
    }
    if (handle == null) {
      resolve(null);
      return;
    }
    try {
      node.measureLayout(handle, (x: number, y: number) => resolve({ x, y }), () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function tvRequestFocus(ref: any): boolean {
  const el = ref && ref.current;
  if (!el) return false;
  try {
    if (typeof el.requestTVFocus === "function") {
      el.requestTVFocus();
      return true;
    }
  } catch {}
  return false;
}

function tvScrollIntoView(itemRef: any, scrollIds: string | string[] | undefined, index?: number) {
  if (!scrollIds) return;
  const ids = typeof scrollIds === "string" ? [scrollIds] : scrollIds;
  setImmediate(() => {
    void (async () => {
      for (const id of ids) {
        const entry = tvScrollables.get(id);
        if (!entry) continue;
        if (entry.kind === "flatlist") {
          const ref: any = entry.ref;
          if (typeof index === "number" && ref && typeof ref.scrollToOffset === "function") {
            const row = Math.floor(index / Math.max(1, entry.cols ?? 1));
            const stride = entry.rowStride ?? 0;
            const target = Math.max(0, row * stride);
            const metrics = ref?._listRef?._scrollMetrics ?? ref?._scrollMetrics;
            const offset = Number(metrics?.offset) || 0;
            const visible = Number(metrics?.visibleLength) || 0;
            // Don't issue a native scroll command for every focus move.
            // Only reposition when the target row is actually outside the viewport.
            if (!metrics || target < offset || target + stride > offset + visible) {
              ref.scrollToOffset({ offset: target, animated: false });
            }
          }
          continue;
        }
        const pos = await measureWithin(itemRef, entry.ref);
        if (!pos) continue;
        try {
          // Only move a rail/page when focus has actually left its visible area.
          // Repeated animated scrolls on every D-pad focus caused visible stutter.
          if (entry.axis === "y") {
            if (pos.y > 620) entry.ref.scrollTo({ y: Math.max(0, pos.y - 460), animated: false });
            else if (pos.y < -90) entry.ref.scrollTo({ y: Math.max(0, pos.y - 90), animated: false });
          } else {
            if (pos.x > 1120) entry.ref.scrollTo({ x: Math.max(0, pos.x - 850), animated: false });
            else if (pos.x < -120) entry.ref.scrollTo({ x: Math.max(0, pos.x - 100), animated: false });
          }
        } catch {}
      }
    })();
  });
}

function useTvItem(
  focusKey: string,
  opts?: { scrollIds?: string | string[]; itemIndex?: number; onFocus?: () => void; onBlur?: () => void },
) {
  const ref = useRef<any>(null);
  useEffect(() => {
    tvFocusableRefs.set(focusKey, ref);
    return () => { tvFocusableRefs.delete(focusKey); };
  }, [focusKey]);
  const onFocus = () => {
    tvLastFocusedKey = focusKey;
    opts?.onFocus?.();
    tvScrollIntoView(ref, opts?.scrollIds, opts?.itemIndex);
  };
  const onBlur = () => {
    opts?.onBlur?.();
  };
  return { ref, onFocus, onBlur };
}

// Extra props Android TV accepts on the native element that typescript's
// PressableProps definition does not declare.
const tvFocusProps = (autoFocus: boolean) => (autoFocus ? ({ hasTVPreferredFocus: true } as any) : {});

/* ============================ component ============================ */

export function TvApp({ initialPage = "home" }: { initialPage?: TvPage }) {
  const { width, height } = useWindowDimensions();
  const {
    catalog,
    rows,
    series,
    categories,
    episodeCounts,
    heroCandidates,
    loading,
    error,
    refresh,
    groupFor,
    isSaved,
    toggleSaved,
    myList,
  } = useCatalog();
  const [page, setPage] = useState<TvPage>(initialPage);
  const [detailsFrom, setDetailsFrom] = useState<NavItem>(initialPage === "browse" ? "browse" : "home");
  const [nav, setNav] = useState<NavItem>(initialPage === "browse" ? "browse" : "home");
  const [selected, setSelected] = useState<Drama | null>(null);
  const [detailResume, setDetailResume] = useState<{ episode: Drama; seconds: number; duration: number } | null>(null);
  const [episode, setEpisode] = useState<Drama | null>(null);
  const homeScrollRef = useRef<any>(null);
  const browseGridRef = useRef<any>(null);
  const homeOffsetRef = useRef(0);
  const browseOffsetRef = useRef(0);
  const originFocusKeyRef = useRef("");
  const restoreFocusKeyRef = useRef("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [playerFailed, setPlayerFailed] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [playerProgress, setPlayerProgress] = useState<PlayerProgress>({ currentTime: 0, duration: 0, state: -1 });
  const playerRef = useRef<PlayerHandle>(null);
  const pendingResumeSecondsRef = useRef(0);
  const lastSavedProgressRef = useRef("");
  const [resumePrompt, setResumePrompt] = useState<{ episode: Drama; seconds: number } | null>(null);
  const [showKb, setShowKb] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [exitDialogVisible, setExitDialogVisible] = useState(false);
  const searchRef = useRef<any>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSplashVisible(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  // Process one action when a remote key is released. With key-down events
  // enabled natively, held keys produce many ACTION_DOWN events but only one
  // ACTION_UP, preventing repeated 10-second jumps from a single hold.
  const lastSeekEventAtRef = useRef(0);
  useTVEventHandler((event) => {
    if (page !== "player") return;
    if (typeof event.eventKeyAction === "number" && event.eventKeyAction !== 1) return;
    if (event.eventType === "select" || event.eventType === "playPause") {
      playerRef.current?.playPause();
    } else if (event.eventType === "up" || event.eventType === "down") {
      // Return focus to the official YouTube iframe so its native controls,
      // captions and quality menus can be navigated with the D-pad.
      playerRef.current?.focus();
    } else if (event.eventType === "left" || event.eventType === "right") {
      const now = Date.now();
      if (now - lastSeekEventAtRef.current < 280) return;
      lastSeekEventAtRef.current = now;
      playerRef.current?.seekBy(event.eventType === "left" ? -10 : 10);
    }
  });

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (exitDialogVisible) {
        setExitDialogVisible(false);
        return true;
      }
      if (showKb) {
        closeKb();
        return true;
      }
      if (page === "player") {
        setPage("details");
        return true;
      }
      if (page === "details") {
        backFromDetails();
        return true;
      }
      if (page !== "home") {
        openNav("home");
        return true;
      }
      setExitDialogVisible(true);
      return true;
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, detailsFrom, nav, showKb, exitDialogVisible]);

  useEffect(() => {
    if (page !== "home" || heroCandidates.length < 2) return;
    const timer = setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroCandidates.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [page, heroCandidates.length]);

  const hero = heroCandidates.length
    ? heroCandidates[heroIndex % heroCandidates.length]
    : series[0]?.[0] ?? null;
  const latest = useMemo(() => [...series]
    .filter((group) => group.length > 0)
    .sort((a, b) => Math.max(...b.map((item) => item.id)) - Math.max(...a.map((item) => item.id)))
    .slice(0, 14)
    .map((group) => group[0]), [series]);

  const featured = useMemo(() => {
    const ids = catalog?.featuredIds ?? [];
    const picks = ids.map((id) => rows.find((row) => row.id === id)).filter((x): x is Drama => !!x);
    return picks.length ? picks : series.slice(0, 12).map((group) => group[0]);
  }, [catalog?.featuredIds, rows, series]);

  const library = useMemo(
    () => series.map((group) => group[0]).filter((drama): drama is Drama => !!drama && myList.includes(titleKey(drama))),
    [series, myList]
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    return series
      .map((group) => group[0])
      .filter((drama) => !!drama)
      .filter((drama) => !category || drama.type === category)
      .filter((drama) => {
        if (!q) return true;
        const group = series.find((items) => items.some((item) => item.id === drama.id)) ?? [drama];
        return group.flatMap((item) => [item.title, item.series, item.cast, item.year, item.urdu]).some((value) => normalize(value).includes(q));
      });
  }, [series, query, category]);

  const openDetails = (drama: Drama) => {
    originFocusKeyRef.current = tvLastFocusedKey;
    setDetailsFrom(page === "browse" || page === "library" ? page : "home");
    setSelected(drama);
    setEpisode(null);
    setPage("details");
  };

  const launchEpisode = (nextEpisode: Drama, resumeAt = 0) => {
    pendingResumeSecondsRef.current = resumeAt;
    lastSavedProgressRef.current = "";
    setEpisode(nextEpisode);
    setPlayerFailed(false);
    setPlayerProgress({ currentTime: 0, duration: 0, state: -1 });
    setResumePrompt(null);
    setPage("player");
  };

  const requestEpisode = async (nextEpisode: Drama) => {
    const id = extractYouTubeId(nextEpisode.youtube);
    if (id) {
      const saved = await getTvPlaybackProgress(id);
      if (saved && saved.currentTime >= 30 && (!saved.duration || saved.currentTime / saved.duration < 0.95)) {
        setResumePrompt({ episode: nextEpisode, seconds: saved.currentTime });
        return;
      }
    }
    launchEpisode(nextEpisode, 0);
  };

  const playDrama = (drama: Drama) => {
    const startId = seriesStartId(rows, drama);
    const first = rows.find((row) => row.id === startId) ?? drama;
    setSelected(drama);
    void requestEpisode(first);
  };

  const openNav = (next: NavItem) => {
    setNav(next);
    setPage(next);
    setSelected(null);
    setEpisode(null);
    setShowKb(false);
  };

  const backFromDetails = () => {
    restoreFocusKeyRef.current = originFocusKeyRef.current;
    setPage(detailsFrom);
    setNav(detailsFrom);
  };

  useEffect(() => {
    if (page !== "home" && page !== "browse" && page !== "library") return;
    const offset = page === "browse" ? browseOffsetRef.current : page === "home" ? homeOffsetRef.current : 0;
    const focusKey = restoreFocusKeyRef.current;
    const restore = () => {
      if (page === "home") homeScrollRef.current?.scrollTo({ y: offset, animated: false });
      if (page === "browse") browseGridRef.current?.scrollToOffset({ offset, animated: false });
      if (focusKey) {
        const target = tvFocusableRefs.get(focusKey);
        if (target && tvRequestFocus(target)) restoreFocusKeyRef.current = "";
      }
    };
    // Restore the saved scroll position once after the destination screen mounts.
    // Retry focus only (not scrolling) if a virtualized tile has not mounted yet.
    const first = setTimeout(restore, 100);
    const second = setTimeout(() => {
      if (!restoreFocusKeyRef.current) return;
      const target = tvFocusableRefs.get(restoreFocusKeyRef.current);
      if (target && tvRequestFocus(target)) restoreFocusKeyRef.current = "";
    }, 320);
    return () => { clearTimeout(first); clearTimeout(second); };
  }, [page]);

  const closeKb = () => {
    setShowKb(false);
    tvRequestFocus(searchRef);
  };

  const currentGroup = selected ? groupFor(selected) : [];
  useEffect(() => {
    let active = true;
    setDetailResume(null);
    if (page === "details" && selected) {
      const episodes = groupFor(selected);
      void Promise.all(episodes.map(async (item) => {
        const videoId = extractYouTubeId(item.youtube);
        return videoId ? { item, saved: await getTvPlaybackProgress(videoId) } : null;
      })).then((results) => {
        if (!active) return;
        const resumable = results
          .filter((entry): entry is { item: Drama; saved: NonNullable<Awaited<ReturnType<typeof getTvPlaybackProgress>>> } =>
            !!entry?.saved && entry.saved.currentTime >= 30 && (!entry.saved.duration || entry.saved.currentTime / entry.saved.duration < 0.95))
          .sort((a, b) => b.saved.updatedAt - a.saved.updatedAt)[0];
        if (resumable) setDetailResume({ episode: resumable.item, seconds: resumable.saved.currentTime, duration: resumable.saved.duration });
      });
    }
    return () => { active = false; };
  }, [page, selected, rows, groupFor]);
  const videoId = episode ? extractYouTubeId(episode.youtube) : null;
  const cardWidth = Math.max(220, Math.min(290, Math.round((width - 260) / 4)));
  const gridCols = Math.max(1, Math.floor((width - 150) / (cardWidth + 14)));
  const gridRowStride = Math.round(cardWidth * 9 / 16) + 84;

  return (
    <View style={[styles.screen, page === "player" && styles.fullscreenScreen]}>
      <StatusBar hidden={page === "player"} />
      {page !== "player" ? <View style={styles.sidebar}>
          <View style={styles.brandMark}>
            <View style={styles.brandGlyph}><Ionicons name="tv-outline" size={20} color="#000" /><View style={styles.brandPlay}><Ionicons name="play" size={9} color="#000" /></View></View>
            <Text style={styles.brandText}>CLASSIC TV<Text style={styles.brandPakistan}> PAKISTAN</Text></Text>
          </View>
          <TVFocusGuideView autoFocus style={styles.navItems}>
            <NavButton label="Home" icon="home-outline" active={nav === "home" && page !== "details"} autoFocus onPress={() => openNav("home")} />
            <NavButton label="Browse" icon="grid-outline" active={nav === "browse" || page === "details"} onPress={() => openNav("browse")} showKb={showKb} />
            <NavButton label="My List" icon="bookmark-outline" active={nav === "library"} onPress={() => openNav("library")} showKb={showKb} />
            <NavButton label="Info" icon="information-circle-outline" active={page === "info"} onPress={() => openNav("info")} showKb={showKb} />
            <NavButton label="Update" icon="refresh-outline" active={false} onPress={() => { void refresh(); setNav("home"); setPage("home"); }} showKb={showKb} />
          </TVFocusGuideView>
          <View style={styles.sidebarFooter}>
            <Text style={styles.sidebarCaption}>THE ARCHIVE</Text>
            <Text style={styles.sidebarSmall}>Classic Pakistani television, all in one place.</Text>
            {catalog?.stale ? <Text style={styles.offline}>Offline catalogue</Text> : null}
          </View>
        </View> : null}

        <View style={[styles.main, page === "player" && styles.fullscreenMain]}>
          {page !== "player" ? <View style={styles.topline}>
            <Text style={styles.pageLabel}>{page === "details" ? "TITLE DETAILS" : page === "browse" ? "EXPLORE THE ARCHIVE" : page === "library" ? "YOUR SAVED TITLES" : page === "info" ? "ABOUT THIS APP" : "HOME"}</Text>
            <View style={styles.topRight}>
              <Text style={styles.countText}>{rows.length.toLocaleString()} archive entries</Text>
              <View style={styles.statusDot} />
            </View>
          </View> : null}

          {page === "home" ? (
            <ScrollView
              ref={(r) => { homeScrollRef.current = r; if (r) tvScrollables.set("homeScroll", { ref: r, kind: "scroll", axis: "y" }); }}
              style={styles.pageScroll}
              contentContainerStyle={styles.homeContent}
              onScroll={(event) => { homeOffsetRef.current = event.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={120}
              showsVerticalScrollIndicator={false}
            >
              {hero ? (
                <View style={[styles.hero, { minHeight: Math.min(400, height * 0.58) }]}>
                  {hero.image ? <Image source={{ uri: hero.image }} style={styles.heroImage} resizeMethod="resize" resizeMode="contain" /> : null}
                  <View style={styles.heroScrim} />
                  <View style={styles.heroCopy}>
                    <Text style={styles.eyebrow}>FROM THE CLASSIC ARCHIVE</Text>
                    <Text style={styles.heroTitle} numberOfLines={2}>{displayTitle(hero)}</Text>
                    {hero.urdu ? <Text style={[styles.urduTitle, styles.urduTitleGold]}>{hero.urdu}</Text> : null}
                    <Text style={styles.heroMeta}>{[hero.year, hero.type, episodeCounts[hero.id] ? `${episodeCounts[hero.id]} episodes` : ""].filter(Boolean).join("  •  ")}</Text>
                    <View style={styles.actions}>
                      <ActionButton label="Play" icon="play" primary autoFocus onPress={() => playDrama(hero)} />
                      <ActionButton label="Details" icon="information-circle-outline" onPress={() => openDetails(hero)} showKb={showKb} />
                    </View>
                    {heroCandidates.length > 1 ? <View style={styles.heroPager}>
                      <TvPress focusKey="heroPrevious" showKb={showKb} onPress={() => setHeroIndex((current) => (current - 1 + heroCandidates.length) % heroCandidates.length)} style={styles.heroPagerButton} focusedStyle={styles.focused}>
                        <Ionicons name="chevron-back" size={18} color={color.text} />
                      </TvPress>
                      <Text style={styles.heroPagerText}>{(heroIndex % heroCandidates.length) + 1} / {heroCandidates.length}</Text>
                      <TvPress focusKey="heroNext" showKb={showKb} onPress={() => setHeroIndex((current) => (current + 1) % heroCandidates.length)} style={styles.heroPagerButton} focusedStyle={styles.focused}>
                        <Ionicons name="chevron-forward" size={18} color={color.text} />
                      </TvPress>
                    </View> : null}
                  </View>
                </View>
              ) : (
                <View style={styles.emptyHero}><Text style={styles.heroTitle}>{loading ? "Loading the archive…" : "Classic TV Pakistan"}</Text><Text style={styles.bodyText}>{error ?? "Browse the archive to discover classics."}</Text></View>
              )}
              {loading && !catalog ? <Text style={styles.bodyText}>Connecting to the archive…</Text> : null}
              <Shelf title="Latest Dramas" subtitle="Recently added to the archive" scrollId="rail:latest" items={latest} cardWidth={cardWidth} episodeCounts={episodeCounts} pageScrollId="homeScroll" onSelect={openDetails} onPlay={playDrama} />
              <Shelf title="Featured classics" subtitle="A selection from the archive" scrollId="rail:featured" items={featured} cardWidth={cardWidth} episodeCounts={episodeCounts} pageScrollId="homeScroll" onSelect={openDetails} onPlay={playDrama} />
              {categories.map((cat) => {
                const items = series.filter((group) => group[0]?.type === cat).slice(0, 14).map((group) => group[0]);
                return items.length ? <Shelf key={cat} title={cat} scrollId={`rail:${cat}`} items={items} cardWidth={cardWidth} episodeCounts={episodeCounts} pageScrollId="homeScroll" onSelect={openDetails} onPlay={playDrama} /> : null;
              })}
              {error && !catalog ? <ActionButton label="Retry loading archive" icon="refresh" onPress={refresh} showKb={showKb} /> : null}
            </ScrollView>
          ) : null}

          {page === "browse" ? (
            <View style={styles.fill}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={22} color={color.muted} />
                <TvPress
                  focusKey="search"
                  innerRef={searchRef}
                  autoFocus
                  showKb={showKb}
                  onPress={() => setShowKb(true)}
                  style={styles.searchZone}
                  focusedStyle={styles.focused}
                >
                  <Text numberOfLines={1} style={[styles.searchZoneText, !query && styles.searchPlaceholder]}>{query || "Search dramas, actors, years…"}</Text>
                  {!query ? <Ionicons name="pencil" size={17} color={color.dim} /> : <Ionicons name="close" size={18} color={color.muted} />}
                </TvPress>
                {query ? (
                  <TvPress
                    focusKey="clearSearch"
                    showKb={showKb}
                    onPress={() => setQuery("")}
                    style={styles.clearButton}
                    focusedStyle={styles.focused}
                  >
                    <Ionicons name="close" size={20} color={color.text} />
                  </TvPress>
                ) : null}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                ref={(r) => { if (r) tvScrollables.set("chips", { ref: r, kind: "scroll", axis: "x" }); }}
              >
                <FilterButton label="All" active={!category} autoFocus onPress={() => setCategory(null)} showKb={showKb} />
                {categories.map((cat) => <FilterButton key={cat} label={cat} active={category === cat} onPress={() => setCategory(category === cat ? null : cat)} showKb={showKb} />)}
              </ScrollView>
              <FlatList
                ref={(r: any) => {
                  browseGridRef.current = r;
                  if (r) tvScrollables.set("browseGrid", { ref: r, kind: "flatlist", cols: gridCols, rowStride: gridRowStride });
                }}
                style={styles.pageScroll}
                contentContainerStyle={styles.browseGridContent}
                data={filtered}
                keyExtractor={(drama) => String(drama.id)}
                numColumns={gridCols}
                key={gridCols}
                renderItem={({ index, item: drama }) => (
                  <PosterTile
                    drama={drama}
                    width={cardWidth}
                    episodeCount={episodeCounts[drama.id] ?? 1}
                    index={index}
                    scrollId="browseGrid"
                    onPress={() => openDetails(drama)}
                    onPlay={() => playDrama(drama)}
                  />
                )}
                removeClippedSubviews={false}
                initialNumToRender={gridCols * 5}
                maxToRenderPerBatch={gridCols * 2}
                windowSize={9}
                updateCellsBatchingPeriod={50}
                onScroll={(event) => { browseOffsetRef.current = event.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={120}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={<Text style={styles.bodyText}>{loading ? "Loading titles…" : "No titles match this search."}</Text>}
              />
            </View>
          ) : null}

          {page === "info" ? (
            <View style={styles.infoPage}>
              <View style={styles.infoMark}><Ionicons name="play" size={30} color="#000" /></View>
              <Text style={styles.infoTitle}>Classic TV Pakistan</Text>
              <Text style={styles.infoSubtitle}>Your archive of classic Pakistani television</Text>
              <View style={styles.infoCard}>
                <Text style={styles.infoCardTitle}>About this app</Text>
                <Text style={styles.bodyText}>Browse classic dramas, explore programme details, save titles to My List, and watch episodes through their available YouTube playback links.</Text>
              </View>
              <View style={styles.infoCard}>
                <Text style={styles.infoCardTitle}>Archive status</Text>
                <Text style={styles.bodyText}>{loading ? "Checking catalogue…" : error ? `Catalogue message: ${error}` : `${rows.length.toLocaleString()} archive entries available`}</Text>
                {catalog?.stale ? <Text style={styles.offline}>Showing saved catalogue data while offline.</Text> : null}
              </View>
              <View style={styles.infoCard}>
                <Text style={styles.infoCardTitle}>ARY Digital link test</Text>
                <Text style={styles.bodyText}>Test the official Dar-E-Nijaat episode link. Playback will be handled by ARY Plus in the browser or its app if Android routes the link there. This is a link test only; it does not copy or host ARY videos.</Text>
                <ActionButton label="Open Dar-E-Nijaat episode" icon="open-outline" primary onPress={() => { void Linking.openURL("https://aryplus.tv/video/v2/3/6aef23fa8c972be612ab59d2/6a57868b5bf57c474cc00a50").catch(() => {}); }} />
              </View>
              {showKb ? null : <ActionButton label={loading ? "Updating…" : "Update catalogue"} icon="refresh" primary onPress={() => { void refresh(); }} autoFocus />}
            </View>
          ) : null}

          {page === "library" ? (
            <ScrollView
              ref={(r) => { if (r) tvScrollables.set("libraryScroll", { ref: r, kind: "scroll", axis: "y" }); }}
              style={styles.pageScroll}
              contentContainerStyle={styles.grid}
            >
              {library.map((drama, i) => (
                <PosterTile key={drama.id} drama={drama} width={cardWidth} episodeCount={episodeCounts[drama.id] ?? 1} scrollId="libraryScroll" index={i} autoFocus={i === 0 && library.length > 0} onPress={() => openDetails(drama)} onPlay={() => playDrama(drama)} />
              ))}
              {!library.length ? <View style={styles.emptyState}><Ionicons name="bookmark-outline" size={38} color={color.muted} /><Text style={styles.sectionTitle}>Your list is empty</Text><Text style={styles.bodyText}>Save titles you want to revisit later.</Text></View> : null}
            </ScrollView>
          ) : null}

          {page === "details" && selected ? (
            <ScrollView
              ref={(r) => { if (r) tvScrollables.set("detailsScroll", { ref: r, kind: "scroll", axis: "y" }); }}
              style={styles.pageScroll}
              contentContainerStyle={styles.detailContent}
            >
              <View style={styles.detailHero}>
                {selected.image ? <Image source={{ uri: selected.image }} style={styles.detailImage} resizeMethod="resize" resizeMode="contain" /> : <View style={styles.detailImage} />}
                <View style={styles.detailCopy}>
                  <Text style={styles.eyebrow}>{selected.type.toUpperCase()}</Text>
                  <Text style={styles.detailTitle}>{displayTitle(selected)}</Text>
                  {selected.urdu ? <Text style={[styles.urduTitle, styles.urduTitleGold]}>{selected.urdu}</Text> : null}
                  <Text style={styles.heroMeta}>{[selected.year, currentGroup.length > 1 ? `${currentGroup.length} episodes` : "Classic archive"].filter(Boolean).join("  •  ")}</Text>
                  <Text style={styles.description} numberOfLines={5}>{selected.description || "A title from the Classic TV Pakistan archive."}</Text>
                  <View style={styles.actions}>
                    <ActionButton label="Play" icon="play" primary onPress={() => playDrama(selected)} autoFocus showKb={showKb} />
                    <ActionButton label={isSaved(selected) ? "In My List" : "My List"} icon={isSaved(selected) ? "bookmark" : "bookmark-outline"} onPress={() => void toggleSaved(selected)} showKb={showKb} />
                    <ActionButton label="Back" icon="arrow-back" onPress={backFromDetails} showKb={showKb} />
                  </View>
                </View>
              </View>
              {detailResume ? (
                <View style={styles.resumeCard}>
                  {detailResume.episode.image ? <Image source={{ uri: detailResume.episode.image }} style={styles.resumeImage} resizeMethod="resize" resizeMode="cover" /> : null}
                  <View style={styles.resumeCopy}>
                    <Text style={styles.resumeEyebrow}>CONTINUE WATCHING</Text>
                    <Text style={styles.resumeTitle} numberOfLines={1}>{displayTitle(detailResume.episode)}</Text>
                    <View style={styles.resumeTrack}>
                      <View style={[styles.resumeFill, { width: `${Math.max(0, Math.min(100, detailResume.duration > 0 ? detailResume.seconds / detailResume.duration * 100 : 0))}%` }]} />
                    </View>
                    <Text style={styles.resumeTime}>{formatPlayerTime(detailResume.seconds)} watched</Text>
                  </View>
                  <ActionButton label="Resume" icon="play" primary onPress={() => launchEpisode(detailResume.episode, detailResume.seconds)} showKb={showKb} />
                  <ActionButton label="Start Over" icon="refresh" onPress={() => { void clearTvPlaybackProgress(extractYouTubeId(detailResume.episode.youtube) || ""); launchEpisode(detailResume.episode, 0); }} showKb={showKb} />
                </View>
              ) : null}
              {currentGroup.length > 1 ? (
                <View style={styles.episodeGridSection}>
                  <View style={styles.shelfHeading}>
                    <View><Text style={styles.sectionTitle}>Episodes</Text><Text style={styles.shelfSubtitle}>Choose an episode to play</Text></View>
                    <Text style={styles.shelfCount}>{currentGroup.length} EPISODES</Text>
                  </View>
                  <View style={styles.episodeGrid}>
                    {currentGroup.map((ep, index) => {
                      const column = index % gridCols;
                      const atRowEnd = column === gridCols - 1 || index === currentGroup.length - 1;
                      return (
                        <PosterTile
                          key={ep.id}
                          drama={ep}
                          width={cardWidth}
                          episodeCount={1}
                          index={index}
                          scrollId="detailsScroll"
                          clampLeft={column === 0}
                          clampRight={atRowEnd}
                          showEpisodeNumber
                          onPress={() => { void requestEpisode(ep); }}
                          onPlay={() => { void requestEpisode(ep); }}
                        />
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          ) : null}

          {page === "player" && selected && episode ? (
            <View style={styles.playerPage}>
              <View style={styles.playerFrame}>
                {videoId && !playerFailed ? <Player
                  ref={playerRef}
                  key={videoId}
                  videoId={videoId}
                  onReady={() => {
                    const seconds = pendingResumeSecondsRef.current;
                    if (seconds > 0) {
                      pendingResumeSecondsRef.current = 0;
                      setTimeout(() => playerRef.current?.seekBy(seconds), 500);
                    }
                  }}
                  onProgress={(progress) => {
                    setPlayerProgress(progress);
                    if (videoId && progress.currentTime > 0 && progress.duration > 0) {
                      const bucket = Math.floor(progress.currentTime / 5);
                      const saveKey = `${videoId}:${bucket}`;
                      if (saveKey !== lastSavedProgressRef.current) {
                        lastSavedProgressRef.current = saveKey;
                        void saveTvPlaybackProgress(videoId, progress.currentTime, progress.duration);
                      }
                    }
                  }}
                  onError={() => setPlayerFailed(true)}
                /> : <View style={styles.playerError}><Ionicons name="logo-youtube" size={42} color={color.muted} /><Text style={styles.bodyText}>This episode could not be loaded.</Text></View>}
              </View>
            </View>
          ) : null}
        </View>

        <Modal visible={splashVisible} transparent={false} animationType="fade" statusBarTranslucent>
          <View style={styles.splashScreen}>
            <View style={styles.splashMark}>
              <Ionicons name="play" size={34} color="#050606" />
            </View>
            <Text style={styles.splashTitle}>CLASSIC TV</Text>
            <Text style={styles.splashSubtitle}>PAKISTAN</Text>
            <View style={styles.splashRule} />
            <Text style={styles.splashTagline}>YOUR CLASSIC TELEVISION ARCHIVE</Text>
          </View>
        </Modal>

        <Modal visible={!!resumePrompt} transparent animationType="fade" onRequestClose={() => setResumePrompt(null)}>
          <View style={styles.exitBackdrop}>
            <View style={styles.exitCard}>
              <Ionicons name="play-circle-outline" size={36} color={TV_GOLD} />
              <Text style={styles.exitTitle}>Resume watching?</Text>
              <Text style={styles.exitMessage}>
                {resumePrompt ? `You stopped at ${formatPlayerTime(resumePrompt.seconds)}. Would you like to continue from there?` : ""}
              </Text>
              <TVFocusGuideView autoFocus style={styles.exitActions}>
                <DialogButton preferred label="START OVER" variant="stay" onPress={() => {
                  if (resumePrompt) {
                    const next = resumePrompt.episode;
                    void clearTvPlaybackProgress(extractYouTubeId(next.youtube) || "");
                    launchEpisode(next, 0);
                  }
                }} />
                <DialogButton label="RESUME" variant="confirm" onPress={() => {
                  if (resumePrompt) launchEpisode(resumePrompt.episode, resumePrompt.seconds);
                }} />
              </TVFocusGuideView>
            </View>
          </View>
        </Modal>

        <Modal visible={exitDialogVisible} transparent animationType="fade" onRequestClose={() => setExitDialogVisible(false)}>
          <View style={styles.exitBackdrop}>
            <View style={styles.exitCard}>
              <Ionicons name="tv-outline" size={34} color={TV_GOLD} />
              <Text style={styles.exitTitle}>Exit Classic TV Pakistan?</Text>
              <Text style={styles.exitMessage}>Are you sure you want to close the app?</Text>
              <TVFocusGuideView autoFocus style={styles.exitActions}>
                <DialogButton preferred label="NO, STAY" variant="stay" onPress={() => setExitDialogVisible(false)} />
                <DialogButton label="YES, EXIT" variant="confirm" onPress={() => { setExitDialogVisible(false); BackHandler.exitApp(); }} />
              </TVFocusGuideView>
            </View>
          </View>
        </Modal>

        {showKb ? (
          <RemoteKeyboard
            query={query}
            onChar={(c) => setQuery((prev) => prev + c)}
            onBackspace={() => setQuery((prev) => prev.slice(0, -1))}
            onClear={() => setQuery("")}
            onDone={closeKb}
            onClose={closeKb}
          />
        ) : null}
      </View>
  );
}

const KB_ROWS = ["ABCDEFGH", "IJKLMNO", "PQRSTUV", "WXYZ012", "3456789"];

function RemoteKeyboard({ onChar, onBackspace, onClear, onDone, onClose }: {
  query?: string;
  onChar: (c: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const [focused, setFocused] = useState("");
  const firstKeyRef = useRef<any>(null);
  useEffect(() => {
    setImmediate(() => { if (!tvRequestFocus(firstKeyRef) && firstKeyRef.current) firstKeyRef.current.focus?.(); });
  }, []);

  const Row = ({ chars }: { chars: string }) => (
    <View style={styles.kbRow}>
      {chars.split("").map((c, i) => (
        <TvPress
          key={c}
          focusKey={`kb:${c}`}
          showKb={false}
          autoFocus={i === 0 && chars === KB_ROWS[0]}
          innerRef={i === 0 && chars === KB_ROWS[0] ? firstKeyRef : undefined}
          onPress={() => onChar(c)}
          onFocusCb={() => setFocused(c)}
          onBlurCb={() => setFocused("")}
        >
          <View style={[styles.kbKey, focused === c && styles.kbKeyFocused]}>
            <Text style={styles.kbKeyText}>{c}</Text>
          </View>
        </TvPress>
      ))}
    </View>
  );

  return (
    <View style={styles.kbWrap} pointerEvents="box-none">
      <View style={styles.kbSheet}>
        <Text style={styles.kbTitle}>CHANNEL SEARCH</Text>
        <View style={styles.kbGrid}>
          {KB_ROWS.map((chars) => <Row key={chars} chars={chars} />)}
          <View style={styles.kbRow}>
            <TvPress focusKey="kb:Backspace" showKb={false} onPress={onBackspace} onFocusCb={() => setFocused("⌫")} onBlurCb={() => setFocused("")}>
              <View style={[styles.kbKey, styles.kbKeyWide, focused === "⌫" && styles.kbKeyFocused]}><Text style={styles.kbKeyText}>⌫</Text></View>
            </TvPress>
            <TvPress focusKey="kb:Space" showKb={false} onPress={() => onChar(" ")} onFocusCb={() => setFocused("␣")} onBlurCb={() => setFocused("")}>
              <View style={[styles.kbKey, styles.kbKeyWide2, focused === "␣" && styles.kbKeyFocused]}><Text style={styles.kbKeyText}>SPACE</Text></View>
            </TvPress>
            <TvPress focusKey="kb:Clear" showKb={false} onPress={onClear} onFocusCb={() => setFocused("CLR")} onBlurCb={() => setFocused("")}>
              <View style={[styles.kbKey, styles.kbKeyWide, focused === "CLR" && styles.kbKeyFocused]}><Text style={styles.kbKeyText}>CLEAR</Text></View>
            </TvPress>
            <TvPress focusKey="kb:Done" showKb={false} onPress={onDone} onFocusCb={() => setFocused("OK")} onBlurCb={() => setFocused("")}>
              <View style={[styles.kbKey, styles.kbKeyWide, styles.kbKeyGold, focused === "OK" && styles.kbKeyFocused]}><Text style={styles.kbKeyTextDark}>DONE</Text></View>
            </TvPress>
            <TvPress focusKey="kb:Close" showKb={false} onPress={onClose} onFocusCb={() => setFocused("X")} onBlurCb={() => setFocused("")}>
              <View style={[styles.kbKey, focused === "X" && styles.kbKeyFocused]}><Ionicons name="close" size={18} color={color.text} /></View>
            </TvPress>
          </View>
        </View>
        <Text style={styles.kbHint}>Arrow keys move · center OK types · Back closes the keyboard</Text>
      </View>
    </View>
  );
}

function TvPress({
  focusKey,
  onPress,
  children,
  style,
  focusedStyle,
  autoFocus = false,
  showKb = false,
  innerRef,
  scrollIds,
  onFocusCb,
  onBlurCb,
}: {
  focusKey: string;
  onPress: () => void;
  children?: React.ReactNode;
  style?: any;
  focusedStyle?: any;
  autoFocus?: boolean;
  showKb?: boolean;
  innerRef?: any;
  scrollIds?: string | string[];
  onFocusCb?: () => void;
  onBlurCb?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const ownRef = useRef<any>(null);
  return (
    <Pressable
      ref={(r: any) => {
        ownRef.current = r;
        if (innerRef) {
          if (typeof innerRef === "function") innerRef(r);
          else innerRef.current = r;
        }
      }}
      focusable
      disabled={showKb}
      {...tvFocusProps(autoFocus && !showKb)}
      onLongPress={undefined}
      onPress={onPress}
      onFocus={() => { tvLastFocusedKey = focusKey; setFocused(true); onFocusCb?.(); tvScrollIntoView(ownRef, scrollIds); }}
      onBlur={() => { setFocused(false); onBlurCb?.(); }}
      accessibilityRole="button"
      style={[typeof style === "function" ? null : style, focused ? (focusedStyle ?? styles.focusOutlineOn) : styles.focusOutline]}
    >
      {children}
    </Pressable>
  );
}

function DialogButton({ label, variant, onPress, preferred = false }: {
  label: string;
  variant: "stay" | "confirm";
  onPress: () => void;
  preferred?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      focusable
      hasTVPreferredFocus={preferred}
      accessibilityRole="button"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.exitButton,
        variant === "stay" ? styles.exitStay : styles.exitConfirm,
        focused && styles.exitButtonFocused,
        pressed && styles.pressed,
      ]}
    >
      <Text style={variant === "stay" ? styles.exitStayText : styles.exitConfirmText}>{label}</Text>
    </Pressable>
  );
}

function NavButton({ label, icon, active, autoFocus, onPress, showKb }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; autoFocus?: boolean; onPress: () => void; showKb?: boolean }) {
  const [focused, setFocused] = useState(false);
  const tv = useTvItem(`nav:${label}`);
  return (
    <Pressable
      ref={tv.ref}
      focusable
      disabled={showKb}
      {...tvFocusProps(!!autoFocus && !showKb)}
      onFocus={() => { tv.onFocus(); setFocused(true); }}
      onBlur={() => { tv.onBlur(); setFocused(false); }}
      onPress={onPress}
      style={[styles.navButton, active && styles.navActive, focused && styles.navFocused]}
    >
      <Ionicons name={icon} size={22} color={active || focused ? TV_GOLD : color.muted} />
      <Text style={[styles.navText, (active || focused) && styles.navTextLit]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, icon, primary = false, onPress, autoFocus, showKb }: { label: string; icon: keyof typeof Ionicons.glyphMap; primary?: boolean; onPress: () => void; autoFocus?: boolean; showKb?: boolean }) {
  const [focused, setFocused] = useState(false);
  const iconColor: ColorValue = primary ? "#000" : color.text;
  const tv = useTvItem(`action:${label}`);
  return (
    <Pressable
      ref={tv.ref}
      focusable
      disabled={showKb}
      {...tvFocusProps(!!autoFocus && !showKb)}
      onFocus={() => { tv.onFocus(); setFocused(true); }}
      onBlur={() => { tv.onBlur(); setFocused(false); }}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, primary && styles.actionPrimary, focused && styles.focused, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={18} color={focused && !primary ? TV_GOLD : iconColor} />
      <Text style={[styles.actionText, primary && styles.actionTextPrimary, focused && !primary && styles.actionTextLit]}>{label}</Text>
    </Pressable>
  );
}

function FilterButton({ label, active, autoFocus, onPress, showKb }: { label: string; active: boolean; autoFocus?: boolean; onPress: () => void; showKb?: boolean }) {
  const [focused, setFocused] = useState(false);
  const tv = useTvItem(`chip:${label}`, { scrollIds: "chips" });
  return (
    <Pressable
      ref={tv.ref}
      focusable
      disabled={showKb}
      {...tvFocusProps(!!autoFocus && !showKb)}
      onFocus={() => { tv.onFocus(); setFocused(true); }}
      onBlur={() => { tv.onBlur(); setFocused(false); }}
      onPress={onPress}
      style={[styles.filter, active && styles.filterActive, focused && styles.focused]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive, focused && !active && styles.filterTextLit]}>{label}</Text>
    </Pressable>
  );
}

function EpisodeButton({ episode, number, index, selected, onPress, showKb }: { episode: Drama; number: number; index: number; selected: boolean; onPress: () => void; showKb?: boolean }) {
  const [focused, setFocused] = useState(false);
  const tv = useTvItem(`ep:${episode.id}`, { scrollIds: ["playerRail"], itemIndex: index });
  return (
    <Pressable
      ref={tv.ref}
      focusable
      disabled={showKb}
      {...tvFocusProps(index === 0 && !showKb)}
      onFocus={() => { tv.onFocus(); setFocused(true); }}
      onBlur={() => { tv.onBlur(); setFocused(false); }}
      onPress={onPress}
      style={[styles.episodeChip, selected && styles.episodeSelected, focused && styles.focused]}
    >
      <Text style={[styles.episodeNumber, focused && styles.episodeNumberLit]}>{episode.episode ?? number}</Text>
      <Text style={[styles.episodeTitle, focused && styles.episodeTitleLit]} numberOfLines={1}>{episode.title}</Text>
    </Pressable>
  );
}

function Shelf({ title, subtitle, scrollId, items, cardWidth, episodeCounts, pageScrollId, onSelect, onPlay, compact = false, showEpisodeNumber = false }: {
  title: string;
  subtitle?: string;
  scrollId: string;
  items: Drama[];
  cardWidth: number;
  episodeCounts: Record<number, number>;
  pageScrollId?: string;
  onSelect: (drama: Drama) => void;
  onPlay: (drama: Drama) => void;
  compact?: boolean;
  showEpisodeNumber?: boolean;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.shelf}>
      <View style={styles.shelfHeading}>
        <View><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.shelfSubtitle}>{subtitle}</Text> : null}</View>
        <Text style={styles.shelfCount}>{items.length} TITLES</Text>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(drama) => String(drama.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        removeClippedSubviews
        initialNumToRender={Math.min(items.length, 5)}
        maxToRenderPerBatch={4}
        windowSize={3}
        updateCellsBatchingPeriod={60}
        onScroll={(event) => { tvRailOffsets.set(scrollId, event.nativeEvent.contentOffset.x); }}
         scrollEventThrottle={120}
         getItemLayout={(_, index) => {
          const tileWidth = cardWidth;
          return { length: tileWidth + 14, offset: (tileWidth + 14) * index, index };
        }}
        ref={(r: any) => {
          if (r) {
            const tileWidth = cardWidth;
            tvScrollables.set(scrollId, { ref: r, kind: "flatlist", cols: 1, rowStride: tileWidth + 14 });
             const savedOffset = tvRailOffsets.get(scrollId) ?? 0;
             if (savedOffset > 0) setTimeout(() => r.scrollToOffset({ offset: savedOffset, animated: false }), 80);
          }
        }}
        renderItem={({ item: drama, index }) => (
          <PosterTile
            drama={drama}
            width={cardWidth}
            episodeCount={episodeCounts[drama.id] ?? 1}
            scrollIds={[scrollId, pageScrollId].filter(Boolean) as string[]}
            index={index}
            totalCount={items.length}
            onPress={() => onSelect(drama)}
            onPlay={() => onPlay(drama)}
            compact={compact}
            showEpisodeNumber={showEpisodeNumber}
            clampHorizontal
          />
        )}
      />
    </View>
  );
}

function PosterTile({ drama, width, episodeCount, onPress, onPlay, compact = false, scrollId, scrollIds, index, totalCount, autoFocus, clampHorizontal = false, clampLeft = false, clampRight = false, showEpisodeNumber = false }: {
  drama: Drama;
  width: number;
  episodeCount: number;
  onPress: () => void;
  onPlay: () => void;
  compact?: boolean;
  scrollId?: string;
  scrollIds?: string[];
  index?: number;
  totalCount?: number;
  autoFocus?: boolean;
  clampHorizontal?: boolean;
  clampLeft?: boolean;
  clampRight?: boolean;
  showEpisodeNumber?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [selfFocusId, setSelfFocusId] = useState<number | undefined>(undefined);
  const tv = useTvItem(`poster:${drama.id}`, { scrollIds: scrollIds ?? scrollId, itemIndex: index });
  return (
    <Pressable
      ref={tv.ref}
      focusable
      nextFocusLeft={(clampLeft || (clampHorizontal && index === 0)) ? selfFocusId : undefined}
      nextFocusRight={(clampRight || (clampHorizontal && index === (totalCount ?? 0) - 1)) ? selfFocusId : undefined}
      onLayout={() => {
        if ((clampHorizontal || clampLeft || clampRight) && selfFocusId == null) {
          const node = findNodeHandle(tv.ref.current);
          if (typeof node === "number") setSelfFocusId(node);
        }
      }}
      {...tvFocusProps(!!autoFocus)}
      onFocus={() => { tv.onFocus(); setFocused(true); }}
      onBlur={() => { tv.onBlur(); setFocused(false); }}
      onPress={onPress}
      onLongPress={onPlay}
      accessibilityRole="button"
      accessibilityLabel={displayTitle(drama)}
      style={({ pressed }) => [styles.posterTile, { width }, focused && styles.posterFocused, pressed && styles.pressed]}
    >
      <View style={[styles.posterFrame, { height: Math.round(width * 9 / 16) }, focused && styles.posterFrameFocused]}>
        {drama.image ? <Image source={{ uri: drama.image }} style={[styles.poster, focused && styles.posterLit]} resizeMethod="resize" resizeMode="contain" /> : <View style={styles.posterFallback}><Ionicons name="film-outline" size={28} color={color.muted} /></View>}
      </View>
      <Text style={[styles.posterTitle, focused && styles.posterTitleLit]} numberOfLines={2}>{displayTitle(drama)}</Text>
      {!compact && showEpisodeNumber ? <Text style={[styles.posterEpisodeCount, focused && styles.posterYearLit]}>Episode {drama.episode ?? (index ?? 0) + 1}</Text> : null}
      {!compact && !showEpisodeNumber && episodeCount > 1 ? <Text style={[styles.posterEpisodeCount, focused && styles.posterYearLit]}>{episodeCount} Episodes</Text> : null}
      {!compact && drama.year ? <Text style={[styles.posterYear, focused && styles.posterYearLit]}>{drama.year}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  splashScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#050606" },
  splashMark: { width: 76, height: 76, borderRadius: 22, backgroundColor: TV_GOLD, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  splashTitle: { color: "#FFFFFF", fontFamily: font.black, fontSize: 34, letterSpacing: 2 },
  splashSubtitle: { color: TV_GOLD, fontFamily: font.bold, fontSize: 17, letterSpacing: 7, marginTop: 5 },
  splashRule: { width: 100, height: 2, backgroundColor: TV_GOLD, marginTop: 25, marginBottom: 16 },
  splashTagline: { color: color.muted, fontFamily: font.medium, fontSize: 11, letterSpacing: 2 },
  exitBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.82)" },
  exitCard: { width: "100%", maxWidth: 520, alignItems: "center", gap: 14, padding: 30, borderRadius: 18, borderWidth: 1, borderColor: "rgba(216,177,90,0.5)", backgroundColor: "#101311" },
  exitTitle: { color: "#FFFFFF", fontFamily: font.black, fontSize: 25, textAlign: "center" },
  exitMessage: { color: color.muted, fontFamily: font.body, fontSize: 16, textAlign: "center" },
  exitActions: { flexDirection: "row", gap: 16, marginTop: 10 },
  exitButton: { minWidth: 140, minHeight: 52, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderWidth: 2, borderColor: "rgba(255,255,255,0.18)" },
  exitButtonFocused: { borderColor: TV_GOLD, borderWidth: 2 },
  exitStay: { backgroundColor: "#242A26" },
  exitConfirm: { backgroundColor: TV_GOLD },
  exitStayText: { color: "#FFFFFF", fontFamily: font.bold, fontSize: 15 },
  exitConfirmText: { color: "#050606", fontFamily: font.black, fontSize: 15 },
  screen: { flex: 1, flexDirection: "row", backgroundColor: "#050606" },
  fullscreenScreen: { flexDirection: "column", padding: 0 },
  sidebar: { width: 118, paddingTop: 18, paddingHorizontal: 8, paddingBottom: 14, borderRightWidth: 1, borderRightColor: color.line, backgroundColor: "#080A09" },
  brandMark: { flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 20, paddingHorizontal: 1 },
  brandGlyph: { width: 27, height: 27, borderRadius: 8, backgroundColor: TV_GOLD, alignItems: "center", justifyContent: "center" },
  brandPlay: { position: "absolute", right: 2, bottom: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  brandText: { color: color.text, fontFamily: font.black, fontSize: 9, letterSpacing: 0.1 },
  brandPakistan: { color: color.muted, fontFamily: font.medium },
  navItems: { gap: 5 },
  navButton: { minHeight: 40, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 7, borderWidth: 1, borderColor: "transparent" },
  navActive: { backgroundColor: "rgba(216,177,90,0.12)", borderColor: "rgba(216,177,90,0.35)" },
  navFocused: { borderColor: TV_GOLD, borderWidth: 2, backgroundColor: "transparent" },
  navText: { color: color.muted, fontFamily: font.medium, fontSize: 12 },
  navTextActive: { color: color.text, fontFamily: font.bold },
  navTextLit: { color: color.text, fontFamily: font.bold },
  sidebarFooter: { marginTop: "auto", paddingHorizontal: 2, gap: 5 },
  sidebarCaption: { color: TV_GOLD, fontFamily: font.bold, fontSize: 9, letterSpacing: 1.1 },
  sidebarSmall: { color: color.dim, fontFamily: font.body, fontSize: 10, lineHeight: 14 },
  offline: { color: color.muted, fontSize: 11 },
  main: { flex: 1, minWidth: 0, paddingTop: 22, paddingLeft: 22, paddingRight: TV_SAFE, paddingBottom: 14 },
  fullscreenMain: { flex: 1, minWidth: 0, padding: 0, margin: 0 },
  topline: { height: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  pageLabel: { color: color.muted, fontFamily: font.bold, fontSize: 12, letterSpacing: 1.5 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 9 },
  countText: { color: color.dim, fontSize: 12 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: TV_GOLD },
  pageScroll: { flex: 1 },
  homeContent: { paddingBottom: 40, gap: 22 },
  hero: { overflow: "hidden", borderRadius: 18, backgroundColor: "#141816", justifyContent: "flex-end" },
  heroImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.64 },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.34)" },
  heroCopy: { padding: 32, paddingBottom: 36, maxWidth: 700, gap: 10 },
  eyebrow: { color: TV_GOLD, fontFamily: font.bold, fontSize: 11, letterSpacing: 1.7 },
  urduTitle: { color: "#fff", fontFamily: font.urdu, fontSize: 29, lineHeight: 46, textAlign: "right", includeFontPadding: true },
  urduTitleGold: { color: TV_GOLD },
  heroTitle: { color: "#fff", fontFamily: font.black, fontSize: 36, lineHeight: 42 },
  heroMeta: { color: "#D3D8D4", fontFamily: font.medium, fontSize: 14, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  heroPager: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  heroPagerButton: { width: 34, height: 30, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" },
  heroPagerText: { color: "#FFF", fontFamily: font.bold, fontSize: 11 },
  actionButton: { minHeight: 48, minWidth: 124, borderRadius: 10, paddingHorizontal: 20, gap: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#202522", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  actionPrimary: { backgroundColor: "#fff", borderColor: "#fff" },
  actionText: { color: color.text, fontFamily: font.bold, fontSize: 15 },
  actionTextPrimary: { color: "#000" },
  actionTextLit: { color: TV_GOLD },
  focused: { borderColor: TV_GOLD, borderWidth: 2 },
  posterFocused: { borderColor: "transparent", borderWidth: 1, borderRadius: 10, backgroundColor: "transparent", zIndex: 2 },
  posterFrameFocused: { borderColor: TV_GOLD, borderWidth: 1 },
  posterLit: { opacity: 1 },
  posterDimmed: { opacity: 1 },
  pressed: { opacity: 0.78 },
  focusOutline: { borderWidth: 1, borderColor: "transparent" },
  focusOutlineOn: { borderColor: TV_GOLD },
  shelf: { gap: 12 },
  resumeCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(216,177,90,0.30)", backgroundColor: "#111713" },
  resumeImage: { width: 190, height: 107, borderRadius: 8, backgroundColor: "#000" },
  resumeCopy: { flex: 1, gap: 7 },
  resumeEyebrow: { color: TV_GOLD, fontFamily: font.bold, fontSize: 10, letterSpacing: 1.2 },
  resumeTitle: { color: "#fff", fontFamily: font.bold, fontSize: 17 },
  resumeTrack: { height: 5, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.22)" },
  resumeFill: { height: 5, backgroundColor: "#E11B22" },
  resumeTime: { color: color.muted, fontSize: 11 },
  shelfHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingRight: 4 },
  sectionTitle: { color: color.text, fontFamily: font.bold, fontSize: 21 },
  shelfSubtitle: { color: color.dim, fontSize: 12, marginTop: 3 },
  shelfCount: { color: color.dim, fontFamily: font.bold, fontSize: 10, letterSpacing: 1 },
  rail: { gap: 14, paddingVertical: 8, paddingRight: 8 },
  posterTile: { borderRadius: 10, padding: 4, gap: 6, borderWidth: 2, borderColor: "transparent" },
  posterFrame: { borderRadius: 8, overflow: "hidden", backgroundColor: "#000", aspectRatio: 16 / 9, borderWidth: 2, borderColor: "transparent" },
  poster: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  posterFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  posterEpisodeCount: { color: color.muted, fontFamily: font.medium, fontSize: 12, marginTop: -2 },
  posterTitle: { color: color.text, fontFamily: font.bold, fontSize: 16, lineHeight: 26, minHeight: 52, includeFontPadding: true },
  posterTitleLit: { color: "#FFF3D6" },
  posterYear: { color: color.dim, fontSize: 12 },
  posterYearLit: { color: TV_GOLD },
  emptyHero: { minHeight: 180, padding: 28, justifyContent: "center", gap: 10 },
  bodyText: { color: color.muted, fontFamily: font.body, fontSize: 14, lineHeight: 21 },
  fill: { flex: 1 },
  searchBox: { height: 56, borderRadius: 12, borderWidth: 1, borderColor: color.line, backgroundColor: "#101311", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, marginBottom: 14 },
  searchZone: { flex: 1, minHeight: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10 },
  searchZoneText: { color: color.text, fontFamily: font.body, fontSize: 17, flex: 1 },
  searchPlaceholder: { color: color.dim },
  clearButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  chips: { gap: 10, paddingBottom: 14, paddingTop: 2 },
  filter: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9, backgroundColor: "#171B18", borderWidth: 1, borderColor: color.line },
  filterActive: { backgroundColor: TV_GOLD, borderColor: TV_GOLD },
  filterText: { color: color.text, fontFamily: font.medium, fontSize: 14 },
  filterTextActive: { color: "#000", fontFamily: font.bold },
  filterTextLit: { color: "#fff", fontFamily: font.bold },
  grid: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 14, paddingBottom: 40 },
  browseGridContent: { paddingBottom: 40, gap: 14 },
  emptyState: { width: "100%", minHeight: 280, alignItems: "center", justifyContent: "center", gap: 12 },
  infoPage: { flex: 1, alignItems: "flex-start", justifyContent: "center", gap: 16, paddingHorizontal: 28, paddingBottom: 28, maxWidth: 760 },
  infoMark: { width: 52, height: 52, borderRadius: 14, backgroundColor: TV_GOLD, alignItems: "center", justifyContent: "center" },
  infoTitle: { color: "#fff", fontFamily: font.black, fontSize: 30 },
  infoSubtitle: { color: color.muted, fontFamily: font.medium, fontSize: 16 },
  infoCard: { width: "100%", gap: 8, padding: 18, borderRadius: 12, borderWidth: 1, borderColor: color.line, backgroundColor: "#101311" },
  infoCardTitle: { color: color.text, fontFamily: font.bold, fontSize: 18 },
  detailContent: { paddingBottom: 32, gap: 22 },
  detailHero: { flexDirection: "row", gap: 28, minHeight: 280, alignItems: "center" },
  detailImage: { width: 340, height: 191, borderRadius: 12, backgroundColor: color.surfaceAlt, overflow: "hidden" },
  detailCopy: { flex: 1, gap: 12, maxWidth: 720 },
  detailTitle: { color: "#fff", fontFamily: font.black, fontSize: 34, lineHeight: 40 },
  description: { color: color.muted, fontSize: 15, lineHeight: 23, maxWidth: 650 },
  playerPage: { flex: 1, minHeight: 0, gap: 0, backgroundColor: "#000" },
  playerTop: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 42, paddingHorizontal: 18, paddingTop: 10 },
  playerHeading: { color: color.text, fontFamily: font.bold, fontSize: 17, flex: 1 },
  playerHint: { color: color.dim, fontSize: 11 },
  playerFrame: { flex: 1, minHeight: 0, width: "100%", backgroundColor: "#000", borderRadius: 0, overflow: "hidden" },
  playerOverlayControls: { position: "absolute", zIndex: 5, top: 18, left: 18, right: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  playerBottomControls: { position: "absolute", zIndex: 6, left: 28, right: 28, bottom: 24, padding: 16, gap: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  playerProgressRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  playerProgressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.35)", overflow: "hidden" },
  playerProgressFill: { height: 5, backgroundColor: "#F00", borderRadius: 3 },
  playerTime: { color: "#FFF", fontFamily: font.medium, fontSize: 12, minWidth: 48, textAlign: "center" },
  playerActionsRow: { flexDirection: "row", justifyContent: "center", gap: 16 },
  playerControl: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", backgroundColor: "rgba(0,0,0,0.78)" },
  playerControlText: { color: "#fff", fontFamily: font.bold, fontSize: 13 },
  playerError: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  episodeGridSection: { gap: 14, paddingTop: 8 },
  episodeGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 14, paddingBottom: 36 },
  episodeChip: { width: 170, minHeight: 52, borderRadius: 9, padding: 9, backgroundColor: "#171B18", borderWidth: 1, borderColor: color.line },
  episodeSelected: { borderColor: TV_GOLD },
  episodeNumber: { color: TV_GOLD, fontFamily: font.bold, fontSize: 11 },
  episodeNumberLit: { color: "#FFD98A", fontSize: 13 },
  episodeTitle: { color: color.text, fontSize: 12, marginTop: 3 },
  episodeTitleLit: { color: "#FFFFFF", fontFamily: font.bold },
  backButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  kbWrap: { position: "absolute", left: 0, right: 0, bottom: 0, top: 0, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "flex-end" },
  kbSheet: { width: "100%", maxWidth: 780, marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: color.line, backgroundColor: "#0B0E0C", padding: 20, alignItems: "center" },
  kbTitle: { color: TV_GOLD, fontFamily: font.bold, fontSize: 11, letterSpacing: 1.6, marginBottom: 12 },
  kbGrid: { gap: 8 },
  kbRow: { flexDirection: "row", justifyContent: "center", gap: 8 },
  kbKey: { minWidth: 62, height: 56, borderRadius: 10, backgroundColor: "#171B18", borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center" },
  kbKeyFocused: { borderColor: TV_GOLD, borderWidth: 2, transform: [{ scale: 1.03 }] },
  kbKeyText: { color: color.text, fontFamily: font.bold, fontSize: 18 },
  kbKeyTextDark: { color: "#000", fontFamily: font.bold, fontSize: 14 },
  kbKeyWide: { minWidth: 96 },
  kbKeyWide2: { minWidth: 130 },
  kbKeyGold: { backgroundColor: TV_GOLD, borderColor: TV_GOLD },
  kbHint: { color: color.dim, fontSize: 11, marginTop: 10 },
});
