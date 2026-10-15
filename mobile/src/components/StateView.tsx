import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { color, font, space, type } from "../theme";
import { PillButton } from "./PillButton";
import { SkeletonBlock } from "./Skeleton";

type Props = {
  mode: "loading" | "empty" | "error";
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * One component for the three non-content states, so every screen phrases them the same way.
 * Errors say what happened and what to do next; empty states point at the action that fills them.
 */
export function StateView({ mode, title, body, actionLabel, onAction }: Props) {
  if (mode === "loading") {
    return (
      <View style={styles.wrap} accessibilityLabel="Loading">
        <ActivityIndicator color={color.accent} />
        <Text style={styles.loadingText}>{title ?? "Loading the archive…"}</Text>
      </View>
    );
  }

  const fallback =
    mode === "error"
      ? {
          title: title ?? "Can't reach the archive",
          body: body ?? "Check your connection and try again. Anything you saved is still on this phone.",
        }
      : {
          title: title ?? "Nothing here yet",
          body: body ?? "",
        };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{fallback.title}</Text>
      {fallback.body ? <Text style={styles.body}>{fallback.body}</Text> : null}
      {actionLabel && onAction ? (
        <PillButton label={actionLabel} onPress={onAction} variant="ghost" size="md" style={styles.action} />
      ) : null}
    </View>
  );
}

/** First-paint placeholder that mirrors the home layout instead of a spinner. */
export function HomeSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <View style={styles.skeletonHero}>
        <SkeletonBlock width="40%" height={168} radius={12} />
        <View style={styles.skeletonHeroCol}>
          <SkeletonBlock width="80%" height={22} />
          <SkeletonBlock width="55%" height={14} />
          <SkeletonBlock width="100%" height={44} radius={999} />
        </View>
      </View>
      {[0, 1].map((row) => (
        <View key={row} style={styles.skeletonRow}>
          <SkeletonBlock width="35%" height={16} />
          <View style={styles.skeletonCards}>
            {[0, 1, 2].map((c) => (
              <SkeletonBlock key={c} width={104} height={156} radius={12} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: space.xxl * 2, paddingHorizontal: space.xl, alignItems: "center" },
  loadingText: { color: color.muted, fontFamily: font.medium, fontSize: type.meta, marginTop: space.md },
  title: { color: color.text, fontFamily: font.extra, fontSize: type.h3, textAlign: "center" },
  body: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: type.body,
    textAlign: "center",
    marginTop: space.sm,
    maxWidth: 300,
    lineHeight: 22,
  },
  action: { marginTop: space.lg },
  skeletonWrap: { paddingTop: space.lg },
  skeletonHero: { flexDirection: "row", paddingHorizontal: space.xl, gap: space.lg },
  skeletonHeroCol: { flex: 1, gap: space.md, justifyContent: "center" },
  skeletonRow: { paddingHorizontal: space.xl, marginTop: space.xl, gap: space.md },
  skeletonCards: { flexDirection: "row", gap: space.md },
});
