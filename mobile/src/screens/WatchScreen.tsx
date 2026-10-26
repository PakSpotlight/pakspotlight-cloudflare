import { Ionicons } from "@expo/vector-icons";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Chip } from "../components/Chip";
import { EpisodeRow } from "../components/EpisodeRow";
import { PillButton } from "../components/PillButton";
import { Player } from "../components/Player";
import { StateView } from "../components/StateView";
import { TopBar } from "../components/TopBar";
import { useCatalog } from "../lib/catalog";
import { displayTitle, episodesLabel, extractYouTubeId, prettyType, seriesEpisodes } from "../lib/dramas";
import { shareTitle } from "../lib/share";
import { recordWatch } from "../lib/storage";
import { openInYouTube, shareUrl } from "../lib/youtube";
import { color, contentMaxWidth, font, gutter, radius, space, type } from "../theme";

/**
 * Player screen.
 *
 * Playback always has a way out: if the embed fails (old Android WebViews are the likeliest
 * cause) the screen swaps to a "Watch on YouTube" action rather than showing a dead black box.
 */
export function WatchScreen() {
  // Keeping the screen on while an episode plays is a nicety, never a reason to crash: some
  // OEM Android builds refuse the wake lock even when the permission is declared. The call is
  // deliberately fire-and-forget and the tag is released on unmount.
  const keepAwakeTag = "watch-screen";
  useEffect(() => {
    void activateKeepAwakeAsync(keepAwakeTag).catch(() => {});
    return () => {
      void deactivateKeepAwake(keepAwakeTag).catch(() => {});
    };
  }, []);

  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; ep?: string }>();
  const { byId, rows, loading } = useCatalog();
  const [failed, setFailed] = useState(false);

  const episode = byId(params.id);
  const seriesEpisodesList = useMemo(() => (episode ? seriesEpisodes(rows, episode) : []), [rows, episode]);
  const index = seriesEpisodesList.findIndex((e) => e.id === episode?.id);
  const next = index >= 0 ? seriesEpisodesList[index + 1] : undefined;
  const previous = index > 0 ? seriesEpisodesList[index - 1] : undefined;
  const videoId = episode ? extractYouTubeId(episode.youtube) : null;

  useEffect(() => {
    setFailed(false);
    if (episode) void recordWatch(episode, seriesEpisodesList.length);
  }, [episode?.id]);

  if (loading && !episode) return <StateView mode="loading" />;
  if (!episode) {
    return (
      <StateView
        mode="empty"
        title="That episode is not in the archive"
        body="It may have been removed on the website."
        actionLabel="Back to browsing"
        onAction={() => router.push("/browse")}
      />
    );
  }

  const episodeNumber = episode.episode ?? (index >= 0 ? index + 1 : null);
  const heading = episodeNumber ? `Episode ${episodeNumber}` : episode.title;

  const onShare = () => {
    void shareTitle(displayTitle(episode), shareUrl(episode.id));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} stickyHeaderIndices={[0]}>
      <View style={styles.headerWrap}>
        <TopBar
          onBack={() => router.back()}
          title={heading}
          subtitle={episode.title !== heading ? episode.title : undefined}
          actions={[{ icon: "share-outline", label: "Share", onPress: onShare }]}
        />
      </View>

      <View style={styles.playerBox}>
        {videoId && !failed ? (
          <Player videoId={videoId} onError={() => setFailed(true)} />
        ) : (
          <View style={styles.fallback}>
            <Ionicons name="videocam-off-outline" size={26} color={color.dim} />
            <Text style={styles.fallbackTitle}>
              {videoId ? "This phone can't play the embed" : "No video linked to this episode"}
            </Text>
            <Text style={styles.fallbackBody}>
              {videoId
                ? "Open it in the YouTube app instead — same episode, better playback on older devices."
                : "The archive entry is missing a YouTube link. Report it on the website."}
            </Text>
            {videoId ? (
              <PillButton label="Watch on YouTube" icon="logo-youtube" onPress={() => openInYouTube(videoId)} />
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.metaBlock}>
        <View style={styles.chips}>
          {episodeNumber ? <Chip label={`Episode ${episodeNumber}`} tone="accent" /> : null}
          {episode.year ? <Chip label={episode.year} /> : null}
          <Chip label={prettyType(episode.type)} />
          {seriesEpisodesList.length > 1 ? <Chip label={episodesLabel(episode, seriesEpisodesList.length)} /> : null}
        </View>

        <View style={styles.navRow}>
          <PillButton
            label="Previous"
            variant="ghost"
            size="md"
            icon="play-skip-back"
            onPress={() => previous && router.replace(`/watch/${previous.id}`)}
            disabled={!previous}
            style={styles.navButton}
          />
          <PillButton
            label="Next episode"
            size="md"
            icon="play-skip-forward"
            onPress={() => next && router.replace(`/watch/${next.id}`)}
            disabled={!next}
            style={styles.navButton}
          />
        </View>

        {videoId ? (
          <Pressable onPress={() => openInYouTube(videoId)} style={styles.ytLink} hitSlop={8}>
            <Ionicons name="logo-youtube" size={16} color={color.muted} />
            <Text style={styles.ytText}>Open in the YouTube app</Text>
          </Pressable>
        ) : null}
      </View>

      {seriesEpisodesList.length > 1 ? (
        <View style={styles.rail}>
          <Text style={styles.railTitle}>Episodes</Text>
          {seriesEpisodesList.map((e, i) => (
            <EpisodeRow
              key={e.id}
              episode={e}
              fallbackIndex={i}
              active={e.id === episode.id}
              onPress={() => router.replace(`/watch/${e.id}`)}
            />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" },
  content: { paddingBottom: space.xxl },
  headerWrap: { backgroundColor: color.bg },
  playerBox: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl, gap: space.sm },
  fallbackTitle: { color: color.text, fontFamily: font.bold, fontSize: type.body, textAlign: "center" },
  fallbackBody: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: type.meta,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: space.sm,
  },
  metaBlock: { paddingHorizontal: gutter, paddingTop: space.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  navRow: { flexDirection: "row", gap: space.md, marginTop: space.lg },
  navButton: { flex: 1 },
  ytLink: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.lg },
  ytText: { color: color.muted, fontFamily: font.medium, fontSize: type.meta },
  rail: { paddingHorizontal: gutter, marginTop: space.xl },
  railTitle: { color: color.text, fontFamily: font.extra, fontSize: type.h3, marginBottom: space.sm },
});
