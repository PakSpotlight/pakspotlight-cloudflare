import { StyleSheet, Text } from "react-native";
import { color, font, gutter, space, type } from "../theme";

/**
 * The Roman-Urdu brush line — the ARY Plus device this app borrows, and one of the five places
 * the accent is allowed to appear. It is set once per screen, at the top, where a tagline belongs.
 */
export function Tagline({ text }: { text: string }) {
  return (
    <Text style={styles.text} accessibilityRole="text">
      {text.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: color.accent,
    fontFamily: font.brush,
    fontSize: type.body,
    letterSpacing: 0.6,
    paddingHorizontal: gutter,
    marginTop: -space.xs,
    marginBottom: space.lg,
  },
});
