import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { SITE_ORIGIN } from "../lib/api";
import { openInYouTube, playerHtml } from "../lib/youtube";

/**
 * Native player: the official YouTube embed inside a WebView.
 *
 * The document's base URL is the site origin so the request carries a real Referer
 * (YouTube refuses playback without one — player error 153), and navigations away from the
 * embed are handed to the YouTube app instead of hijacking the player surface.
 */
export function Player({ videoId, startAt = 0, onProgress, onEnded, onError }: { videoId: string; startAt?: number; onProgress?: (seconds: number) => void; onEnded?: () => void; onError?: (message?: string) => void }) {
  return (
    <WebView
      style={styles.webview}
      source={{ html: playerHtml(videoId, startAt), baseUrl: SITE_ORIGIN }}
      originWhitelist={["https://*", "http://*"]}
      javaScriptEnabled
      domStorageEnabled
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      setSupportMultipleWindows={false}
      onMessage={(event) => {
        try {
          const message = JSON.parse(event.nativeEvent.data) as { type?: string; seconds?: number };
          if (message.type === "progress" && typeof message.seconds === "number") onProgress?.(message.seconds);
          if (message.type === "ended") onEnded?.();
        } catch {
          // Ignore messages that are not player progress events.
        }
      }}
      onError={() => onError?.()}
      onHttpError={() => onError?.()}
      onShouldStartLoadWithRequest={(request) => {
        const url = request.url || "";
        if (url.includes("youtube.com/watch") || url.includes("m.youtube.com/watch") || url.includes("youtu.be/")) {
          void openInYouTube(videoId);
          return false;
        }
        return true;
      }}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: "#000" },
});
