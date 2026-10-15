import { StyleSheet, Text, View } from "react-native";
import { color, font, radius, space, type } from "../theme";

/**
 * Hairline pill. Sentence case, one line, never used as a button.
 * `tone="accent"` is reserved for live/status moments.
 */
export function Chip({ label, tone = "default" }: { label: string; tone?: "default" | "accent" }) {
  return (
    <View style={[styles.chip, tone === "accent" && styles.accentChip]}>
      <Text style={[styles.text, tone === "accent" && styles.accentText]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  accentChip: {
    borderColor: color.accent,
    backgroundColor: color.accentSoft,
  },
  text: {
    color: color.muted,
    fontFamily: font.medium,
    fontSize: type.meta,
  },
  accentText: {
    color: color.accent,
  },
});
