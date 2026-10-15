import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, gutter, space, type } from "../theme";

/**
 * Screen chrome. The wordmark is plain white — the accent is never spent on the header,
 * only on the five things listed in docs/android-app-plan.md §7.
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
          {brand ? <Text style={styles.brand}>Classic TV Pakistan</Text> : null}
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
    paddingTop: space.sm,
  },
  left: { flexDirection: "row", alignItems: "center", flex: 1 },
  back: { marginRight: space.md, padding: 2 },
  brand: { color: color.text, fontFamily: font.extra, fontSize: type.title + 1, letterSpacing: -0.3 },
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
