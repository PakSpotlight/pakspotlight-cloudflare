import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
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
            ref.scrollToOffset({ offset: Math.max(0, row * (entry.rowStride ?? 0)), animated: false });
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
  const [episode, setEpisode] = useState<Drama | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [playerFailed, setPlayerFailed] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [playerFullscreen, setPlayerFullscreen] = useState(true);
  const [playerControlsVisible, setPlayerControlsVisible] = useState(false);
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

  // Native TV remote events: the first OK/select press while video is immersive
  // reveals the app controls; subsequent OK presses activate the focused control.
  useTVEventHandler((event) => {
    if (page !== "player" || !playerFullscreen) return;
    if (event.eventType === "select") setPlayerControlsVisible(true);
    else if (event.eventType === "left") {
      playerRef.current?.seekBy(-10);
      setPlayerControlsVisible(true);
    } else if (event.eventType === "right") {
      playerRef.current?.seekBy(10);
      setPlayerControlsVisible(true);
    } else if (event.eventType === "playPause") {
      playerRef.current?.playPause();
      setPlayerControlsVisible(true);
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
        setPlayerFullscreen(false);
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
    setPlayerFullscreen(true);
    setPlayerControlsVisible(false);
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
    setPage(detailsFrom);
    setNav(detailsFrom);
  };

  const closeKb = () => {
    setShowKb(false);
    tvRequestFocus(searchRef);
  };

  const currentGroup = selected ? groupFor(selected) : [];
  const videoId = episode ? extractYouTubeId(episode.youtube) : null;
  const cardWidth = Math.max(220, Math.min(290, Math.round((width - 260) / 4)));
  const gridCols = Math.max(1, Math.floor((width - 150) / (cardWidth + 14)));
  const gridRowStride = Math.round(cardWidth * 9 / 16) + 84;

  return (
    <View style={[styles.screen, page === "player" && styles.fullscreenScreen]}>
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
              ref={(r) => { if (r) tvScrollables.set("homeScroll", { ref: r, kind: "scroll", axis: "y" }); }}
              style={styles.pageScroll}
              contentContainerStyle={styles.homeContent}
              showsVerticalScrollIndicator={false}
            >
              {hero ? (
                <View style={[styles.hero, { minHeight: Math.min(320, height * 0.46) }]}>
                  {hero.image ? <Image source={{ uri: hero.image }} style={styles.heroImage} resizeMode="cover" /> : null}
                  <View style={styles.heroScrim} />
                  <View style={styles.heroCopy}>
                    <Text style={styles.eyebrow}>FROM THE CLASSIC ARCHIVE</Text>
                    {hero.urdu ? <Text style={styles.urduTitle}>{hero.urdu}</Text> : null}
                    <Text style={styles.heroTitle} numberOfLines={2}>{displayTitle(hero)}</Text>
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
                {selected.image ? <Image source={{ uri: selected.image }} style={styles.detailImage} resizeMode="cover" /> : <View style={styles.detailImage} />}
                <View style={styles.detailCopy}>
                  <Text style={styles.eyebrow}>{selected.type.toUpperCase()}</Text>
                  {selected.urdu ? <Text style={styles.urduTitle}>{selected.urdu}</Text> : null}
                  <Text style={styles.detailTitle}>{displayTitle(selected)}</Text>
                  <Text style={styles.heroMeta}>{[selected.year, currentGroup.length > 1 ? `${currentGroup.length} episodes` : "Classic archive"].filter(Boolean).join("  •  ")}</Text>
                  <Text style={styles.description} numberOfLines={5}>{selected.description || "A title from the Classic TV Pakistan archive."}</Text>
                  <View style={styles.actions}>
                    <ActionButton label="Play" icon="play" primary onPress={() => playDrama(selected)} autoFocus showKb={showKb} />
                    <ActionButton label={isSaved(selected) ? "In My List" : "My List"} icon={isSaved(selected) ? "bookmark" : "bookmark-outline"} onPress={() => void toggleSaved(selected)} showKb={showKb} />
                    <ActionButton label="Back" icon="arrow-back" onPress={backFromDetails} showKb={showKb} />
                  </View>
                </View>
              </View>
              {currentGroup.length > 1 ? <Shelf title="Episodes" scrollId="rail:episodes" items={currentGroup} cardWidth={cardWidth} pageScrollId="detailsScroll" episodeCounts={episodeCounts} onSelect={openDetails} onPlay={playDrama} /> : null}
            </ScrollView>
          ) : null}

          {page === "player" && selected && episode ? (
            <View style={[styles.playerPage, playerFullscreen && styles.playerPageFullscreen]}>
              {!playerFullscreen ? <View style={styles.playerTop}>
                <TvPress
                  focusKey="playerBack"
                  autoFocus
                  showKb={showKb}
                  onPress={() => setPage("details")}
                  style={styles.backButton}
                  focusedStyle={styles.focused}
                >
                  <Ionicons name="arrow-back" size={20} color={color.text} />
                  <Text style={styles.actionText}>Back</Text>
                </TvPress>
                <Text style={styles.playerHeading} numberOfLines={1}>{displayTitle(selected)}{episode.episode ? ` · Episode ${episode.episode}` : ""}</Text>
                <TvPress focusKey="playerExpand" showKb={showKb} onPress={() => setPlayerFullscreen(true)} style={styles.playerControl} focusedStyle={styles.focused}><Ionicons name="expand" size={19} color={color.text} /><Text style={styles.playerControlText}>Full screen</Text></TvPress>
              </View> : null}
              <View style={[styles.playerFrame, playerFullscreen && styles.playerFrameFullscreen]}>
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
              {!playerFullscreen ? <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.episodeRail}
                ref={(r) => { if (r) tvScrollables.set("playerRail", { ref: r, kind: "scroll", axis: "x" }); }}
              >
                {currentGroup.map((ep, i) => <EpisodeButton key={ep.id} episode={ep} number={i + 1} index={i} selected={episode.id === ep.id} onPress={() => { void requestEpisode(ep); }} showKb={showKb} />)}
              </ScrollView> : null}
              {playerFullscreen && playerControlsVisible ? <TVFocusGuideView autoFocus style={styles.playerOverlayControls}>
                <TvPress focusKey="playerExitFullscreen" autoFocus showKb={showKb} onPress={() => setPlayerFullscreen(false)} style={styles.playerControl} focusedStyle={styles.focused}><Ionicons name="contract" size={19} color={color.text} /><Text style={styles.playerControlText}>Episodes / Exit full screen</Text></TvPress>
                <TvPress focusKey="playerOverlayBack" showKb={showKb} onPress={() => { setPlayerFullscreen(false); setPage("details"); }} style={styles.playerControl} focusedStyle={styles.focused}><Ionicons name="arrow-back" size={19} color={color.text} /><Text style={styles.playerControlText}>Back</Text></TvPress>
              </TVFocusGuideView> : null}
              {playerFullscreen && playerControlsVisible ? <TVFocusGuideView autoFocus style={styles.playerBottomControls}>
                <View style={styles.playerProgressRow}>
                  <Text style={styles.playerTime}>{formatPlayerTime(playerProgress.currentTime)}</Text>
                  <View style={styles.playerProgressTrack}>
                    <View style={[styles.playerProgressFill, { width: `${Math.max(0, Math.min(100, playerProgress.duration > 0 ? playerProgress.currentTime / playerProgress.duration * 100 : 0))}%` }]} />
                  </View>
                  <Text style={styles.playerTime}>{formatPlayerTime(playerProgress.duration)}</Text>
                </View>
                <View style={styles.playerActionsRow}>
                  <TvPress focusKey="playerRewind" showKb={showKb} onPress={() => playerRef.current?.seekBy(-10)} style={styles.playerControl} focusedStyle={styles.focused}>
                    <Ionicons name="play-back" size={20} color={color.text} /><Text style={styles.playerControlText}>10 sec</Text>
                  </TvPress>
                  <TvPress focusKey="playerToggle" showKb={showKb} onPress={() => playerRef.current?.playPause()} style={styles.playerControl} focusedStyle={styles.focused}>
                    <Ionicons name={playerProgress.state === 1 ? "pause" : "play"} size={20} color={color.text} /><Text style={styles.playerControlText}>{playerProgress.state === 1 ? "Pause" : "Play"}</Text>
                  </TvPress>
                  <TvPress focusKey="playerForward" showKb={showKb} onPress={() => playerRef.current?.seekBy(10)} style={styles.playerControl} focusedStyle={styles.focused}>
                    <Ionicons name="play-forward" size={20} color={color.text} /><Text style={styles.playerControlText}>10 sec</Text>
                  </TvPress>
                </View>
              </TVFocusGuideView> : null}
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
              <View style={styles.exitActions}>
                <Pressable hasTVPreferredFocus focusable onPress={() => {
                  if (resumePrompt) {
                    const next = resumePrompt.episode;
                    void clearTvPlaybackProgress(extractYouTubeId(next.youtube) || "");
                    launchEpisode(next, 0);
                  }
                }} style={({ pressed }) => [styles.exitButton, styles.exitStay, pressed && styles.pressed]}>
                  <Text style={styles.exitStayText}>START OVER</Text>
                </Pressable>
                <Pressable focusable onPress={() => {
                  if (resumePrompt) launchEpisode(resumePrompt.episode, resumePrompt.seconds);
                }} style={({ pressed }) => [styles.exitButton, styles.exitConfirm, pressed && styles.pressed]}>
                  <Text style={styles.exitConfirmText}>RESUME</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={exitDialogVisible} transparent animationType="fade" onRequestClose={() => setExitDialogVisible(false)}>
          <View style={styles.exitBackdrop}>
            <View style={styles.exitCard}>
              <Ionicons name="tv-outline" size={34} color={TV_GOLD} />
              <Text style={styles.exitTitle}>Exit Classic TV Pakistan?</Text>
              <Text style={styles.exitMessage}>Are you sure you want to close the app?</Text>
              <View style={styles.exitActions}>
                <Pressable hasTVPreferredFocus focusable onPress={() => setExitDialogVisible(false)} style={({ pressed }) => [styles.exitButton, styles.exitStay, pressed && styles.pressed]}>
                  <Text style={styles.exitStayText}>NO, STAY</Text>
                </Pressable>
                <Pressable focusable onPress={() => { setExitDialogVisible(false); BackHandler.exitApp(); }} style={({ pressed }) => [styles.exitButton, styles.exitConfirm, pressed && styles.pressed]}>
                  <Text style={styles.exitConfirmText}>YES, EXIT</Text>
                </Pressable>
              </View>
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

function Shelf({ title, subtitle, scrollId, items, cardWidth, episodeCounts, pageScrollId, onSelect, onPlay, compact = false }: {
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
}) {
  if (!items.length) return null;
  return (
    <View style={styles.shelf}>
      <View style={styles.shelfHeading}>
        <View><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.shelfSubtitle}>{subtitle}</Text> : null}</View>
        <Text style={styles.shelfCount}>{items.length} TITLES</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        ref={(r) => { if (r) tvScrollables.set(scrollId, { ref: r, kind: "scroll", axis: "x" }); }}
      >
        {items.map((drama) => (
          <PosterTile
            key={drama.id}
            drama={drama}
            width={compact ? Math.round(cardWidth * 0.8) : cardWidth}
            episodeCount={episodeCounts[drama.id] ?? 1}
            scrollIds={[scrollId, pageScrollId].filter(Boolean) as string[]}
            onPress={() => onSelect(drama)}
            onPlay={() => onPlay(drama)}
            compact={compact}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function PosterTile({ drama, width, episodeCount, onPress, onPlay, compact = false, scrollId, scrollIds, index, autoFocus }: {
  drama: Drama;
  width: number;
  episodeCount: number;
  onPress: () => void;
  onPlay: () => void;
  compact?: boolean;
  scrollId?: string;
  scrollIds?: string[];
  index?: number;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const tv = useTvItem(`poster:${drama.id}`, { scrollIds: scrollIds ?? scrollId, itemIndex: index });
  return (
    <Pressable
      ref={tv.ref}
      focusable
      {...tvFocusProps(!!autoFocus)}
      onFocus={() => { tv.onFocus(); setFocused(true); }}
      onBlur={() => { tv.onBlur(); setFocused(false); }}
      onPress={onPress}
      onLongPress={onPlay}
      accessibilityRole="button"
      accessibilityLabel={displayTitle(drama)}
      style={({ pressed }) => [styles.posterTile, { width }, focused && styles.posterFocused, pressed && styles.pressed]}
    >
      <View style={[styles.posterFrame, { height: Math.round(width * 9 / 16) }, !focused && styles.posterDimmed]}>
        {drama.image ? <Image source={{ uri: drama.image }} style={[styles.poster, focused && styles.posterLit]} resizeMode="cover" /> : <View style={styles.posterFallback}><Ionicons name="film-outline" size={28} color={color.muted} /></View>}
        {episodeCount > 1 ? <View style={styles.posterBadge}><Text style={styles.badgeText}>{episodeCount} EPS</Text></View> : null}
      </View>
      <Text style={[styles.posterTitle, focused && styles.posterTitleLit]} numberOfLines={2}>{displayTitle(drama)}</Text>
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
  exitButton: { minWidth: 140, minHeight: 52, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderWidth: 2, borderColor: "transparent" },
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
  navFocused: { borderColor: TV_GOLD, borderWidth: 3, backgroundColor: "rgba(216,177,90,0.24)", elevation: 7, transform: [{ scale: 1.04 }] },
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
  heroCopy: { padding: 28, maxWidth: 650, gap: 9 },
  eyebrow: { color: TV_GOLD, fontFamily: font.bold, fontSize: 11, letterSpacing: 1.7 },
  urduTitle: { color: "#fff", fontSize: 22, lineHeight: 42 },
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
  focused: { borderColor: TV_GOLD, borderWidth: 3, backgroundColor: "rgba(216,177,90,0.18)" },
  posterFocused: { transform: [{ scale: 1.045 }], borderColor: TV_GOLD, borderWidth: 4, borderRadius: 14, backgroundColor: "#211B10", shadowColor: TV_GOLD, shadowOpacity: 0.65, shadowRadius: 12, elevation: 12, zIndex: 10 },
  posterLit: { opacity: 1 },
  posterDimmed: { opacity: 0.62 },
  pressed: { opacity: 0.78 },
  focusOutline: { borderWidth: 1, borderColor: "transparent" },
  focusOutlineOn: { borderColor: TV_GOLD },
  shelf: { gap: 12 },
  shelfHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingRight: 4 },
  sectionTitle: { color: color.text, fontFamily: font.bold, fontSize: 21 },
  shelfSubtitle: { color: color.dim, fontSize: 12, marginTop: 3 },
  shelfCount: { color: color.dim, fontFamily: font.bold, fontSize: 10, letterSpacing: 1 },
  rail: { gap: 14, paddingVertical: 8, paddingRight: 8 },
  posterTile: { borderRadius: 10, padding: 4, gap: 6, borderWidth: 2, borderColor: "transparent" },
  posterFrame: { borderRadius: 8, overflow: "hidden", backgroundColor: "#000", aspectRatio: 16 / 9 },
  poster: { width: "100%", height: "100%" },
  posterFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  posterBadge: { position: "absolute", left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.82)" },
  badgeText: { color: "#fff", fontFamily: font.bold, fontSize: 10 },
  posterTitle: { color: color.text, fontFamily: font.bold, fontSize: 14, lineHeight: 18 },
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
  detailImage: { width: 340, height: 191, borderRadius: 12, backgroundColor: color.surfaceAlt },
  detailCopy: { flex: 1, gap: 12, maxWidth: 720 },
  detailTitle: { color: "#fff", fontFamily: font.black, fontSize: 34, lineHeight: 40 },
  description: { color: color.muted, fontSize: 15, lineHeight: 23, maxWidth: 650 },
  playerPage: { flex: 1, minHeight: 0, gap: 0, backgroundColor: "#000" },
  playerPageFullscreen: { ...StyleSheet.absoluteFillObject, zIndex: 50, elevation: 50 },
  playerTop: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 42, paddingHorizontal: 18, paddingTop: 10 },
  playerHeading: { color: color.text, fontFamily: font.bold, fontSize: 17, flex: 1 },
  playerHint: { color: color.dim, fontSize: 11 },
  playerFrame: { flex: 1, minHeight: 0, width: "100%", backgroundColor: "#000", borderRadius: 0, overflow: "hidden" },
  playerFrameFullscreen: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
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
  episodeRail: { gap: 10, paddingVertical: 10, paddingHorizontal: 18 },
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
  kbKeyFocused: { borderColor: TV_GOLD, borderWidth: 3, backgroundColor: "rgba(216,177,90,0.18)", transform: [{ scale: 1.05 }] },
  kbKeyText: { color: color.text, fontFamily: font.bold, fontSize: 18 },
  kbKeyTextDark: { color: "#000", fontFamily: font.bold, fontSize: 14 },
  kbKeyWide: { minWidth: 96 },
  kbKeyWide2: { minWidth: 130 },
  kbKeyGold: { backgroundColor: TV_GOLD, borderColor: TV_GOLD },
  kbHint: { color: color.dim, fontSize: 11, marginTop: 10 },
});
