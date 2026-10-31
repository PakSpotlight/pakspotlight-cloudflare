import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useEffect, useState } from "react";
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

/** Size the artwork frame from each source image's real dimensions. */
export function Hero({ drama, meta, ctaLabel, onPlay }: Props) {
  const { width } = useWindowDimensions();
  const [imageRatio, setImageRatio] = useState(16 / 9);

  useEffect(() => {
    let active = true;
    if (!drama.image) {
      setImageRatio(16 / 9);
      return () => { active = false; };
    }
    Image.getSize(
      drama.image,
      (imageWidth, imageHeight) => {
        if (active && imageWidth > 0 && imageHeight > 0) setImageRatio(imageWidth / imageHeight);
      },
      () => { if (active) setImageRatio(16 / 9); }
    );
    return () => { active = false; };
  }, [drama.image]);

  // Match each image's natural shape instead of forcing every thumbnail into 16:9.
  const imageHeight = Math.round(Math.max(width * 0.45, Math.min(width / imageRatio, width * 1.8)));

  return (
    <View style={styles.wrap}>
      <View style={[styles.imageFrame, { height: imageHeight }]}>
        {drama.image ? (
          <Image source={{ uri: drama.image }} style={styles.image} resizeMode="contain" />
        ) : (
          <View style={styles.fallback} />
        )}
      </View>
      <View style={styles.details}>
        <View style={styles.titleBlock}>
          {drama.urdu ? <Text style={styles.urdu} numberOfLines={1}>{drama.urdu}</Text> : null}
          <Text style={styles.title} numberOfLines={2}>{displayTitle(drama)}</Text>
          {meta ? <Text style={styles.meta} numberOfLines={2}>{meta}</Text> : null}
        </View>
        <PillButton label={ctaLabel} icon="play" size="md" onPress={onPlay} style={styles.cta} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", backgroundColor: color.bg },
  imageFrame: { width: "100%", backgroundColor: "#000", overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  fallback: { flex: 1, backgroundColor: color.surfaceAlt },
  details: {
    paddingHorizontal: gutter,
    paddingTop: space.md,
    paddingBottom: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  urdu: {
    color: color.muted, fontFamily: font.urdu, fontSize: 16, lineHeight: 32, textAlign: "left",
  },
  title: {
    color: color.text, fontFamily: font.black, fontSize: 24, lineHeight: 29, letterSpacing: -0.5,
  },
  meta: { color: color.muted, fontFamily: font.medium, fontSize: 12, marginTop: space.xs },
  cta: { marginTop: space.xs, alignSelf: "center", minWidth: 0, height: 34, paddingHorizontal: 14 },
});
