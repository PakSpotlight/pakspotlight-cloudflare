import { Ionicons } from "@expo/vector-icons";
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <View style={[styles.circle, active && styles.circleActive]}>
        <Ionicons name={icon} size={20} color={active ? color.accent : color.text} />
      </View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", width: 84 },
  pressed: { opacity: 0.6 },
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
  label: {
    marginTop: space.sm,
    color: color.muted,
    fontFamily: font.medium,
    fontSize: type.micro,
    textAlign: "center",
  },
  labelActive: { color: color.accent },
});
