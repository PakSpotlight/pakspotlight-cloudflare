import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { SITE_ORIGIN } from "../lib/api";
import { openInYouTube, playerHtml } from "../lib/youtube";

export type PlayerProgress = { currentTime: number; duration: number; state: number };
export type PlayerHandle = {
  seekBy: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  playPause: () => void;
  focus: () => void;
};

type Props = {
  videoId: string;
  onError?: (message?: string) => void;
  onProgress?: (progress: PlayerProgress) => void;
  onReady?: () => void;
};

/** Official YouTube IFrame player with a small React Native playback bridge. */
export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { videoId, onError, onProgress, onReady }, forwardedRef
) {
  const webViewRef = useRef<WebView>(null);
  const source = useMemo(() => ({ html: playerHtml(videoId), baseUrl: SITE_ORIGIN }), [videoId]);

  const command = useCallback((name: string, value?: number) => {
    const payload = JSON.stringify(name);
    const amount = value == null ? "undefined" : String(value);
    webViewRef.current?.injectJavaScript(
      `window.__ctvPlayerCommand && window.__ctvPlayerCommand(${payload}, ${amount}); true;`
    );
  }, []);

  useImperativeHandle(forwardedRef, () => ({
    seekBy: (seconds) => command("seekBy", seconds),
    seekTo: (seconds) => command("seekTo", seconds),
    playPause: () => command("playPause"),
    focus: () => {
      try { (webViewRef.current as any)?.requestTVFocus?.(); } catch {}
      webViewRef.current?.injectJavaScript(
        "try { var f=document.querySelector('iframe'); if(f) f.focus(); } catch(e) {} true;"
      );
    },
  }), [command]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "ready") onReady?.();
      else if (message.type === "progress") {
        onProgress?.({
          currentTime: Number(message.currentTime) || 0,
          duration: Number(message.duration) || 0,
          state: Number(message.state) || 0,
        });
      } else if (message.type === "error") onError?.(`YouTube player error ${message.code}`);
    } catch {
      // Ignore unrelated messages from the embedded document.
    }
  };

  return (
    <WebView
      ref={webViewRef}
      style={styles.webview}
      focusable
      {...({ hasTVPreferredFocus: true } as any)}
      source={source}
      originWhitelist={["https://*", "http://*"]}
      javaScriptEnabled
      domStorageEnabled
      allowsFullscreenVideo={false}
      scrollEnabled={false}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      setSupportMultipleWindows={false}
      onMessage={handleMessage}
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
});

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: "#000" },
});
