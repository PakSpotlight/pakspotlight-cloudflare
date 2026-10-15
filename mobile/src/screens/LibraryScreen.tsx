import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { PillButton } from "../components/PillButton";
import { PosterCard } from "../components/PosterCard";
import { StateView } from "../components/StateView";
import { TopBar } from "../components/TopBar";
import { useCatalog } from "../lib/catalog";
import { confirmAction } from "../lib/confirm";
import { Drama, titleKey } from "../lib/dramas";
import { clearHistory, getHistory, HistoryEntry } from "../lib/storage";
import { color, contentMaxWidth, font, GRID_COLUMNS, gutter, radius, space, type } from "../theme";

type Tab = "list" | "history";

/** My Library — the two on-device collections: saved titles and what has been watched. */
export function LibraryScreen() {
  const router = useRouter();
  const { series, episodeCounts, myList, toggleSaved, byId, loading } = useCatalog();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("list");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      void getHistory().then(setHistory);
    }, [])
  );

  const cardWidth = Math.floor((width - gutter * 2 - space.md * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

  const savedTitles = useMemo(
    () => myList.map((key) => series.find((g) => titleKey(g[0]) === key)?.[0]).filter((d): d is Drama => !!d),
    [myList, series]
  );

  const historyTitles = history.map((h) => byId(h.id)).filter((d): d is Drama => !!d);

  const remove = (drama: Drama) => {
    confirmAction("Remove from My list?", drama.title, "Remove", () => {
      void toggleSaved(drama);
    });
  };

  return (
    <View style={styles.screen}>
      <TopBar brand actions={[{ icon: "search", label: "Search the archive", onPress: () => router.push("/browse") }]} />

      <Text style={styles.heading}>My Library</Text>

      <View style={styles.tabs}>
        <TabButton label="My list" count={savedTitles.length} active={tab === "list"} onPress={() => setTab("list")} />
        <TabButton
          label="Watch history"
          count={historyTitles.length}
          active={tab === "history"}
          onPress={() => setTab("history")}
        />
      </View>

      {tab === "list" ? (
        savedTitles.length === 0 ? (
          loading ? (
            <StateView mode="loading" />
          ) : (
            <StateView
              mode="empty"
              title="Nothing saved yet"
              body="Open any drama and tap My list. Saved titles stay on this phone, even offline."
              actionLabel="Browse the archive"
              onAction={() => router.push("/browse")}
            />
          )
        ) : (
          <>
            <Text style={styles.hint}>Tap to open · hold to remove</Text>
            <FlatList
              data={savedTitles}
              keyExtractor={(item) => String(item.id)}
              numColumns={GRID_COLUMNS}
              columnWrapperStyle={styles.column}
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => (
                <PosterCard
                  drama={item}
                  width={cardWidth}
                  episodeCount={episodeCounts[item.id] ?? 1}
                  onPress={() => router.push(`/drama/${item.id}`)}
                />
              )}
            />
          </>
        )
      ) : historyTitles.length === 0 ? (
        <StateView
          mode="empty"
          title="No watch history yet"
          body="Episodes you play show up here so you can pick up where you left off."
          actionLabel="Find something to watch"
          onAction={() => router.push("/browse")}
        />
      ) : (
        <>
          <FlatList
            data={history}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.historyList}
            renderItem={({ item }) => {
              const sub = [
                item.episode ? `Episode ${item.episode}` : null,
                item.episodeCount > 1 ? `${item.episodeCount} episodes` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <Pressable
                  onPress={() => router.push(`/watch/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Continue ${item.title}`}
                  style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
                >
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.historySub} numberOfLines={1}>
                    {sub}
                  </Text>
                </Pressable>
              );
            }}
          />
          <View style={styles.clearWrap}>
            <PillButton
              label="Clear watch history"
              variant="ghost"
              size="md"
              onPress={() =>
                confirmAction("Clear watch history?", "Continue watching will start empty.", "Clear", () => {
                  void clearHistory().then(() => setHistory([]));
                })
              }
            />
          </View>
        </>
      )}
    </View>
  );
}

function TabButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label} {count > 0 ? count : ""}
      </Text>
      <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" },
  heading: {
    paddingHorizontal: gutter,
    color: color.text,
    fontFamily: font.extra,
    fontSize: type.h2,
    letterSpacing: -0.3,
    marginTop: space.sm,
  },
  tabs: { flexDirection: "row", paddingHorizontal: gutter, marginTop: space.lg, gap: space.xl },
  tab: { paddingBottom: space.sm, alignItems: "center" },
  tabLabel: { color: color.muted, fontFamily: font.medium, fontSize: type.body },
  tabLabelActive: { color: color.text },
  tabUnderline: { height: 2, width: "100%", marginTop: space.sm, backgroundColor: "transparent", borderRadius: 2 },
  tabUnderlineActive: { backgroundColor: color.accent },
  hint: { paddingHorizontal: gutter, marginTop: space.md, color: color.dim, fontFamily: font.body, fontSize: type.micro },
  grid: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxl, gap: space.lg },
  column: { gap: space.md },
  historyList: { paddingHorizontal: gutter, paddingTop: space.md },
  historyRow: {
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  historyTitle: { color: color.text, fontFamily: font.bold, fontSize: type.body },
  historySub: { color: color.muted, fontFamily: font.body, fontSize: type.meta, marginTop: 2 },
  pressed: { opacity: 0.6 },
  clearWrap: { padding: gutter, alignItems: "flex-start" },
});
