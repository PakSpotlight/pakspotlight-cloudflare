/**
 * On-device state: My List, watch history (Continue watching), install id.
 *
 * Everything lives in AsyncStorage, matching the website's local-only model — there are no
 * accounts in v1, so nothing here ever leaves the phone.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Drama, titleKey } from "./dramas";

const MY_LIST_KEY = "ctv.mylist";
const HISTORY_KEY = "ctv.history";
const INSTALL_KEY = "ctv.install.id";
const UPDATE_KEY = "ctv.update.checkedAt";
const PING_KEY = "ctv.ping.sentAt";

const HISTORY_LIMIT = 40;

export type HistoryEntry = {
  id: number;
  key: string;
  title: string;
  image: string;
  episode: number | null;
  episodeCount: number;
  at: number;
};

type Listener = () => void;
const myListListeners = new Set<Listener>();

function emitMyList(): void {
  myListListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener that throws must not break the toggle.
    }
  });
}

export function subscribeMyList(fn: Listener): () => void {
  myListListeners.add(fn);
  return () => myListListeners.delete(fn);
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors; the UI keeps working without persistence.
  }
}

// ────────────────────────────── My List ──────────────────────────────

/** List entries are title keys ("series::aangan" or "single::26"), not raw row ids. */
export async function getMyList(): Promise<string[]> {
  const list = await readJSON<string[]>(MY_LIST_KEY, []);
  return Array.isArray(list) ? list : [];
}

export async function isInMyList(drama: Drama): Promise<boolean> {
  const list = await getMyList();
  return list.includes(titleKey(drama));
}

/** Returns true when the title was added, false when it was removed. */
export async function toggleMyList(drama: Drama): Promise<boolean> {
  const key = titleKey(drama);
  const list = await getMyList();
  const exists = list.includes(key);
  const next = exists ? list.filter((k) => k !== key) : [key, ...list];
  await writeJSON(MY_LIST_KEY, next);
  emitMyList();
  return !exists;
}

export async function restoreMyList(keys: string[]): Promise<void> {
  await writeJSON(MY_LIST_KEY, keys);
  emitMyList();
}

// ─────────────────────────── Watch history ───────────────────────────

export async function getHistory(): Promise<HistoryEntry[]> {
  const list = await readJSON<HistoryEntry[]>(HISTORY_KEY, []);
  return Array.isArray(list) ? list.filter((e) => e && typeof e.key === "string") : [];
}

/**
 * Remember that an episode was opened. One entry per title, newest first, so the
 * Continue watching row shows a series once rather than once per episode.
 */
export async function recordWatch(drama: Drama, episodeCount: number): Promise<void> {
  const entry: HistoryEntry = {
    id: drama.id,
    key: titleKey(drama),
    title: drama.title,
    image: drama.image,
    episode: drama.episode,
    episodeCount,
    at: Date.now(),
  };
  const list = await getHistory();
  const next = [entry, ...list.filter((e) => e.key !== entry.key)].slice(0, HISTORY_LIMIT);
  await writeJSON(HISTORY_KEY, next);
}

export async function clearHistory(): Promise<void> {
  await writeJSON(HISTORY_KEY, []);
}

// ─────────────────────── Install id and throttles ───────────────────────

export async function getInstallId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(INSTALL_KEY);
    if (existing) return existing;
    const id = `a${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    await AsyncStorage.setItem(INSTALL_KEY, id);
    return id;
  } catch {
    return "unknown";
  }
}

async function lastAt(key: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

async function markAt(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, String(Date.now()));
  } catch {
    // ignore
  }
}

export const throttle = {
  updateChecked: () => lastAt(UPDATE_KEY),
  markUpdateChecked: () => markAt(UPDATE_KEY),
  pingSent: () => lastAt(PING_KEY),
  markPingSent: () => markAt(PING_KEY),
};
