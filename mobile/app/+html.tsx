import Constants from 'expo-constants';
import { ScrollViewStyleReset } from 'expo-router/html';

import { GOOGLE_MAPS_WEB_SCRIPT_ID } from '@/lib/loadGoogleMapsForWeb';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  const googleMapsKey =
    (Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined)?.googleMapsApiKey?.trim() ?? '';

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="color-scheme" content="light" />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Vector icon fonts for web export (matches @expo/vector-icons / expo-font preload in _layout). */}
        <style dangerouslySetInnerHTML={{ __html: iconFontFaces }} />
        {/* Async Maps JS bootstrap (matches Google’s snippet; `loadGoogleMapsScript` waits on this tag). */}
        {googleMapsKey ? (
          <script
            async
            id={GOOGLE_MAPS_WEB_SCRIPT_ID}
            src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&libraries=places`}
          />
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}

/** Light default for web (matches useColorScheme.web); avoids dark body flash when OS is in dark mode. */
const responsiveBackground = `
body {
  background-color: #fff;
}`;

/**
 * Bundled TTFs in `mobile/public/fonts/` → deployed as `/fonts/*.ttf` (see `mobile/dist/fonts` after export).
 * RN Web / Paper use both `ionicons` and `Ionicons`; Material Community uses `material-community` and
 * `Material Design Icons` — alias every name to the same files.
 */
const iconFontFaces = `
@font-face {
  font-family: 'Ionicons';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/Ionicons.ttf') format('truetype');
}
@font-face {
  font-family: 'ionicons';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/Ionicons.ttf') format('truetype');
}
@font-face {
  font-family: 'Material Design Icons';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/MaterialCommunityIcons.ttf') format('truetype');
}
@font-face {
  font-family: 'material-community';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/MaterialCommunityIcons.ttf') format('truetype');
}
`;
