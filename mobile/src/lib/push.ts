import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getInstallId } from "./storage";

const PUSH_SERVICE = "https://ctv-mobile-push-preview.pakifun3.workers.dev";
const ENABLED_KEY = "ctv.notifications.newDrama.enabled";
const INITIAL_PROMPT_KEY = "ctv.notifications.initialPromptShown";

function getProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
}

async function registerToken(): Promise<void> {
  if (Platform.OS !== "android") return;
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("Push notifications are not linked to the Expo project yet.");
  }

  await Notifications.setNotificationChannelAsync("new-dramas", {
    name: "New dramas",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#C6F32A",
  });

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const installId = await getInstallId();
  const response = await fetch(`${PUSH_SERVICE}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, installId, platform: "android" }),
  });
  if (!response.ok) throw new Error("Could not register this phone for new-drama alerts.");
}

export async function areNewDramaAlertsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === "true";
}

export async function enableNewDramaAlerts(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!getProjectId()) {
    throw new Error("The Android app still needs its Expo push project ID before alerts can be enabled.");
  }

  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted) return false;

  await registerToken();
  await AsyncStorage.setItem(ENABLED_KEY, "true");
  return true;
}

export async function disableNewDramaAlerts(): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, "false");
  try {
    const installId = await getInstallId();
    await fetch(`${PUSH_SERVICE}/unregister`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installId }),
    });
  } catch {
    // Local opt-out is immediate even when the network is unavailable.
  }
}

/** Refresh an opted-in device token on each app launch without asking for permission again. */
export async function refreshNewDramaRegistration(): Promise<void> {
  if (Platform.OS !== "android" || !(await areNewDramaAlertsEnabled())) return;
  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) {
    await AsyncStorage.setItem(ENABLED_KEY, "false");
    return;
  }
  try {
    await registerToken();
  } catch {
    // Retry on a later app launch; never block the catalogue.
  }
}


/** Ask for notification permission once on the first app launch after installation. */
export async function requestInitialNotificationPermission(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (await AsyncStorage.getItem(INITIAL_PROMPT_KEY)) return;
  await AsyncStorage.setItem(INITIAL_PROMPT_KEY, "true");

  try {
    const current = await Notifications.getPermissionsAsync();
    const permissions = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!permissions.granted) return;
    await registerToken();
    await AsyncStorage.setItem(ENABLED_KEY, "true");
  } catch {
    // Never block startup; users can still enable alerts from the menu.
  }
}
