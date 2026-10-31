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
import AppBootstrap from "../src/components/AppBootstrap";
import { CatalogProvider } from "../src/lib/catalog";
import { color } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

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
        <AppBootstrap />
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
