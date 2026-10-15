import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Drama, cleanDramaTitle } from "../lib/dramas";
import { color, font, radius, space, type } from "../theme";

/** One episode line in the detail screen. Episode numbers are the numbering, not decoration. */
export function EpisodeRow({
  episode,
  fallbackIndex,
  active = false,
  watched = false,
  onPress,
}: {
  episode: Drama;
  fallbackIndex: number;
  active?: boolean;
  watched?: boolean;
  onPress: () => void;
}) {
  const number = episode.episode ?? fallbackIndex + 1;
  const cleaned = cleanDramaTitle(episode.title);
  const showSecondary = !!cleaned && cleaned.toLowerCase() !== `episode ${number}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Episode ${number}${active ? ", currently playing" : ""}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.numberWrap}>
        <Text style={[styles.number, active && styles.numberActive]}>{number}</Text>
      </View>

      <View style={styles.body}>
        <Text style={[styles.primary, active && styles.primaryActive]} numberOfLines={1}>
          {`Episode ${number}`}
        </Text>
        {showSecondary ? (
          <Text style={styles.secondary} numberOfLines={1}>
            {cleaned}
          </Text>
        ) : null}
      </View>

      {watched ? <Text style={styles.watched}>Watched</Text> : null}
      <Ionicons
        name={active ? "play-circle" : "play-circle-outline"}
        size={22}
        color={active ? color.accent : color.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
    gap: space.md,
  },
  pressed: { opacity: 0.6 },
  numberWrap: { width: 30, alignItems: "flex-start" },
  number: { color: color.dim, fontFamily: font.bold, fontSize: type.body },
  numberActive: { color: color.accent },
  body: { flex: 1 },
  primary: { color: color.text, fontFamily: font.medium, fontSize: type.body },
  primaryActive: { color: color.accent },
  secondary: { color: color.muted, fontFamily: font.body, fontSize: type.micro, marginTop: 2 },
  watched: {
    color: color.dim,
    fontFamily: font.medium,
    fontSize: 10,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
});
