import { Image, StyleSheet, Text, View } from "react-native";
import { Drama, displayTitle } from "../lib/dramas";
import { color, font, gutter, space } from "../theme";
import { PillButton } from "./PillButton";

type Props = {
  drama: Drama;
  meta?: string;
  ctaLabel: string;
  onPlay: () => void;
  secondary?: React.ReactNode;
};

/**
 * Match the website's mobile hero: every slide uses one fixed 16:9 frame.
 * Artwork fills the same frame consistently; title placement never depends on
 * the source thumbnail dimensions.
 */
export function Hero({ drama, meta, ctaLabel, onPlay }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.imageFrame}>
        {drama.image ? (
          <Image source={{ uri: drama.image }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.fallback} />
        )}
      </View>
      <View style={styles.details}>
        <View style={styles.actions}>
          <PillButton label={ctaLabel} icon="play" size="md" onPress={onPlay} style={styles.cta} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={2}>{displayTitle(drama)}</Text>
          {drama.urdu ? <Text style={styles.urdu} numberOfLines={1}>{drama.urdu}</Text> : null}
          {meta ? <Text style={styles.meta} numberOfLines={2}>{meta}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", backgroundColor: color.bg },
  imageFrame: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#050505",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  fallback: { flex: 1, backgroundColor: color.surfaceAlt },
  details: {
    width: "100%",
    paddingHorizontal: gutter,
    paddingTop: space.md,
    paddingBottom: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  actions: { flexShrink: 0, alignItems: "flex-start" },
  titleBlock: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  title: {
    color: color.text,
    fontFamily: font.black,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    textAlign: "right",
  },
  urdu: {
    color: "#d8b35a",
    fontFamily: font.urdu,
    fontSize: 16,
    lineHeight: 32,
    textAlign: "right",
  },
  meta: {
    color: color.muted,
    fontFamily: font.medium,
    fontSize: 12,
    marginTop: space.xs,
    textAlign: "right",
  },
  cta: { minWidth: 0, height: 38, paddingHorizontal: 14 },
});
