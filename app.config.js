// Android Maps key is injected at build time. Do not commit a key.
// Set GOOGLE_MAPS_ANDROID_API_KEY in the environment (or as an EAS secret)
// before `eas build`. Web tracking uses a keyless Google Maps embed and
// does not need this value.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const android = { ...(config.android || {}) };
  const androidConfig = { ...(android.config || {}) };
  if (key) {
    androidConfig.googleMaps = { apiKey: key };
  } else {
    delete androidConfig.googleMaps;
  }
  if (Object.keys(androidConfig).length > 0) {
    android.config = androidConfig;
  } else {
    delete android.config;
  }
  return { ...config, android };
};
