import { Ionicons } from "@expo/vector-icons";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Drama } from "../lib/dramas";
import { color, font, gutter, space, type } from "../theme";
import { PosterCard } from "./PosterCard";

type Props = {
  title: string;
  items: Drama[];
  episodeCounts?: Record<number, number>;
  onPressItem: (drama: Drama) => void;
  onSeeAll?: () => void;
  cardWidth?: number;
  testID?: string;
};

export function SectionRow({
  title,
  items,
  episodeCounts,
  onPressItem,
  onSeeAll,
  cardWidth = 108,
  testID,
}: Props) {
  if (items.length === 0) return null;

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <View style={styles.seeAll}>
              <Text style={styles.seeAllText}>See all</Text>
              <Ionicons name="chevron-forward" size={14} color={color.muted} />
            </View>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.track}
        initialNumToRender={4}
        windowSize={5}
        renderItem={({ item }) => (
          <PosterCard
            drama={item}
            width={cardWidth}
            episodeCount={episodeCounts?.[item.id] ?? 1}
            onPress={() => onPressItem(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xl },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: gutter,
    marginBottom: space.md,
  },
  title: { color: color.text, fontFamily: font.extra, fontSize: type.h3, letterSpacing: -0.2, flexShrink: 1 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, paddingBottom: 2 },
  seeAllText: { color: color.muted, fontFamily: font.medium, fontSize: type.meta },
  pressed: { opacity: 0.6 },
  track: { paddingHorizontal: gutter, gap: space.md },
});
