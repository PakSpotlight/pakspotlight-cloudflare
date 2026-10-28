import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, gutter, space, type } from "../theme";

/**
 * Shared premium header: visible gold TV mark and brand, with consistent spacing below Android status bar.
 */
export function TopBar({
  brand = false,
  title,
  subtitle,
  onBack,
  actions,
}: {
  brand?: boolean;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }>;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={22} color={color.text} />
          </Pressable>
        ) : null}
        <View>
          {brand ? (
            <View style={styles.brandRow}>
              <View style={styles.logoMark}><Ionicons name="tv-outline" size={19} color={color.ctaText} /></View>
              <Text style={styles.brand}>Classic TV Pakistan</Text>
            </View>
          ) : null}
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={styles.right}>
        {(actions ?? []).map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            hitSlop={10}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name={a.icon} size={20} color={color.text} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: gutter,
    paddingBottom: space.md,
    paddingTop: Math.max(insets.top, space.md),
    minHeight: 64,
  },
  left: { flexDirection: "row", alignItems: "center", flex: 1 },
  back: { marginRight: space.md, padding: 2 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  logoMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" },
  brand: { color: color.accent, fontFamily: font.extra, fontSize: type.title + 1, letterSpacing: -0.3 },
  title: { color: color.text, fontFamily: font.extra, fontSize: type.h3, letterSpacing: -0.2 },
  subtitle: { color: color.muted, fontFamily: font.body, fontSize: type.meta, marginTop: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: space.sm },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pressed: { opacity: 0.6 },
});
