# City-Pulse

HackMHC++ second place overall winner! Your one stop shop for everything NYC.

## Mobile app (Expo)

App code lives in `mobile/`.

1. Copy `mobile/.env.example` → `mobile/.env` and fill in values. **Firebase:** Web app keys from the Firebase console. **Google Maps:** set `GOOGLE_MAPS_API_KEY` in `mobile/.env` (enable Maps SDK in Google Cloud). `app.config.js` passes it into the app via `expo.extra` (no `EXPO_PUBLIC_` needed). Restart Expo after editing `.env`. **Profile** shows a masked preview. **iPhone** can use Apple MapKit without a key; **Android** needs the key for full map tiles or it uses the list fallback.

2. Install and run:

```bash
cd mobile
npm install
npm start
```

Then press `a` (Android) or `i` (iOS simulator on macOS) or scan the QR code with Expo Go.

3. Firestore seed data (from repo root):

```bash
npm install
```

You need a **service account key** (Firebase Console → Project settings → Service accounts → Generate new private key). Point the seed script at the JSON file (do not commit it):

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\full\path\to\serviceAccount.json"
npm run seed:firestore
```

Or set `FIREBASE_SERVICE_ACCOUNT` to that path in `mobile/.env` (loaded automatically). The script uses `EXPO_PUBLIC_FIREBASE_PROJECT_ID` from `mobile/.env` for the project id.

Ensure Firestore rules allow reads for the collections used by the app (`events`, `communityPosts`, `incidents`, `transitServiceAlerts`, …) for your demo.

## Publish (EAS)

Expo Application Services builds store-ready binaries.

1. Install the CLI globally or use `npx`: `npm install -g eas-cli`
2. Log in: `eas login`
3. In `mobile/`, link the project: `eas init` (creates/updates the Expo project id in `app.config.js`)
4. Android: `npm run build:prod:android` (or `preview` for an APK)
5. iOS (macOS + Apple Developer account): `npm run build:prod:ios`

Submit to stores: `npm run submit:android` / `npm run submit:ios` after you have store listings configured.

**Expo SDK:** The app targets **SDK 54** (npm `expo@54.0.6`) so it loads in **Expo Go 54.x** (e.g. client **54.0.6**). Use Node **≥ 20.19.4** if tooling warns (recommended for RN 0.81 / Metro).

**Google Play:** Android builds use **target and compile SDK 35** (Android 15), matching Play’s [target API policy](https://developer.android.com/google/play/requirements/target-sdk) for new submissions.

## Web (Firebase Hosting)

### Deploy your latest changes (web)

1. Commit or save your work; ensure `mobile/.env` has the keys you need (Firebase, Google Maps, etc.).
2. From the **repository root** (not only `mobile/`):

```bash
npm install
npx firebase login
npm run deploy:web
```

This runs `expo export -p web` into `mobile/dist`, then `firebase deploy --only hosting:city-pulse` (see `firebase.json` → **`site`: `city-pulse`**).

3. If you changed **`firestore.rules`**, deploy rules separately:

```bash
npx firebase deploy --only firestore:rules
```

4. First-time or new machine: `npx firebase login` selects the Google account with access to the Firebase project in `.firebaserc`.

### Static web assets (icons)

Vector icon fonts used by `@expo/vector-icons` / React Native Paper are copied into **`mobile/public/fonts/`** (`Ionicons.ttf`, `MaterialCommunityIcons.ttf`) so the web build does not rely on a CDN. `mobile/app/+html.tsx` declares matching `@font-face` rules; `mobile/app/_layout.tsx` still preloads the same families via `expo-font`. The floating tab bar (`components/navigation/CityPulseTabBar.tsx`) renders **Material Community Icons** via `@expo/vector-icons/MaterialCommunityIcons` so the bottom nav uses the same bundled font as the rest of the app (not Paper’s indirect icon loader, which can pick a different package on web).

In [Firebase Console](https://console.firebase.google.com/) → your project → **Hosting** → ensure a **site ID** named **`city-pulse`** exists (add another site if needed). Deploy targets that site; its URL is typically **`https://city-pulse.web.app`** when that site id is available.

`.firebaserc` sets the Firebase **project** (e.g. `citypulse-46b49`); the **hosting site** name is configured separately in `firebase.json`.

**Google Maps (web):** Google Cloud → Credentials → your Maps key → HTTP referrers → include `https://city-pulse.web.app/*` (and your project’s default `*.web.app` URL if you use it).

**Firebase Auth:** Authentication → Settings → **Authorized domains** → add the same hostnames you use in production.
