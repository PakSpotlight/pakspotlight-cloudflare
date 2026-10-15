import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { color, radius, space } from "../theme";

/** One quiet pulse, native-driver only, so it costs nothing on an Android 6 GPU. */
function usePulse() {
  const value = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [value]);
  return value;
}

export function SkeletonBlock({
  width,
  height,
  radius: r = 6,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
}) {
  const opacity = usePulse();
  return <Animated.View style={[styles.block, { width, height, borderRadius: r, opacity }]} />;
}

/** Thin accent line — the app's only progress indicator. */
export function ProgressLine({ progress, style }: { progress: number; style?: object }) {
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.track, style]}>
      <View style={[styles.fill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: color.surfaceAlt },
  track: { height: 3, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 3, backgroundColor: color.accent, borderRadius: radius.pill },
});

export const skeletonGutter = space.xl;
