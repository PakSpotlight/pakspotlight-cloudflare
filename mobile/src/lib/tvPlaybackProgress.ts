import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "ctv.tv.playback.";

export type TvPlaybackProgress = {
  videoId: string;
  currentTime: number;
  duration: number;
  updatedAt: number;
};

export async function getTvPlaybackProgress(videoId: string): Promise<TvPlaybackProgress | null> {
  if (!videoId) return null;
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + videoId);
    if (!raw) return null;
    const value = JSON.parse(raw) as TvPlaybackProgress;
    if (!value || value.videoId !== videoId || !Number.isFinite(value.currentTime)) return null;
    return value;
  } catch {
    return null;
  }
}

export async function saveTvPlaybackProgress(videoId: string, currentTime: number, duration: number): Promise<void> {
  if (!videoId || !Number.isFinite(currentTime) || currentTime < 0) return;
  try {
    if (duration > 0 && currentTime / duration >= 0.95) {
      await AsyncStorage.removeItem(KEY_PREFIX + videoId);
      return;
    }
    const value: TvPlaybackProgress = {
      videoId,
      currentTime,
      duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(KEY_PREFIX + videoId, JSON.stringify(value));
  } catch {
    // Playback should continue even when local storage is unavailable.
  }
}

export async function clearTvPlaybackProgress(videoId: string): Promise<void> {
  if (!videoId) return;
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + videoId);
  } catch {
    // Ignore storage failures.
  }
}
