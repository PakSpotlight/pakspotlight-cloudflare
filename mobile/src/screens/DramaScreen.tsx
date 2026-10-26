import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Chip } from "../components/Chip";
import { EpisodeRow } from "../components/EpisodeRow";
import { GhostAction } from "../components/GhostAction";
import { Hero } from "../components/Hero";
import { PosterCard } from "../components/PosterCard";
import { StateView } from "../components/StateView";
import { TopBar } from "../components/TopBar";
import { useCatalog } from "../lib/catalog";
import {
  displayTitle,
  Drama,
  episodesLabel,
  extractYouTubeId,
  metaLine,
  prettyType,
  recommendations,
  seriesEpisodes,
  seriesStartId,
  titleKey,
} from "../lib/dramas";
import { getHistory } from "../lib/storage";
import { shareTitle } from "../lib/share";
import { openInYouTube, shareUrl } from "../lib/youtube";
import { color, contentMaxWidth, font, GRID_COLUMNS, gutter, space, type } from "../theme";

type Tab = "episodes" | "info" | "related";

/** Series / drama detail: hero, the three actions, description, then Episodes · More info · Related. */
export function DramaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; v?: string }>();
  const key = params.id ?? params.v;
  const { byId, rows, series, episodeCounts, isSaved, toggleSaved, loading, error, refresh } = useCatalog();
  const { width } = useWindowDimensions();

  const [tab, setTab] = useState<Tab>("episodes");
  const [expanded, setExpanded] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);
  const [lastWatchedId, setLastWatchedId] = useState<number | null>(null);

  const drama = byId(key);
  const episodes = useMemo(() => (drama ? seriesEpisodes(rows, drama) : []), [rows, drama]);
  const ordered = newestFirst ? [...episodes].reverse() : episodes;
  const related = useMemo(() => (drama ? recommendations(rows, drama, 12) : []), [rows, drama]);

  const loadHistory = useCallback(() => {
    void getHistory().then((entries) => {
      const match = drama ? entries.find((e) => e.key === titleKey(drama)) : undefined;
      setLastWatchedId(match ? match.id : null);
    });
  }, [drama]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Grid math has to respect the same content column the rest of the screen uses, or the third
  // card spills past the right edge on tablets and desktop web.
  const usable = Math.min(width, contentMaxWidth) - gutter * 2 - space.md * (GRID_COLUMNS - 1);
  const cardWidth = Math.floor(usable / GRID_COLUMNS);

  if (loading && !drama) return <StateView mode="loading" />;
  if (!drama) {
    return (
      <StateView
        mode="empty"
        title="That title is not in the archive"
        body="It may have been removed on the website. Browse the archive for something else."
        actionLabel={error ? "Try again" : "Browse the archive"}
        onAction={error ? refresh : () => router.push("/browse")}
      />
    );
  }

  const saved = isSaved(drama);
  const youtubeId = extractYouTubeId(drama.youtube);
  const startId = seriesStartId(rows, drama);
  const playTarget = lastWatchedId && episodes.some((e) => e.id === lastWatchedId) ? lastWatchedId : startId;
  const lastWatchedEpisode = episodes.find((e) => e.id === lastWatchedId);
  const ctaLabel = lastWatchedEpisode
    ? `Continue episode ${lastWatchedEpisode.episode ?? "…"}`
    : episodes.length > 1
    ? "Play episode 1"
    : "Play";

  const onShare = () => {
    void shareTitle(displayTitle(drama), shareUrl(drama.id));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TopBar
        onBack={() => router.back()}
        actions={[
          { icon: "share-outline", label: "Share", onPress: onShare },
          { icon: "home-outline", label: "Home", onPress: () => router.push("/") },
        ]}
      />

      <Hero
        drama={drama}
        meta={metaLine(drama, [drama.year, episodesLabel(drama, episodes.length), prettyType(drama.type)])}
        ctaLabel={ctaLabel}
        onPlay={() => playTarget && router.push(`/watch/${playTarget}`)}
      />

      <View style={styles.actions}>
        <GhostAction
          icon={saved ? "bookmark" : "bookmark-outline"}
          label={saved ? "In my list" : "My list"}
          active={saved}
          onPress={() => {
            void toggleSaved(drama);
          }}
          accessibilityLabel={saved ? "Remove from my list" : "Add to my list"}
        />
        <GhostAction icon="share-social-outline" label="Share" onPress={onShare} />
        <GhostAction
          icon="logo-youtube"
          label="YouTube"
          onPress={() => youtubeId && openInYouTube(youtubeId)}
          accessibilityLabel="Watch on YouTube"
        />
      </View>

      {drama.description ? (
        <View style={styles.description}>
          <Text style={styles.descriptionText} numberOfLines={expanded ? undefined : 3}>
            {drama.description}
          </Text>
          {drama.description.length > 180 ? (
            <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
              <Text style={styles.seeMore}>{expanded ? "Show less" : "See more"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.tabs}>
        <TabButton label={`Episodes (${episodes.length})`} active={tab === "episodes"} onPress={() => setTab("episodes")} />
        <TabButton label="More info" active={tab === "info"} onPress={() => setTab("info")} />
        <TabButton label="Related" active={tab === "related"} onPress={() => setTab("related")} />
      </View>

      {tab === "episodes" ? (
        <View style={styles.tabBody}>
          {episodes.length > 1 ? (
            <Pressable onPress={() => setNewestFirst((v) => !v)} style={styles.sortRow} hitSlop={8}>
              <Ionicons name="swap-vertical" size={14} color={color.muted} />
              <Text style={styles.sortText}>{newestFirst ? "Newest first" : "Oldest first"}</Text>
            </Pressable>
          ) : null}

          {ordered.map((episode, index) => (
            <EpisodeRow
              key={episode.id}
              episode={episode}
              fallbackIndex={newestFirst ? ordered.length - 1 - index : index}
              active={episode.id === lastWatchedId}
              watched={episode.id === lastWatchedId}
              onPress={() => router.push(`/watch/${episode.id}`)}
            />
          ))}
        </View>
      ) : null}

      {tab === "info" ? (
        <View style={styles.tabBody}>
          <InfoRow label="Title" value={displayTitle(drama)} />
          {drama.urdu ? <InfoRow label="Urdu" value={drama.urdu} urdu /> : null}
          <InfoRow label="Type" value={prettyType(drama.type)} />
          {drama.year ? <InfoRow label="Year" value={drama.year} /> : null}
          {drama.writer ? <InfoRow label="Writer" value={drama.writer} /> : null}
          {drama.director ? <InfoRow label="Director" value={drama.director} /> : null}
          {drama.producer ? <InfoRow label="Producer" value={drama.producer} /> : null}
          {drama.music ? <InfoRow label="Music" value={drama.music} /> : null}
          {drama.cast ? <InfoRow label="Cast" value={drama.cast} /> : null}
          <Chip label={`${episodes.length} ${episodes.length === 1 ? "episode" : "episodes"}`} />
        </View>
      ) : null}

      {tab === "related" ? (
        <View style={styles.relatedGrid}>
          {related.map((item) => (
            <PosterCard
              key={item.id}
              drama={item}
              width={cardWidth}
              episodeCount={episodeCounts[item.id] ?? 1}
              onPress={() => router.push(`/drama/${item.id}`)}
            />
          ))}
          {related.length === 0 ? (
            <Text style={styles.emptyRelated}>Nothing else in this category yet.</Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
    </Pressable>
  );
}

function InfoRow({ label, value, urdu }: { label: string; value: string; urdu?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, urdu && styles.urduValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" },
  content: { paddingBottom: space.xxl },
  actions: { flexDirection: "row", justifyContent: "space-around", marginTop: space.xl, paddingHorizontal: space.sm },
  description: { paddingHorizontal: gutter, marginTop: space.xl },
  descriptionText: { color: color.muted, fontFamily: font.body, fontSize: type.meta, lineHeight: 21 },
  seeMore: { color: color.text, fontFamily: font.bold, fontSize: type.meta, marginTop: space.sm },
  tabs: { flexDirection: "row", gap: space.xl, paddingHorizontal: gutter, marginTop: space.xl },
  tab: { paddingBottom: space.sm },
  tabLabel: { color: color.muted, fontFamily: font.medium, fontSize: type.body },
  tabLabelActive: { color: color.text },
  tabUnderline: { height: 2, marginTop: space.sm, borderRadius: 2, backgroundColor: "transparent" },
  tabUnderlineActive: { backgroundColor: color.accent },
  tabBody: { paddingHorizontal: gutter, marginTop: space.md },
  sortRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  sortText: { color: color.muted, fontFamily: font.medium, fontSize: type.meta },
  infoRow: { flexDirection: "row", paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line, gap: space.lg },
  infoLabel: { width: 92, color: color.dim, fontFamily: font.medium, fontSize: type.meta },
  infoValue: { flex: 1, color: color.text, fontFamily: font.body, fontSize: type.meta, lineHeight: 20 },
  urduValue: { fontFamily: font.urdu, fontSize: 17, lineHeight: 34 },
  relatedGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.md, paddingHorizontal: gutter, marginTop: space.lg },
  emptyRelated: { color: color.muted, fontFamily: font.body, fontSize: type.meta },
});
