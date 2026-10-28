import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { PosterCard } from "../components/PosterCard";
import { StateView } from "../components/StateView";
import { TopBar } from "../components/TopBar";
import { useCatalog } from "../lib/catalog";
import { Drama, displayTitle, normalize } from "../lib/dramas";
import { openDownloadPage } from "../lib/update";
import { color, contentMaxWidth, font, GRID_COLUMNS, gutter, radius, space, type } from "../theme";

/** Browse: search field, category chips, three-column poster grid — the whole archive. */
export function BrowseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const { series, categories, episodeCounts, loading, error, refresh } = useCatalog();
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState(typeof params.q === "string" ? params.q : "");
  const [category, setCategory] = useState<string | null>(typeof params.category === "string" ? params.category : null);

  const usable = Math.min(width, contentMaxWidth) - gutter * 2 - space.md * (GRID_COLUMNS - 1);
  const cardWidth = Math.floor(usable / GRID_COLUMNS);

  // One entry per card, but the search index covers every episode in the group: typing a sketch
  // or episode name should find the series even though the card itself shows the series poster.
  const indexed = useMemo(
    () =>
      series
        .filter((g) => g.length > 0)
        .map((g) => ({
          drama: g[0],
          haystack: g
            .flatMap((d) => [displayTitle(d), d.title, d.urdu, d.series, d.cast, d.year, d.writer, d.director])
            .map((v) => normalize(v))
            .join(" "),
        })),
    [series]
  );

  const results = useMemo(() => {
    const q = normalize(query);
    return indexed
      .filter(({ drama, haystack }) => {
        if (category && drama.type !== category) return false;
        return !q || haystack.includes(q);
      })
      .map(({ drama }) => drama);
  }, [indexed, query, category]);

  const openMenu = () => Alert.alert("Classic TV Pakistan", "Choose an option", [
    { text: "Home", onPress: () => router.push("/") },
    { text: "My Library", onPress: () => router.push("/library") },
    { text: "Download Android APK", onPress: openDownloadPage },
    { text: "Cancel", style: "cancel" },
  ]);

  const clearAll = () => {
    setQuery("");
    setCategory(null);
  };

  return (
    <View style={styles.screen}>
      <TopBar brand actions={[{ icon: "bookmark-outline", label: "My library", onPress: () => router.push("/library") }, { icon: "ellipsis-vertical", label: "More options", onPress: openMenu }]} />

      <Pressable
        onPress={openDownloadPage}
        accessibilityRole="button"
        accessibilityLabel="Download Classic TV Pakistan APK"
        style={({ pressed }) => [styles.apkButton, pressed && styles.pressed]}
      >
        <Ionicons name="download-outline" size={19} color={color.ctaText} />
        <Text style={styles.apkButtonText}>Download Android APK</Text>
        <Ionicons name="arrow-forward" size={17} color={color.ctaText} />
      </Pressable>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={color.dim} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles, actors, years"
          placeholderTextColor={color.dim}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search the archive"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={color.dim} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsTrack}
        style={styles.chipsWrap}
      >
        <Pressable onPress={() => setCategory(null)} style={[styles.chip, category === null && styles.chipActive]}>
          <Text style={[styles.chipText, category === null && styles.chipTextActive]}>All</Text>
        </Pressable>
        {categories.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setCategory(cat === category ? null : cat)}
            style={[styles.chip, category === cat && styles.chipActive]}
          >
            <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.countRow}>
        <Text style={styles.count}>
          {results.length} {results.length === 1 ? "title" : "titles"}
        </Text>
        {category ? <Text style={styles.countFilter}>{category}</Text> : null}
      </View>

      {loading && indexed.length === 0 ? (
        <StateView mode="loading" />
      ) : error && indexed.length === 0 ? (
        <StateView mode="error" body={error} actionLabel="Try again" onAction={refresh} />
      ) : results.length === 0 ? (
        <StateView
          mode="empty"
          title={query ? `Nothing matched “${query}”` : "No titles in this category"}
          body={query ? "Try a shorter word, an actor's name, or a year." : "Pick another category to keep browsing."}
          actionLabel="Clear filters"
          onAction={clearAll}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          numColumns={GRID_COLUMNS}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.grid}
          initialNumToRender={9}
          maxToRenderPerBatch={9}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => (
            <PosterCard
              drama={item}
              width={cardWidth}
              episodeCount={episodeCounts[item.id] ?? 1}
              onPress={() => router.push(`/drama/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" },
  apkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    marginHorizontal: gutter,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: color.ctaBg,
  },
  apkButtonText: { color: color.ctaText, fontFamily: font.bold, fontSize: type.meta },
  pressed: { opacity: 0.7 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: gutter,
    paddingHorizontal: space.md,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  input: { flex: 1, color: color.text, fontFamily: font.body, fontSize: type.body, paddingVertical: 0 },
  chipsWrap: { marginTop: space.md, flexGrow: 0, flexShrink: 0, height: 38 },
  chipsTrack: { paddingHorizontal: gutter, gap: space.sm, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    height: 32,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipActive: { borderColor: color.accent, backgroundColor: color.accentSoft },
  chipText: { color: color.muted, fontFamily: font.medium, fontSize: type.meta },
  chipTextActive: { color: color.accent },
  countRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: gutter,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  count: { color: color.text, fontFamily: font.bold, fontSize: type.meta },
  countFilter: { color: color.dim, fontFamily: font.body, fontSize: type.micro },
  grid: { paddingHorizontal: gutter, paddingBottom: space.xxl, gap: space.lg },
  column: { gap: space.md },
});
