import Constants from "expo-constants";
import { HomeScreen } from "../../src/screens/HomeScreen";
import { TvApp } from "../../src/screens/TvApp";

export default function HomeRoute() {
  return Constants.expoConfig?.extra?.classicTvAndroidTv === true ? <TvApp /> : <HomeScreen />;
}
