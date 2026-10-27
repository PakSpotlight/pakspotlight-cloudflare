// Keep the phone app unchanged; the TV workflow opts into a separate landscape build.
module.exports = ({ config }) => {
  const isTv = process.env.CLASSIC_TV_ANDROID_TV === "1";
  const plugins = [...(config.plugins || [])];

  if (isTv) {
    plugins.push("./plugins/withAndroidTv");
  }

  return {
    ...config,
    name: isTv ? "Classic TV Pakistan TV" : config.name,
    version: isTv ? "1.0.2" : config.version,
    orientation: isTv ? "landscape" : config.orientation,
    android: {
      ...config.android,
      package: isTv ? "com.classictvpakistan.tv" : config.android.package,
      versionCode: isTv ? 3 : config.android.versionCode,
    },
    extra: {
      ...(config.extra || {}),
      classicTvAndroidTv: isTv,
    },
    plugins,
  };
};
