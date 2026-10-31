import * as React from "react";
import { StyleSheet, View } from "react-native";
import { embedUrl } from "../lib/youtube";

/**
 * Web player: the same YouTube embed in a plain iframe.
 *
 * This file is what Metro picks on web (`Player.web.tsx` overrides `Player.tsx`), which keeps
 * react-native-webview out of the browser bundle entirely.
 */
export function Player({ videoId, startAt = 0 }: { videoId: string; startAt?: number; onProgress?: (seconds: number) => void; onEnded?: () => void; onError?: (message?: string) => void }) {
  const iframe = React.createElement("iframe", {
    src: embedUrl(videoId, { autoplay: true, startAt }),
    title: "Episode player",
    allow:
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    allowFullScreen: true,
    referrerPolicy: "strict-origin-when-cross-origin",
    style: {
      border: "0",
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      background: "#000",
    },
  });

  return <View style={styles.frame}>{iframe}</View>;
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
});
