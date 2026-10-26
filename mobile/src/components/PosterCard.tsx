import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Drama, displayTitle, prettyType } from "../lib/dramas";
import { color, font, POSTER_RATIO, radius, space, type } from "../theme";
import { ProgressLine } from "./Skeleton";

type Props = {
  drama: Drama;
  width: number;
  episodeCount?: number;
  /** 0–1. When present a thin accent line sits across the poster's bottom edge. */
  progress?: number;
  onPress: () => void;
  /** Optional long-press (My Library uses it to offer removal). */
  onLongPress?: () => void;
};

/** 2:3 archive poster with an episode badge. Every grid and row in the app uses this card. */
export function PosterCard({ drama, width, episodeCount = 1, progress, onPress, onLongPress }: Props) {
  const [failed, setFailed] = useState(false);
  const height = Math.round(width * POSTER_RATIO);
  const showImage = !!drama.image && !failed;
  const meta = drama.year ? `${drama.year}` : prettyType(drama.type);
  const title = displayTitle(drama);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${episodeCount > 1 ? `, ${episodeCount} episodes` : ""}`}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
    >
      <View style={[styles.frame, { height }]}>
        {showImage ? (
          <Image
            source={{ uri: drama.image }}
            style={styles.image}
            onError={() => setFailed(true)}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="film-outline" size={22} color={color.dim} />
            <Text style={styles.placeholderText} numberOfLines={2}>
              {title}
            </Text>
          </View>
        )}

        {episodeCount > 1 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{episodeCount} eps</Text>
          </View>
        ) : null}

        {progress !== undefined ? <ProgressLine progress={progress} style={styles.progress} /> : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  frame: {
    width: "100%",
    borderRadius: radius.poster,
    backgroundColor: color.surfaceAlt,
    overflow: "hidden",
    justifyContent: "center",
  },
  image: { width: "100%", height: "100%" },
  placeholder: { alignItems: "center", paddingHorizontal: space.md, gap: space.sm },
  placeholderText: {
    color: color.dim,
    fontFamily: font.medium,
    fontSize: type.micro,
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: space.sm,
    left: space.sm,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  badgeText: { color: color.text, fontFamily: font.bold, fontSize: 10, letterSpacing: 0.2 },
  progress: { position: "absolute", left: 0, right: 0, bottom: 0, borderRadius: 0, height: 3 },
  title: {
    marginTop: space.sm,
    color: color.text,
    fontFamily: font.bold,
    fontSize: type.meta,
    lineHeight: 17,
  },
  meta: { marginTop: 2, color: color.dim, fontFamily: font.body, fontSize: type.micro },
});
