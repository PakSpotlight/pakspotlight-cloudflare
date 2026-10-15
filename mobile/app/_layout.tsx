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
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { CatalogProvider } from "../src/lib/catalog";
import { color } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

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
