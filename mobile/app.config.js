// Keep the phone package ID unchanged; the TV workflow sets CLASSIC_TV_ANDROID_TV=1.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    package:
      process.env.CLASSIC_TV_ANDROID_TV === "1"
        ? "com.classictvpakistan.tv"
        : config.android.package,
  },
});
