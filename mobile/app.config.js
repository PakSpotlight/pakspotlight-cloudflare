const isAndroidTV = process.env.CLASSIC_TV_ANDROID_TV === "1";

/**
 * Keep the phone app as the default build.
 * Set CLASSIC_TV_ANDROID_TV=1 only for the separate Android TV APK.
 */
module.exports = ({ config }) => ({
  ...config,
  name: isAndroidTV ? "Classic TV Pakistan TV" : config.name,
  version: isAndroidTV ? "1.0.2" : config.version,
  orientation: isAndroidTV ? "landscape" : config.orientation,
  android: {
    ...config.android,
    package: isAndroidTV ? "com.classictvpakistan.tv" : config.android.package,
    versionCode: isAndroidTV ? 3 : config.android.versionCode,
  },
  plugins: [
    ...(config.plugins || []),
    ...(isAndroidTV ? ["./plugins/with-android-tv"] : []),
  ],
});
