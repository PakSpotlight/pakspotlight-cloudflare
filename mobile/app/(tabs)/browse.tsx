import Constants from "expo-constants";
import { BrowseScreen } from "../../src/screens/BrowseScreen";
import { TvApp } from "../../src/screens/TvApp";

export default function BrowseRoute() {
  return Constants.expoConfig?.extra?.classicTvAndroidTv === true
    ? <TvApp initialPage="browse" />
    : <BrowseScreen />;
}
