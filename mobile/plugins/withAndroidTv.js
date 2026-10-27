const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withAndroidTv(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application && manifest.application[0];
    const activity = application && (application.activity || []).find((item) =>
      String(item.$["android:name"] || "").endsWith("MainActivity")
    );

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
};
