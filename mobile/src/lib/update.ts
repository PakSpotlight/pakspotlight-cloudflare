/**
 * In-app update check and the anonymous launch ping.
 *
 * The APK is distributed from the website rather than a store, so the app has to ask the site
 * whether a newer build exists. `public/app/latest.json` on the Worker is the source of truth and
 * is written by the release workflow.
 */

import { SITE_ORIGIN } from "./api";
import { getInstallId, throttle } from "./storage";
import { openUrl } from "./youtube";

/** Keep in sync with `expo.android.versionCode` / `expo.version` in app.json. */
export const APP_VERSION_CODE = 1;
export const APP_VERSION = "1.0.0";

const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PING_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type UpdateInfo = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  notes?: string;
  sizeMB?: number;
};

export async function fetchLatestManifest(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`${SITE_ORIGIN}/app/latest.json?t=${Date.now()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<UpdateInfo>;
    if (!data || typeof data.versionCode !== "number" || !data.apkUrl) return null;
    return {
      versionCode: data.versionCode,
      versionName: String(data.versionName || data.versionCode),
      apkUrl: String(data.apkUrl),
      notes: data.notes ? String(data.notes) : undefined,
      sizeMB: typeof data.sizeMB === "number" ? data.sizeMB : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Returns the pending update, or null when the app is current. Throttled to once a day so it
 * costs one request per user per day, and never blocks the UI.
 */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  if (!force) {
    const last = await throttle.updateChecked();
    if (last && Date.now() - last < UPDATE_INTERVAL_MS) return null;
  }
  const manifest = await fetchLatestManifest();
  await throttle.markUpdateChecked();
  if (!manifest) return null;
  return manifest.versionCode > APP_VERSION_CODE ? manifest : null;
}

export function openDownloadPage(): void {
  void openUrl(`${SITE_ORIGIN}/get-app`);
}

export function openApk(update: UpdateInfo): void {
  void openUrl(update.apkUrl);
}

/** Anonymous, once per 12 h: how many installs of which build are alive. No personal data. */
export async function sendLaunchPing(): Promise<void> {
  try {
    const last = await throttle.pingSent();
    if (last && Date.now() - last < PING_INTERVAL_MS) return;
    const installId = await getInstallId();
    await fetch(`${SITE_ORIGIN}/api/app/ping?v=${APP_VERSION_CODE}&i=${encodeURIComponent(installId)}`, {
      method: "GET",
    });
    await throttle.markPingSent();
  } catch {
    // Telemetry is never allowed to affect the app.
  }
}
