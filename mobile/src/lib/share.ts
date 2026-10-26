import { Platform, Share } from "react-native";

/**
 * The one share entry point for every screen.
 *
 * Android's native share sheet always exists, but the web build does not — react-native-web's
 * `Share.share()` throws "Share is not supported in this browser", and `navigator.share` may be
 * missing too. Every path is guarded so a share tap can never throw an uncaught error.
 */
export async function shareTitle(title: string, url: string): Promise<void> {
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).share) {
      await (navigator as any).share({ title, url });
      return;
    }
    await Share.share({ message: `${title} — ${url}`, url });
  } catch {
    // A dismissed share sheet rejects with an AbortError; nothing to do but ignore it.
  }
}
