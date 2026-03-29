const path = require('path');
const { mergeEnvIntoProcessEnv } = require('../scripts/merge-env.cjs');

/**
 * Loads repo-root `.env` and `mobile/.env` (root wins on duplicate keys). Ensures keys exist before we read
 * them below. Metro also calls the same merge so EXPO_PUBLIC_* inlines match export builds.
 */
mergeEnvIntoProcessEnv(__dirname);

/** Google Play: new apps & updates must target API 35+ (Android 15) from 2025-08-31. */
const ANDROID_PLAY_TARGET_SDK = 35;

/** From .env — not prefixed with EXPO_PUBLIC; passed into the app via `extra` and native config. */
const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  '';

/** Directions / transit REST and multi-mode routing — separate credential in Cloud if you want. */
const googleMapsRoutesApiKey =
  process.env.GOOGLE_MAPS_ROUTES_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ROUTES_API_KEY ||
  '';

/**
 * Android / iOS Google Maps SDK entry in manifest — must be non-empty for native tiles.
 * Uses `GOOGLE_MAPS_API_KEY` when set; otherwise the routes key (single-key setups).
 * JS still reads maps vs routes separately via `expo.extra` (see mapsEnv).
 */
const googleMapsNativeSdkKey = googleMapsApiKey || googleMapsRoutesApiKey;

const nycOpenDataAppToken =
  process.env.NYC_OPEN_DATA_APP_TOKEN ||
  process.env.EXPO_PUBLIC_NYC_OPEN_DATA_APP_TOKEN ||
  '';

/** Client reads this from expo.extra (set GEMINI_API_KEY in mobile/.env). */
const geminiApiKey =
  process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

const geminiModel =
  process.env.GEMINI_MODEL || process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';

/** Native Google Sign-In — Web client ID from Firebase (same value works as clientId for useIdTokenAuthRequest). */
const googleWebClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_WEB_CLIENT_ID || '';

const googleIosClientId =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || process.env.GOOGLE_IOS_CLIENT_ID || '';

const googleAndroidClientId =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || process.env.GOOGLE_ANDROID_CLIENT_ID || '';

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
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY || googleMapsNativeSdkKey,
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
          apiKey:
            process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || googleMapsNativeSdkKey,
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
      /** Maps JS / tiles (`GOOGLE_MAPS_API_KEY` only — +html async script; routes-only setups inject via JS). */
      googleMapsApiKey,
      /** Directions & `directions/json` (`GOOGLE_MAPS_ROUTES_API_KEY`). */
      googleMapsRoutesApiKey,
      nycOpenDataAppToken,
      geminiApiKey,
      geminiModel,
      googleWebClientId,
      googleIosClientId,
      googleAndroidClientId,
    },
  },
};
