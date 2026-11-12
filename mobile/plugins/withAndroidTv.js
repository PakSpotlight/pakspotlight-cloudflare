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
    const ensureFeature = (name, required) => {
      const existing = manifest["uses-feature"].find((item) => item.$["android:name"] === name);
      if (existing) {
        existing.$["android:required"] = String(required);
      } else {
        manifest["uses-feature"].push({
          $: { "android:name": name, "android:required": String(required) },
        });
      }
    };

    ensureFeature("android.software.leanback", true);
    ensureFeature("android.hardware.touchscreen", false);
    return config;
  });

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      // Emit key-down and key-up actions on Android TV. The JS player handler
      // consumes only key-up, so holding Left/Right cannot trigger a burst of seeks.
      const javaRoot = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "java");
      const findMainApplication = (dir) => {
        if (!fs.existsSync(dir)) return null;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const found = findMainApplication(full);
            if (found) return found;
          } else if (entry.name === "MainApplication.kt" || entry.name === "MainApplication.java") {
            return full;
          }
        }
        return null;
      };
      const mainApplication = findMainApplication(javaRoot);
      if (!mainApplication) throw new Error("Android TV build could not locate MainApplication source");
      let appSource = fs.readFileSync(mainApplication, "utf8");
      if (!appSource.includes("ReactFeatureFlags.enableKeyDownEvents = true")) {
        if (!appSource.includes("import com.facebook.react.config.ReactFeatureFlags")) {
          appSource = appSource.replace(/^(package [^\n]+\n)/m, "$1import com.facebook.react.config.ReactFeatureFlags\n");
        }
        const isKotlin = mainApplication.endsWith(".kt");
        const statement = isKotlin
          ? "ReactFeatureFlags.enableKeyDownEvents = true"
          : "ReactFeatureFlags.enableKeyDownEvents = true;";
        const loader = /SoLoader\.init\([^\n]+\)/;
        if (!loader.test(appSource)) throw new Error("Android TV build could not find SoLoader.init in MainApplication");
        appSource = appSource.replace(loader, (match) => match + "\n    " + statement);
        fs.writeFileSync(mainApplication, appSource, "utf8");
      }

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
    <path android:fillColor="#D8B15A" android:pathData="M24,26h5v128h-5z" />
    <path android:fillColor="#FFFFFF" android:pathData="M48,58h94v6h-94z M48,73h72v4h-72z M48,86h86v4h-86z" />
    <path android:fillColor="#5F6569" android:pathData="M48,106h90v3h-90z M48,117h76v3h-76z" />
    <path android:fillColor="#D8B15A" android:pathData="M183,51 L183,129 L246,90 Z" />
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
