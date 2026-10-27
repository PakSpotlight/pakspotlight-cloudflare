const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Make the TV variant discoverable by Android TV launchers while retaining
 * the ordinary launcher entry so the APK can also be started from settings.
 */
module.exports = function withAndroidTV(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const androidNS = "http://schemas.android.com/apk/res/android";

    manifest["uses-feature"] = manifest["uses-feature"] || [];
    const features = manifest["uses-feature"];
    const leanbackFeature = features.find(
      (item) => item.$?.[androidNS + ":name"] === "android.software.leanback"
    );
    if (!leanbackFeature) {
      features.push({
        $: {
          [androidNS + ":name"]: "android.software.leanback",
          [androidNS + ":required"]: "true",
        },
      });
    }

    const touchscreenFeature = features.find(
      (item) => item.$?.[androidNS + ":name"] === "android.hardware.touchscreen"
    );
    if (touchscreenFeature) {
      touchscreenFeature.$[androidNS + ":required"] = "false";
    } else {
      features.push({
        $: {
          [androidNS + ":name"]: "android.hardware.touchscreen",
          [androidNS + ":required"]: "false",
        },
      });
    }

    const application = manifest.application?.[0];
    const activity = application?.activity?.find((item) =>
      (item.$?.[androidNS + ":name"] || "").endsWith("MainActivity")
    );
    if (activity) {
      activity["intent-filter"] = activity["intent-filter"] || [];
      const alreadyHasLeanback = activity["intent-filter"].some((filter) =>
        (filter.category || []).some(
          (category) =>
            category.$?.[androidNS + ":name"] === "android.intent.category.LEANBACK_LAUNCHER"
        )
      );
      if (!alreadyHasLeanback) {
        activity["intent-filter"].push({
          action: [
            { $: { [androidNS + ":name"]: "android.intent.action.MAIN" } },
          ],
          category: [
            { $: { [androidNS + ":name"]: "android.intent.category.LEANBACK_LAUNCHER" } },
          ],
        });
      }
    }

    return mod;
  });
};
