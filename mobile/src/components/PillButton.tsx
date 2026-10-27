import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { color, font, radius, space, type } from "../theme";

type Props = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "ghost";
  size?: "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

/**
 * The one primary action per screen: a solid white pill with a black label.
 * `ghost` is the quieter sibling used inside sheets and error states.
 */
export function PillButton({
  label,
  onPress,
  icon,
  variant = "primary",
  size = "lg",
  loading = false,
  disabled = false,
  style,
}: Props) {
  const primary = variant === "primary";
  const [focused, setFocused] = useState(false);
  const height = size === "lg" ? 50 : 42;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      focusable={!disabled && !loading}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        { height },
        primary ? styles.primary : styles.ghost,
        focused && styles.focused,
        (pressed || disabled) && styles.dim,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? color.ctaText : color.text} />
      ) : (
        <View style={styles.inner}>
          {icon ? (
            <Ionicons
              name={icon}
              size={size === "lg" ? 18 : 16}
              color={primary ? color.ctaText : color.text}
              style={styles.icon}
            />
          ) : null}
          <Text style={[styles.label, primary ? styles.primaryLabel : styles.ghostLabel, size === "md" && styles.mdLabel]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
    minWidth: 120,
  },
  primary: { backgroundColor: color.ctaBg },
  ghost: { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: "transparent" },
  focused: { borderWidth: 3, borderColor: color.accent },
  inner: { flexDirection: "row", alignItems: "center" },
  icon: { marginRight: space.sm },
  label: { fontFamily: font.bold, fontSize: type.body, letterSpacing: 0.2 },
  mdLabel: { fontSize: type.meta },
  primaryLabel: { color: color.ctaText },
  ghostLabel: { color: color.text },
  dim: { opacity: 0.7 },
});
