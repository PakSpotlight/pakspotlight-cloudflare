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
export function Player({ videoId, onError }: { videoId: string; onError?: (message?: string) => void }) {
  return (
    <WebView
      style={styles.webview}
      source={{ html: playerHtml(videoId), baseUrl: SITE_ORIGIN }}
      originWhitelist={["https://*", "http://*"]}
      javaScriptEnabled
      domStorageEnabled
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      setSupportMultipleWindows={false}
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
