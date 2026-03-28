/** Google Play: new apps & updates must target API 35+ (Android 15) from 2025-08-31. */
const ANDROID_PLAY_TARGET_SDK = 35;

/** From .env — not prefixed with EXPO_PUBLIC; passed into the app via `extra` and native config. */
const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  '';

const nycOpenDataAppToken =
  process.env.NYC_OPEN_DATA_APP_TOKEN ||
  process.env.EXPO_PUBLIC_NYC_OPEN_DATA_APP_TOKEN ||
  '';

module.exports = {
  expo: {
    name: 'CityPulse',
    slug: 'city-pulse',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'citypulse',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0f172a',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.citypulse.hackathon',
      config: {
        googleMapsApiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY || googleMapsApiKey,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'CityPulse uses your location to show nearby transit and community activity.',
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#0f172a',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      package: 'com.citypulse.hackathon',
      permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || googleMapsApiKey,
        },
      },
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-build-properties',
        {
          android: {
            compileSdkVersion: ANDROID_PLAY_TARGET_SDK,
            targetSdkVersion: ANDROID_PLAY_TARGET_SDK,
            buildToolsVersion: '35.0.0',
          },
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'CityPulse uses your location to show nearby transit and community activity.',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      googleMapsApiKey,
      nycOpenDataAppToken,
    },
  },
};
