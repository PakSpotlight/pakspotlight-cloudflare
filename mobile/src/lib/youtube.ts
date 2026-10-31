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

export function embedUrl(videoId: string, opts?: { autoplay?: boolean; origin?: string; startAt?: number }): string {
  const params = new URLSearchParams({
    rel: "0",
    playsinline: "1",
    enablejsapi: "1",
    origin: opts?.origin ?? ORIGIN,
  });
  if (opts?.autoplay) params.set("autoplay", "1");
  if (opts?.startAt && opts.startAt > 0) params.set("start", String(Math.floor(opts.startAt)));
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
export function playerHtml(videoId: string, startAt = 0): string {
  const src = embedUrl(videoId, { autoplay: true, startAt });
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
      iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe
      id="player"
      src="${src}"
      title="Episode player"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
      frameborder="0"
    ></iframe>
    <script>
      (function () {
        var startAt = ${Math.max(0, Math.floor(startAt))};
        var player;
        function send(type, seconds) {
          try {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, seconds: seconds || 0 }));
            }
          } catch (_) {}
        }
        function onYouTubeIframeAPIReady() {
          player = new YT.Player("player", {
            events: {
              onReady: function (event) {
                if (startAt > 0) event.target.seekTo(startAt, true);
                window.setInterval(function () {
                  try { send("progress", Math.floor(player.getCurrentTime())); } catch (_) {}
                }, 5000);
              },
              onStateChange: function (event) {
                try {
                  if (event.data === YT.PlayerState.ENDED) send("ended", 0);
                  else send("progress", Math.floor(player.getCurrentTime()));
                } catch (_) {}
              }
            }
          });
        }
        window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
        var api = document.createElement("script");
        api.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(api);
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
