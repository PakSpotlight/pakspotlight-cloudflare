const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

module.exports = function withAndroidTv(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application && manifest.application[0];
    const activity = application && (application.activity || []).find((item) =>
      String(item.$["android:name"] || "").endsWith("MainActivity")
    );

    if (application) application.$["android:banner"] = "@drawable/tv_banner";

    if (activity) {
      const filters = activity["intent-filter"] || [];
      const launcherFilter = filters.find((filter) => {
        const actions = filter.action || [];
        const categories = filter.category || [];
        return (
          actions.some((item) => item.$["android:name"] === "android.intent.action.MAIN") &&
          categories.some((item) => item.$["android:name"] === "android.intent.category.LAUNCHER")
        );
      });

      if (launcherFilter) {
        launcherFilter.category = launcherFilter.category || [];
        if (!launcherFilter.category.some((item) => item.$["android:name"] === "android.intent.category.LEANBACK_LAUNCHER")) {
          launcherFilter.category.push({ $: { "android:name": "android.intent.category.LEANBACK_LAUNCHER" } });
        }
      }
    }

    manifest["uses-feature"] = manifest["uses-feature"] || [];
    const touchscreen = manifest["uses-feature"].find(
      (item) => item.$["android:name"] === "android.hardware.touchscreen"
    );
    if (touchscreen) {
      touchscreen.$["android:required"] = "false";
    } else {
      manifest["uses-feature"].push({
        $: { "android:name": "android.hardware.touchscreen", "android:required": "false" },
      });
    }
    return config;
  });

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const resourceDir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res", "drawable-nodpi");
      fs.mkdirSync(resourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(resourceDir, "tv_banner.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="320dp"
    android:height="180dp"
    android:viewportWidth="320"
    android:viewportHeight="180">
    <path android:fillColor="#080A09" android:pathData="M0,0h320v180h-320z" />
    <path android:fillColor="#C6F32A" android:pathData="M24,26h5v128h-5z" />
    <path android:fillColor="#FFFFFF" android:pathData="M48,58h94v6h-94z M48,73h72v4h-72z M48,86h86v4h-86z" />
    <path android:fillColor="#5F6569" android:pathData="M48,106h90v3h-90z M48,117h76v3h-76z" />
    <path android:fillColor="#C6F32A" android:pathData="M183,51 L183,129 L246,90 Z" />
    <path android:fillColor="#151917" android:pathData="M264,25h30v130h-30z" />
    <path android:fillColor="#202522" android:pathData="M273,37h12v106h-12z" />
</vector>
`,
        "utf8"
      );
      return config;
    },
  ]);
  return config;
};
