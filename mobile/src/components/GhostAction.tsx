import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, space, type } from "../theme";
import { font } from "../theme";

/** Circular secondary action with its label underneath — the row of three under every hero. */
export function GhostAction({
  icon,
  label,
  onPress,
  active = false,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      focusable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.wrap, focused && styles.focused, pressed && styles.pressed]}
    >
      <View style={[styles.circle, active && styles.circleActive, focused && styles.circleFocused]}>
        <Ionicons name={icon} size={20} color={active ? color.accent : color.text} />
      </View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", width: 84, paddingVertical: 3, borderRadius: 12 },
  pressed: { opacity: 0.7 },
  focused: { backgroundColor: "rgba(198,243,42,0.10)" },
  circle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  circleActive: { borderColor: color.accent, backgroundColor: color.accentSoft },
  circleFocused: { borderWidth: 3, borderColor: color.accent },
  label: {
    marginTop: space.sm,
    color: color.muted,
    fontFamily: font.medium,
    fontSize: type.micro,
    textAlign: "center",
  },
  labelActive: { color: color.accent },
});
