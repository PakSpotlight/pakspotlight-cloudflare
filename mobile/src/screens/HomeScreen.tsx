import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Hero } from "../components/Hero";
import { SectionRow } from "../components/SectionRow";
import { HomeSkeleton, StateView } from "../components/StateView";
import { TopBar } from "../components/TopBar";
import { useCatalog } from "../lib/catalog";
import { Drama, episodesLabel, metaLine, seriesStartId } from "../lib/dramas";
import { getHistory, HistoryEntry } from "../lib/storage";
import { APP_VERSION, checkForUpdate, openApk, openDownloadPage, sendLaunchPing, UpdateInfo } from "../lib/update";
import { color, contentMaxWidth, font, gutter, space, type } from "../theme";

type Section = {
  key: string;
  title: string;
  items: Drama[];
  onSeeAll?: () => void;
};

/**
 * Home. Hero first, then Continue watching, the curated Featured row, then one row per category.
 * The Roman-Urdu brush line appears on exactly one section — the first one rendered — because the
 * accent is spent once per screen (docs/android-app-plan.md §7.2).
 */
export function HomeScreen() {
  const router = useRouter();
  const {
    catalog,
    rows,
    series,
    categories,
    episodeCounts,
    heroCandidates,
    loading,
    refreshing,
    error,
    refresh,
    byId,
  } = useCatalog();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useFocusEffect(
    useCallback(() => {
      void getHistory().then(setHistory);
    }, [])
  );

  useEffect(() => {
    void sendLaunchPing();
    void checkForUpdate().then(setUpdate);
  }, []);

  const openMenu = () => Alert.alert("Classic TV Pakistan", "Choose an option", [
    { text: "Browse dramas", onPress: () => router.push("/browse") },
    { text: "My Library", onPress: () => router.push("/library") },
    { text: "Download Android APK", onPress: openDownloadPage },
    { text: "Cancel", style: "cancel" },
  ]);

  const openDrama = (drama: Drama) => router.push(`/drama/${drama.id}`);
  const playDrama = (drama: Drama) => {
    const target = seriesStartId(rows, drama);
    if (target) router.push(`/watch/${target}`);
  };

  useEffect(() => {
    if (heroCandidates.length < 2) return;
    const timer = setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroCandidates.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [heroCandidates.length]);

  const hero = heroCandidates.length ? heroCandidates[heroIndex % heroCandidates.length] : undefined;
  const heroGroup = hero ? series.find((g) => g.some((e) => e.id === hero.id)) : undefined;
  const heroCount = heroGroup ? heroGroup.length : 1;

  const continueItems = history.map((h) => byId(h.id)).filter((d): d is Drama => !!d);

  const featured = (catalog ? catalog.featuredIds : [])
    .map((id) => rows.find((r) => r.id === id))
    .filter((d): d is Drama => !!d);

  const categoryRows = categories
    .map((cat) => ({
      category: cat,
      items: series.filter((g) => g[0].type === cat).slice(0, 12).map((g) => g[0]),
    }))
    .filter((row) => row.items.length > 0);

  const sections: Section[] = [];
  if (continueItems.length > 0) {
    sections.push({
      key: "continue",
      title: "Continue watching",
      items: continueItems,
      onSeeAll: () => router.push("/library"),
    });
  }
  if (featured.length > 0) {
    sections.push({
      key: "featured",
      title: "Featured this week",
      items: featured,
      onSeeAll: () => router.push("/browse"),
    });
  }
  for (const row of categoryRows) {
    sections.push({
      key: `cat-${row.category}`,
      title: row.category,
      items: row.items,
      onSeeAll: () => router.push({ pathname: "/browse", params: { category: row.category } }),
    });
  }
  if (loading && !catalog) return <HomeSkeleton />;

  if (error && !catalog) {
    return (
      <StateView
        mode="error"
        title="Can't reach the archive"
        body={error}
        actionLabel="Try again"
        onAction={refresh}
      />
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={color.accent} colors={[color.accent]} />
      }
    >
      <TopBar
        brand
        actions={[
          { icon: "search", label: "Search the archive", onPress: () => router.push("/browse") },
          { icon: "bookmark-outline", label: "My library", onPress: () => router.push("/library") },
          { icon: "ellipsis-vertical", label: "More options", onPress: openMenu },
        ]}
      />

      {update ? (
        <Pressable
          onPress={() => openApk(update)}
          accessibilityRole="button"
          accessibilityLabel={`Download version ${update.versionName}`}
          style={({ pressed }) => [styles.updateBanner, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-down-circle" size={18} color={color.accent} />
          <Text style={styles.updateText}>
            Version {update.versionName} is ready{update.sizeMB ? ` · ${update.sizeMB} MB` : ""}
          </Text>
          <Text style={styles.updateAction}>Download</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={openDownloadPage}
        accessibilityRole="button"
        accessibilityLabel="Download Classic TV Pakistan APK"
        style={({ pressed }) => [styles.apkButton, pressed && styles.pressed]}
      >
        <Ionicons name="download-outline" size={21} color={color.ctaText} />
        <Text style={styles.apkButtonText}>Download Android APK</Text>
        <Ionicons name="arrow-forward" size={18} color={color.ctaText} />
      </Pressable>

      {catalog && catalog.stale ? (
        <View style={styles.offlineNote}>
          <Ionicons name="cloud-offline-outline" size={14} color={color.dim} />
          <Text style={styles.offlineText}>Showing the copy saved on this phone</Text>
        </View>
      ) : null}

      {hero ? (
        <Hero
          drama={hero}
          meta={metaLine(hero, [hero.year, episodesLabel(hero, heroCount)])}
          ctaLabel={heroCount > 1 ? "Play episode 1" : "Play"}
          onPlay={() => playDrama(hero)}
        />
      ) : null}

      {sections.map((section) => (
        <SectionRow
          key={section.key}
          title={section.title}
          items={section.items}
          episodeCounts={episodeCounts}
          onPressItem={openDrama}
          onSeeAll={section.onSeeAll}
        />
      ))}

      {!loading && sections.length === 0 ? (
        <StateView
          mode="empty"
          title="The archive is empty"
          body="Add a drama on the website and it will appear here."
        />
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Classic TV Pakistan · v{APP_VERSION}</Text>
        <Text style={styles.footerText}>Preserving the golden age of Pakistani television</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" },
  content: { paddingBottom: space.xxl },
  apkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    marginHorizontal: gutter,
    marginBottom: space.lg,
    paddingHorizontal: space.lg,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: color.ctaBg,
  },
  apkButtonText: { color: color.ctaText, fontFamily: font.bold, fontSize: type.body },
  updateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: gutter,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  updateText: { flex: 1, color: color.text, fontFamily: font.medium, fontSize: type.meta },
  updateAction: { color: color.accent, fontFamily: font.bold, fontSize: type.meta },
  pressed: { opacity: 0.7 },
  offlineNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: gutter,
    marginBottom: space.md,
  },
  offlineText: { color: color.dim, fontFamily: font.body, fontSize: type.micro },
  footer: { paddingHorizontal: gutter, paddingTop: space.xxl, gap: 2 },
  footerText: { color: color.dim, fontFamily: font.body, fontSize: type.micro },
});
