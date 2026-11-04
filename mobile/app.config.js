// Keep the phone app unchanged; the TV workflow opts into a separate landscape build.
module.exports = ({ config }) => {
  const isTv = process.env.CLASSIC_TV_ANDROID_TV === "1";
  const plugins = [...(config.plugins || [])];

  if (isTv) {
    // SDK 56 introduced the expo-status-bar config plugin. Older SDK versions
    // ship a runtime package without that plugin, so do not register it early.
    const expoSdkMajor = Number(require("expo/package.json").version.split(".")[0]);
    const statusBarIndex = plugins.findIndex(
      (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === "expo-status-bar"
    );
    if (expoSdkMajor < 56 && statusBarIndex >= 0) {
      plugins.splice(statusBarIndex, 1);
    } else if (expoSdkMajor >= 56 && statusBarIndex < 0) {
      plugins.push("expo-status-bar");
    }

    // Expo SDK 58 / React Native 0.88 Android baseline; phone API 23 remains unchanged.
    const buildProperties = plugins.findIndex(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties"
    );
    if (buildProperties >= 0) {
      const [name, options = {}] = plugins[buildProperties];
      plugins[buildProperties] = [
        name,
        {
          ...options,
          android: {
            ...(options.android || {}),
            minSdkVersion: 24,
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            buildToolsVersion: "36.0.0",
          },
        },
      ];
    }
    plugins.push("./plugins/withAndroidTv");
  }

  return {
    ...config,
    name: isTv ? "Classic TV Pakistan TV" : config.name,
    version: isTv ? "1.0.7" : config.version,
    orientation: isTv ? "landscape" : config.orientation,
    android: {
      ...config.android,
      package: isTv ? "com.classictvpakistan.tv" : config.android.package,
      versionCode: isTv ? 8 : config.android.versionCode,
    },
    extra: {
      ...(config.extra || {}),
      classicTvAndroidTv: isTv,
    },
    plugins,
  };
};
