import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Player } from "../components/Player";
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

export function TvApp() {
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
  const [page, setPage] = useState<TvPage>("home");
  const [detailsFrom, setDetailsFrom] = useState<NavItem>("home");
  const [nav, setNav] = useState<NavItem>("home");
  const [selected, setSelected] = useState<Drama | null>(null);
  const [episode, setEpisode] = useState<Drama | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [playerFailed, setPlayerFailed] = useState(false);
  const [clearFocused, setClearFocused] = useState(false);
  const [playerBackFocused, setPlayerBackFocused] = useState(false);

  // Android TV's hardware Back key must follow the same screen stack as the on-screen Back button.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
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
      return false;
    });
    return () => subscription.remove();
  }, [page, detailsFrom, nav]);

  const hero = heroCandidates[0] ?? series[0]?.[0] ?? null;
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

  const playDrama = (drama: Drama) => {
    const startId = seriesStartId(rows, drama);
    const first = rows.find((row) => row.id === startId) ?? drama;
    setSelected(drama);
    setEpisode(first);
    setPlayerFailed(false);
    setPage("player");
  };

  const openNav = (next: NavItem) => {
    setNav(next);
    setPage(next);
    setSelected(null);
    setEpisode(null);
  };

  const backFromDetails = () => {
    setPage(detailsFrom);
    setNav(detailsFrom);
  };

  const currentGroup = selected ? groupFor(selected) : [];
  const videoId = episode ? extractYouTubeId(episode.youtube) : null;
  const cardWidth = Math.max(142, Math.min(194, Math.round((width - 300) / 6)));

  return (
    <View style={[styles.screen, page === "player" && styles.fullscreenScreen]}>
      {page !== "player" ? <View style={styles.sidebar}>
        <View style={styles.brandMark}>
          <View style={styles.brandGlyph}><Ionicons name="tv-outline" size={20} color="#000" /><View style={styles.brandPlay}><Ionicons name="play" size={9} color="#000" /></View></View>
          <Text style={styles.brandText}>CLASSIC TV<Text style={styles.brandPakistan}> PAKISTAN</Text></Text>
        </View>
        <View style={styles.navItems}>
          <NavButton label="Home" icon="home-outline" active={nav === "home" && page !== "details"} onPress={() => openNav("home")} />
          <NavButton label="Browse" icon="grid-outline" active={nav === "browse" || page === "details"} onPress={() => openNav("browse")} />
          <NavButton label="My List" icon="bookmark-outline" active={nav === "library"} onPress={() => openNav("library")} />
          <NavButton label="Info" icon="information-circle-outline" active={page === "info"} onPress={() => openNav("info")} />
          <NavButton label="Update" icon="refresh-outline" active={false} onPress={() => { void refresh(); setNav("home"); setPage("home"); }} />
        </View>
        <View style={styles.sidebarFooter}>
          <Text style={styles.sidebarCaption}>THE ARCHIVE</Text>
          <Text style={styles.sidebarSmall}>Classic Pakistani television, all in one place.</Text>
          {catalog?.stale ? <Text style={styles.offline}>Offline catalogue</Text> : null}
        </View>
      </View> : null}

      <View style={[styles.main, page === "player" && styles.fullscreenMain]}>
        {page !== "player" ? <View style={styles.topline}>
          <Text style={styles.pageLabel}>{page === "details" ? "TITLE DETAILS" : page === "browse" ? "EXPLORE THE ARCHIVE" : page === "library" ? "YOUR SAVED TITLES" : page === "info" ? "ABOUT CLASSIC TV PAKISTAN" : "CLASSIC TV PAKISTAN"}</Text>
          <View style={styles.topRight}>
            <Text style={styles.countText}>{rows.length.toLocaleString()} archive entries</Text>
            <View style={styles.statusDot} />
          </View>
        </View> : null}

        {page === "home" ? (
          <ScrollView style={styles.pageScroll} contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
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
                    <ActionButton label="Play" icon="play" primary onPress={() => playDrama(hero)} />
                    <ActionButton label="Details" icon="information-circle-outline" onPress={() => openDetails(hero)} />
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyHero}><Text style={styles.heroTitle}>{loading ? "Loading the archive…" : "Classic TV Pakistan"}</Text><Text style={styles.bodyText}>{error ?? "Browse the collection of classic Pakistani television."}</Text></View>
            )}
            {loading && !catalog ? <Text style={styles.bodyText}>Connecting to the archive…</Text> : null}
            <Shelf title="Featured classics" subtitle="A selection from the archive" items={featured} cardWidth={cardWidth} episodeCounts={episodeCounts} onSelect={openDetails} onPlay={playDrama} />
            {categories.map((cat) => {
              const items = series.filter((group) => group[0]?.type === cat).slice(0, 14).map((group) => group[0]);
              return items.length ? <Shelf key={cat} title={cat} items={items} cardWidth={cardWidth} episodeCounts={episodeCounts} onSelect={openDetails} onPlay={playDrama} /> : null;
            })}
            {error && !catalog ? <ActionButton label="Retry loading archive" icon="refresh" onPress={refresh} /> : null}
          </ScrollView>
        ) : null}

        {page === "browse" ? (
          <View style={styles.fill}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={22} color={color.muted} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search dramas, actors, years…" placeholderTextColor={color.dim} style={styles.searchInput} returnKeyType="search" />
              {query ? <Pressable focusable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")} onFocus={() => setClearFocused(true)} onBlur={() => setClearFocused(false)} style={[styles.clearButton, clearFocused && styles.focused]}><Ionicons name="close" size={20} color={color.text} /></Pressable> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <FilterButton label="All" active={!category} onPress={() => setCategory(null)} />
              {categories.map((cat) => <FilterButton key={cat} label={cat} active={category === cat} onPress={() => setCategory(category === cat ? null : cat)} />)}
            </ScrollView>
            <ScrollView style={styles.pageScroll} contentContainerStyle={styles.grid}>
              {filtered.map((drama) => <PosterTile key={drama.id} drama={drama} width={cardWidth} episodeCount={episodeCounts[drama.id] ?? 1} onPress={() => openDetails(drama)} onPlay={() => playDrama(drama)} />)}
              {!filtered.length ? <Text style={styles.bodyText}>{loading ? "Loading titles…" : "No titles match this search."}</Text> : null}
            </ScrollView>
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
            <ActionButton label={loading ? "Updating…" : "Update catalogue"} icon="refresh" primary onPress={() => { void refresh(); }} />
          </View>
        ) : null}

        {page === "library" ? (
          <ScrollView style={styles.pageScroll} contentContainerStyle={styles.grid}>
            {library.map((drama) => <PosterTile key={drama.id} drama={drama} width={cardWidth} episodeCount={episodeCounts[drama.id] ?? 1} onPress={() => openDetails(drama)} onPlay={() => playDrama(drama)} />)}
            {!library.length ? <View style={styles.emptyState}><Ionicons name="bookmark-outline" size={38} color={color.muted} /><Text style={styles.sectionTitle}>Your list is empty</Text><Text style={styles.bodyText}>Open a title and choose “My List” to save it here.</Text><ActionButton label="Browse archive" icon="grid-outline" onPress={() => openNav("browse")} /></View> : null}
          </ScrollView>
        ) : null}

        {page === "details" && selected ? (
          <ScrollView style={styles.pageScroll} contentContainerStyle={styles.detailContent}>
            <View style={styles.detailHero}>
              {selected.image ? <Image source={{ uri: selected.image }} style={styles.detailImage} resizeMode="cover" /> : <View style={styles.detailImage} />}
              <View style={styles.detailCopy}>
                <Text style={styles.eyebrow}>{selected.type.toUpperCase()}</Text>
                {selected.urdu ? <Text style={styles.urduTitle}>{selected.urdu}</Text> : null}
                <Text style={styles.detailTitle}>{displayTitle(selected)}</Text>
                <Text style={styles.heroMeta}>{[selected.year, currentGroup.length > 1 ? `${currentGroup.length} episodes` : "Classic archive"].filter(Boolean).join("  •  ")}</Text>
                <Text style={styles.description} numberOfLines={5}>{selected.description || "A title from the Classic TV Pakistan archive."}</Text>
                <View style={styles.actions}>
                  <ActionButton label="Play" icon="play" primary onPress={() => playDrama(selected)} />
                  <ActionButton label={isSaved(selected) ? "In My List" : "My List"} icon={isSaved(selected) ? "bookmark" : "bookmark-outline"} onPress={() => void toggleSaved(selected)} />
                  <ActionButton label="Back" icon="arrow-back" onPress={backFromDetails} />
                </View>
              </View>
            </View>
            {currentGroup.length > 1 ? <Shelf title="Episodes" items={currentGroup} cardWidth={cardWidth} episodeCounts={episodeCounts} onSelect={(ep) => { setEpisode(ep); setPlayerFailed(false); setPage("player"); }} onPlay={(ep) => { setEpisode(ep); setPlayerFailed(false); setPage("player"); }} compact /> : null}
          </ScrollView>
        ) : null}

        {page === "player" && selected && episode ? (
          <View style={styles.playerPage}>
            <View style={styles.playerTop}>
              <Pressable focusable onPress={() => setPage("details")} onFocus={() => setPlayerBackFocused(true)} onBlur={() => setPlayerBackFocused(false)} style={[styles.backButton, playerBackFocused && styles.focused]}><Ionicons name="arrow-back" size={20} color={color.text} /><Text style={styles.actionText}>Back</Text></Pressable>
              <Text style={styles.playerHeading} numberOfLines={1}>{displayTitle(selected)}{episode.episode ? ` · Episode ${episode.episode}` : ""}</Text>
            </View>
            <View style={styles.playerFrame}>
              {videoId && !playerFailed ? <Player key={videoId} videoId={videoId} onError={() => setPlayerFailed(true)} /> : <View style={styles.playerError}><Ionicons name="logo-youtube" size={44} color="#FF5252" /><Text style={styles.sectionTitle}>Playback unavailable here</Text><Text style={styles.bodyText}>Try another episode or check the YouTube link.</Text><ActionButton label="Back to episodes" icon="arrow-back" onPress={() => setPage("details")} />{videoId ? <ActionButton label="Watch on YouTube" icon="logo-youtube" onPress={() => void openInYouTube(videoId)} /> : null}</View>}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.episodeRail}>
              {currentGroup.map((ep, i) => <EpisodeButton key={ep.id} episode={ep} number={i + 1} selected={episode.id === ep.id} onPress={() => { setEpisode(ep); setPlayerFailed(false); }} />)}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );

}


function NavButton({ label, icon, active, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return <Pressable focusable onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress} style={[styles.navButton, active && styles.navActive, focused && styles.focused]}><Ionicons name={icon} size={22} color={active ? TV_GOLD : color.muted} /><Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text></Pressable>;
}

function ActionButton({ label, icon, primary = false, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; primary?: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return <Pressable focusable onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress} style={({ pressed }) => [styles.actionButton, primary && styles.actionPrimary, focused && styles.focused, pressed && styles.pressed]}><Ionicons name={icon} size={18} color={primary ? "#000" : color.text} /><Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text></Pressable>;
}

function FilterButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return <Pressable focusable onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress} style={[styles.filter, active && styles.filterActive, focused && styles.focused]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>;
}

function EpisodeButton({ episode, number, selected, onPress }: { episode: Drama; number: number; selected: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return <Pressable focusable onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress} style={[styles.episodeChip, selected && styles.episodeSelected, focused && styles.focused]}><Text style={styles.episodeNumber}>{episode.episode ?? number}</Text><Text style={styles.episodeTitle} numberOfLines={1}>{episode.title}</Text></Pressable>;
}

function Shelf({ title, subtitle, items, cardWidth, episodeCounts, onSelect, onPlay, compact = false }: { title: string; subtitle?: string; items: Drama[]; cardWidth: number; episodeCounts: Record<number, number>; onSelect: (drama: Drama) => void; onPlay: (drama: Drama) => void; compact?: boolean }) {
  if (!items.length) return null;
  return <View style={styles.shelf}><View style={styles.shelfHeading}><View><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.shelfSubtitle}>{subtitle}</Text> : null}</View><Text style={styles.shelfCount}>{items.length} TITLES</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{items.map((drama) => <PosterTile key={drama.id} drama={drama} width={compact ? Math.round(cardWidth * 0.8) : cardWidth} episodeCount={episodeCounts[drama.id] ?? 1} onPress={() => onSelect(drama)} onPlay={() => onPlay(drama)} compact={compact} />)}</ScrollView></View>;
}

function PosterTile({ drama, width, episodeCount, onPress, onPlay, compact = false }: { drama: Drama; width: number; episodeCount: number; onPress: () => void; onPlay: () => void; compact?: boolean }) {
  const [focused, setFocused] = useState(false);
  return <Pressable focusable onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress} onLongPress={onPlay} accessibilityRole="button" accessibilityLabel={displayTitle(drama)} style={({ pressed }) => [styles.posterTile, { width }, focused && styles.posterFocused, pressed && styles.pressed]}><View style={[styles.posterFrame, { height: Math.round(width * 1.36) }]}>{drama.image ? <Image source={{ uri: drama.image }} style={styles.poster} resizeMode="cover" /> : <View style={styles.posterFallback}><Ionicons name="film-outline" size={30} color={color.dim} /></View>}{episodeCount > 1 ? <View style={styles.posterBadge}><Text style={styles.badgeText}>{episodeCount} EPS</Text></View> : null}</View><Text style={styles.posterTitle} numberOfLines={2}>{displayTitle(drama)}</Text>{!compact && drama.year ? <Text style={styles.posterYear}>{drama.year}</Text> : null}</Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: "row", backgroundColor: "#050606" },
  fullscreenScreen: { flexDirection: "column", padding: 0 },
  sidebar: { width: 148, paddingTop: 22, paddingHorizontal: 10, paddingBottom: 16, borderRightWidth: 1, borderRightColor: color.line, backgroundColor: "#080A09" },
  brandMark: { flexDirection: "row", alignItems: "center", gap: 7, paddingBottom: 24, paddingHorizontal: 2 },
  brandGlyph: { width: 30, height: 30, borderRadius: 8, backgroundColor: TV_GOLD, alignItems: "center", justifyContent: "center" },
  brandPlay: { position: "absolute", right: 2, bottom: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  brandText: { color: color.text, fontFamily: font.black, fontSize: 9, letterSpacing: 0.1 },
  brandPakistan: { color: color.muted, fontFamily: font.medium },
  navItems: { gap: 5 },
  navButton: { minHeight: 44, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: "transparent" },
  navActive: { backgroundColor: "rgba(216,177,90,0.12)", borderColor: "rgba(216,177,90,0.35)" },
  navText: { color: color.muted, fontFamily: font.medium, fontSize: 13 },
  navTextActive: { color: color.text, fontFamily: font.bold },
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
  actionButton: { minHeight: 48, minWidth: 124, borderRadius: 10, paddingHorizontal: 20, gap: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#202522", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  actionPrimary: { backgroundColor: "#fff", borderColor: "#fff" },
  actionText: { color: color.text, fontFamily: font.bold, fontSize: 15 },
  actionTextPrimary: { color: "#000" },
  focused: { borderColor: TV_GOLD, borderWidth: 3, backgroundColor: "rgba(216,177,90,0.18)" },
  posterFocused: { transform: [{ scale: 1.055 }], borderColor: TV_GOLD, borderWidth: 3, borderRadius: 14, backgroundColor: "#211B10", shadowColor: TV_GOLD, shadowOpacity: 0.45, shadowRadius: 9, elevation: 8 },
  pressed: { opacity: 0.78 },
  shelf: { gap: 12 },
  shelfHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingRight: 4 },
  sectionTitle: { color: color.text, fontFamily: font.bold, fontSize: 21 },
  shelfSubtitle: { color: color.dim, fontSize: 12, marginTop: 3 },
  shelfCount: { color: color.dim, fontFamily: font.bold, fontSize: 10, letterSpacing: 1 },
  rail: { gap: 14, paddingVertical: 8, paddingRight: 8 },
  posterTile: { borderRadius: 12, padding: 4, gap: 7, borderWidth: 2, borderColor: "transparent" },
  posterFrame: { borderRadius: 9, overflow: "hidden", backgroundColor: color.surfaceAlt },
  poster: { width: "100%", height: "100%" },
  posterFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  posterBadge: { position: "absolute", left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.82)" },
  badgeText: { color: "#fff", fontFamily: font.bold, fontSize: 10 },
  posterTitle: { color: color.text, fontFamily: font.bold, fontSize: 14, lineHeight: 18 },
  posterYear: { color: color.dim, fontSize: 12 },
  emptyHero: { minHeight: 180, padding: 28, justifyContent: "center", gap: 10 },
  bodyText: { color: color.muted, fontFamily: font.body, fontSize: 14, lineHeight: 21 },
  fill: { flex: 1 },
  searchBox: { height: 56, borderRadius: 12, borderWidth: 1, borderColor: color.line, backgroundColor: "#101311", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  searchInput: { flex: 1, color: color.text, fontFamily: font.body, fontSize: 17, paddingVertical: 8 },
  clearButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  chips: { gap: 10, paddingBottom: 14, paddingTop: 2 },
  filter: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9, backgroundColor: "#171B18", borderWidth: 1, borderColor: color.line },
  filterActive: { backgroundColor: TV_GOLD, borderColor: TV_GOLD },
  filterText: { color: color.text, fontFamily: font.medium, fontSize: 14 },
  filterTextActive: { color: "#000", fontFamily: font.bold },
  grid: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 14, paddingBottom: 40 },
  emptyState: { width: "100%", minHeight: 280, alignItems: "center", justifyContent: "center", gap: 12 },
  infoPage: { flex: 1, alignItems: "flex-start", justifyContent: "center", gap: 16, paddingHorizontal: 28, paddingBottom: 28, maxWidth: 760 },
  infoMark: { width: 52, height: 52, borderRadius: 14, backgroundColor: TV_GOLD, alignItems: "center", justifyContent: "center" },
  infoTitle: { color: "#fff", fontFamily: font.black, fontSize: 30 },
  infoSubtitle: { color: color.muted, fontFamily: font.medium, fontSize: 16 },
  infoCard: { width: "100%", gap: 8, padding: 18, borderRadius: 12, borderWidth: 1, borderColor: color.line, backgroundColor: "#101311" },
  infoCardTitle: { color: color.text, fontFamily: font.bold, fontSize: 18 },
  detailContent: { paddingBottom: 32, gap: 22 },
  detailHero: { flexDirection: "row", gap: 28, minHeight: 280, alignItems: "center" },
  detailImage: { width: 210, height: 290, borderRadius: 12, backgroundColor: color.surfaceAlt },
  detailCopy: { flex: 1, gap: 12, maxWidth: 720 },
  detailTitle: { color: "#fff", fontFamily: font.black, fontSize: 34, lineHeight: 40 },
  description: { color: color.muted, fontSize: 15, lineHeight: 23, maxWidth: 650 },
  playerPage: { flex: 1, gap: 0, backgroundColor: "#000" },
  playerTop: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 42 },
  playerHeading: { color: color.text, fontFamily: font.bold, fontSize: 17, flex: 1 },
  playerHint: { color: color.dim, fontSize: 11 },
  playerFrame: { flex: 1, minHeight: 0, backgroundColor: "#000", borderRadius: 0, overflow: "hidden" },
  playerError: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  episodeRail: { gap: 10, paddingVertical: 4 },
  episodeChip: { width: 170, minHeight: 52, borderRadius: 9, padding: 9, backgroundColor: "#171B18", borderWidth: 1, borderColor: color.line },
  episodeSelected: { borderColor: TV_GOLD },
  episodeNumber: { color: TV_GOLD, fontFamily: font.bold, fontSize: 11 },
  episodeTitle: { color: color.text, fontSize: 12, marginTop: 3 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
});
