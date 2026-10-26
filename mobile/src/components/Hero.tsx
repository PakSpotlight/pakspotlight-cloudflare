import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Drama, displayTitle, prettyType } from "../lib/dramas";
import { color, font, gutter, heroScrim, POSTER_RATIO, radius, space, type } from "../theme";
import { Chip } from "./Chip";
import { PillButton } from "./PillButton";

/** Natural-size cache so a poster is measured once per session. */
const RATIO_CACHE = new Map<string, number>();

/**
 * `null` while unknown. Layout never guesses: the split layout is the safe default because it
 * cannot stretch a portrait poster into a landscape slot (docs/android-app-plan.md §7.3).
 */
function useImageRatio(uri: string): number | null {
  const [ratio, setRatio] = useState<number | null>(uri ? RATIO_CACHE.get(uri) ?? null : null);

  useEffect(() => {
    if (!uri) {
      setRatio(null);
      return;
    }
    const cached = RATIO_CACHE.get(uri);
    if (cached !== undefined) {
      setRatio(cached);
      return;
    }
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => {
        const r = w && h ? w / h : 0;
        RATIO_CACHE.set(uri, r);
        if (alive) setRatio(r);
      },
      () => {
        RATIO_CACHE.set(uri, 0);
        if (alive) setRatio(0);
      }
    );
    return () => {
      alive = false;
    };
  }, [uri]);

  return ratio;
}

type Props = {
  drama: Drama;
  meta?: string;
  ctaLabel: string;
  onPlay: () => void;
  secondary?: React.ReactNode;
};

/**
 * The first thing anyone sees. Landscape artwork gets a full-bleed treatment with a scrim;
 * portrait archive posters (the common case) get the split layout — poster beside the words.
 */
export function Hero({ drama, meta, ctaLabel, onPlay, secondary }: Props) {
  const { width } = useWindowDimensions();
  const ratio = useImageRatio(drama.image);
  const fullBleed = ratio !== null && ratio >= 1.3;
  const posterWidth = Math.min(Math.round(width * 0.4), 160);

  if (fullBleed) {
    return (
      <View style={styles.fullWrap}>
        <Image source={{ uri: drama.image }} style={styles.fullImage} resizeMode="cover" />
        <LinearGradient
          colors={heroScrim}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.fullContent}>
          {drama.urdu ? (
            <Text style={styles.urduFull} numberOfLines={1}>
              {drama.urdu}
            </Text>
          ) : null}
          <Text style={styles.fullTitle} numberOfLines={2}>
            {displayTitle(drama)}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          <PillButton label={ctaLabel} icon="play" onPress={onPlay} style={styles.cta} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.splitWrap}>
      <View style={[styles.posterFrame, { width: posterWidth, height: Math.round(posterWidth * POSTER_RATIO) }]}>
        {drama.image ? (
          <Image source={{ uri: drama.image }} style={styles.posterImage} resizeMode="cover" />
        ) : (
          <View style={styles.posterFallback} />
        )}
      </View>

      <View style={styles.splitCol}>
        {drama.urdu ? (
          <Text style={styles.urdu} numberOfLines={1}>
            {drama.urdu}
          </Text>
        ) : null}
        <Text style={styles.splitTitle} numberOfLines={3}>
          {displayTitle(drama)}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
        <View style={styles.chips}>
          <Chip label={drama.year || "Archive"} />
          <Chip label={prettyType(drama.type)} />
        </View>
        <PillButton label={ctaLabel} icon="play" onPress={onPlay} style={styles.ctaSplit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-bleed variant
  fullWrap: { height: 280, justifyContent: "flex-end" },
  fullImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  fullContent: { paddingHorizontal: gutter, paddingBottom: space.lg },
  fullTitle: {
    color: color.text,
    fontFamily: font.black,
    fontSize: type.h1,
    lineHeight: 34,
    letterSpacing: -0.6,
  },

  // Split variant
  splitWrap: { flexDirection: "row", paddingHorizontal: gutter, gap: space.lg },
  posterFrame: {
    borderRadius: radius.poster,
    overflow: "hidden",
    backgroundColor: color.surfaceAlt,
  },
  posterImage: { width: "100%", height: "100%" },
  posterFallback: { flex: 1, backgroundColor: color.surfaceAlt },
  splitCol: { flex: 1, justifyContent: "center" },
  splitTitle: {
    color: color.text,
    fontFamily: font.black,
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: -0.5,
  },
  chips: { flexDirection: "row", gap: space.sm, marginTop: space.md, flexWrap: "wrap" },
  cta: { marginTop: space.lg, alignSelf: "flex-start", minWidth: 210 },
  ctaSplit: { marginTop: space.lg, alignSelf: "stretch", height: 46 },
  urdu: {
    color: color.muted,
    fontFamily: font.urdu,
    fontSize: 17,
    lineHeight: 34,
    marginBottom: 2,
  },
  // Nastaliq is right-to-left: on the full-bleed hero it reads as a title in its own right,
  // so it sits flush right above the English title instead of floating like a caption.
  urduFull: {
    color: "rgba(255,255,255,0.94)",
    fontFamily: font.urdu,
    fontSize: 20,
    lineHeight: 40,
    textAlign: "right",
    alignSelf: "stretch",
    marginBottom: 2,
  },
  meta: { color: color.muted, fontFamily: font.medium, fontSize: type.meta, marginTop: space.sm },
});
