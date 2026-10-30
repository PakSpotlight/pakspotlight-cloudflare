import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from "@expo-google-fonts/archivo";
import { NotoNastaliqUrdu_400Regular } from "@expo-google-fonts/noto-nastaliq-urdu";
import { PermanentMarker_400Regular } from "@expo-google-fonts/permanent-marker";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { CatalogProvider } from "../src/lib/catalog";
import { refreshNewDramaRegistration } from "../src/lib/push";
import { color } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function NotificationNavigation() {
  const router = useRouter();
  useEffect(() => {
    let lastHandled: string | null = null;
    const openDrama = (response: Notifications.NotificationResponse) => {
      const request = response.notification.request;
      if (lastHandled === request.identifier) return;
      const data = request.content.data as { dramaId?: number | string };
      const id = Number(data?.dramaId);
      if (!Number.isSafeInteger(id) || id <= 0) return;
      lastHandled = request.identifier;
      router.push(`/drama/${id}`);
      void Notifications.clearLastNotificationResponseAsync();
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openDrama);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openDrama(response);
    });
    void refreshNewDramaRegistration();
    return () => subscription.remove();
  }, [router]);
  return null;
}

/**
 * React Navigation's default theme paints a light grey `background` behind every screen; this
 * replaces it with the app's black canvas so no default colour ever leaks through.
 */
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: color.bg,
    card: color.bg,
    border: color.line,
    primary: color.accent,
    text: color.text,
    notification: color.accent,
  },
};

/**
 * Every font in the app is bundled — never fetched at runtime. Old Android devices in this
 * archive's audience cannot be asked to wait on a font request.
 */
export default function RootLayout() {
  const [loaded, error] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
    NotoNastaliqUrdu_400Regular,
    PermanentMarker_400Regular,
  });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <CatalogProvider>
        <NotificationNavigation />
        <StatusBar style="light" backgroundColor={color.bg} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.bg },
            animation: "fade",
          }}
        />
      </CatalogProvider>
    </ThemeProvider>
  );
}
