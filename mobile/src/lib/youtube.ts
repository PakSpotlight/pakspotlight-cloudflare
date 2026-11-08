/**
 * YouTube playback plumbing.
 *
 * The archive's episodes are YouTube videos, so the app embeds the official player rather than
 * extracting streams. Two rules learned the hard way and encoded here:
 *  1. The embed must send a real Referer, or YouTube refuses to play
 *     ("embedder.identity.missing.referrer", player error 153). On Android we load the player
 *     inside a document whose base URL is classictvpakistan.com and let the browser set the
 *     referrer; on web the iframe carries referrerPolicy explicitly.
 *  2. On old Android WebViews the embed can still fail, so every player screen keeps a visible
 *     "Watch on YouTube" escape hatch.
 */

import { Linking, Platform } from "react-native";
import { SITE_ORIGIN } from "./api";

const ORIGIN = SITE_ORIGIN;

export function embedUrl(videoId: string, opts?: { autoplay?: boolean; origin?: string }): string {
  const params = new URLSearchParams({
    rel: "0",
    playsinline: "1",
    enablejsapi: "1",
    controls: "1",
    fs: "0",
    origin: opts?.origin ?? ORIGIN,
  });
  if (opts?.autoplay) params.set("autoplay", "1");
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Canonical share link — the same URL shape the site publishes and Google indexes. */
export function shareUrl(dramaId: number): string {
  return `${ORIGIN}/watch?id=${dramaId}`;
}

/** The document loaded by the native WebView player. */
export function playerHtml(videoId: string): string {
  const src = embedUrl(videoId, { autoplay: true });
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
      #player { position: absolute; inset: 0; width: 100%; height: 100%; }
      iframe { width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <div id="player"></div>
    <script>
      (function () {
        var player = null;
        var ready = false;
        function send(type, extra) {
          try {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, extra || {})));
            }
          } catch (_) {}
        }
        window.__ctvPlayerCommand = function (command, value) {
          if (!ready || !player) return;
          try {
            if (command === "seekBy") player.seekTo(Math.max(0, player.getCurrentTime() + Number(value || 0)), true);
            if (command === "seekTo") player.seekTo(Math.max(0, Math.min(player.getDuration() || 0, Number(value || 0))), true);
            if (command === "playPause") {
              if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
              else player.playVideo();
            }
          } catch (_) {}
        };
        window.onYouTubeIframeAPIReady = function () {
          player = new YT.Player("player", {
            videoId: ${JSON.stringify(videoId)},
            playerVars: { autoplay: 1, controls: 1, disablekb: 0, rel: 0, playsinline: 1, fs: 0, enablejsapi: 1, origin: ${JSON.stringify(ORIGIN)} },
            events: {
              onReady: function () {
                ready = true;
                send("ready");
                setInterval(function () {
                  if (!ready || !player) return;
                  try {
                    send("progress", {
                      currentTime: player.getCurrentTime() || 0,
                      duration: player.getDuration() || 0,
                      state: player.getPlayerState()
                    });
                  } catch (_) {}
                }, 1000);
              },
              onStateChange: function (event) { send("state", { state: event.data }); },
              onError: function (event) { send("error", { code: event.data }); }
            }
          });
        };
        var tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      })();
    </script>
  </body>
</html>`;
}

/**
 * Hand playback to the YouTube app when it is installed, and to the browser when it is not.
 * Used by the player's fallback and by the "Watch on YouTube" action.
 */
export async function openInYouTube(videoId: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.open(watchUrl(videoId), "_blank", "noopener,noreferrer");
    return;
  }
  try {
    await Linking.openURL(`vnd.youtube:${videoId}`);
  } catch {
    try {
      await Linking.openURL(watchUrl(videoId));
    } catch {
      // Nothing else we can do; the caller shows the link instead.
    }
  }
}

export async function openUrl(url: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    // ignore
  }
}
