import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import Constants from "expo-constants";
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

declare const require: (path: string) => { default: React.ComponentType };

void SplashScreen.preventAutoHideAsync();

// Do not even load the notifications module in TV builds. It is phone-only.
const isTvBuild = Constants.expoConfig?.extra?.classicTvAndroidTv === true;
const AppBootstrap = isTvBuild ? null : require("../src/components/AppBootstrap").default;

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
        {AppBootstrap ? <AppBootstrap /> : null}
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
