# Puriki

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/brand/svg/puriki-horizontal-dark.svg">
    <img alt="Puriki" src="./assets/brand/svg/puriki-horizontal-light.svg" width="360">
  </picture>
</p>

<p align="center">
  A free, ad-free Android anime list client for AniList and MyAnimeList.
</p>

<p align="center">
  <strong>English</strong> ·
  <a href="./docs/readme/README.pt-BR.md">Português (Brasil)</a> ·
  <a href="./docs/readme/README.es.md">Español</a>
</p>

Puriki gives anime fans one focused Android experience for discovering titles
and managing the list they already keep on AniList or MyAnimeList. Connect
either provider, choose the active list when both are connected, or try the app
in guest mode.

[Official website](https://jvitorn.github.io/puriki-site/) ·
[GitHub Releases](https://github.com/jvitorn/puriki/releases) ·
[Product roadmap](./PURIKI_PRODUCT_ENGINEERING_ROADMAP.md)

## Features

- Discover popular, seasonal, upcoming, and featured anime.
- Search the catalog and open detailed title pages with synopsis, studios,
  genres, continuity, and streaming links when provider data is available.
- Connect an AniList or MyAnimeList account.
- Read your selected provider list and add or remove titles.
- Update watched episodes, list status, and score.
- Keep episode progress within the released-episode limit when that information
  is available.
- Use a temporary guest list without connecting an account.
- Continue browsing through provider-aware fallback and cached catalog data
  during eligible service failures.
- Use the interface in English, Brazilian Portuguese, or Spanish.
- Translate English synopses into Portuguese or Spanish on Android, on demand,
  using Google ML Kit on the device.

Puriki 1.0 manages one selected provider list at a time. It does **not** copy or
continuously synchronize lists between AniList and MyAnimeList.

## Supported services

| Service     | Discovery data             | Account connection | User-list management                           |
| ----------- | -------------------------- | ------------------ | ---------------------------------------------- |
| AniList     | Primary catalog source     | OAuth              | Read, add, remove, progress, status, and score |
| MyAnimeList | Automatic catalog fallback | OAuth with PKCE    | Read, add, remove, progress, status, and score |
| Guest mode  | Uses the available catalog | Not required       | Temporary in-process list                      |

Provider availability and the completeness of individual titles depend on the
data exposed by AniList and MyAnimeList.

## Screenshots

A look at Puriki running on Android.

<p align="center">
  <a href="./docs/readme/screenshots/home.png"><img src="./docs/readme/screenshots/home.png" alt="Home" width="200"></a>
  <a href="./docs/readme/screenshots/search.png"><img src="./docs/readme/screenshots/search.png" alt="Search" width="200"></a>
  <a href="./docs/readme/screenshots/anime-details.png"><img src="./docs/readme/screenshots/anime-details.png" alt="Anime details" width="200"></a>
  <a href="./docs/readme/screenshots/my-list.png"><img src="./docs/readme/screenshots/my-list.png" alt="My List" width="200"></a>
  <a href="./docs/readme/screenshots/settings.png"><img src="./docs/readme/screenshots/settings.png" alt="Settings" width="200"></a>
</p>

## Download

Puriki 1.0 is distributed directly as Android APKs. The first public release
will be available from the official
[GitHub Releases page](https://github.com/jvitorn/puriki/releases) as:

```text
puriki-v1.0.0-arm64-v8a.apk
puriki-v1.0.0-armeabi-v7a.apk
puriki-v1.0.0-x86_64.apk
puriki-v1.0.0-x86.apk
puriki-v1.0.0-universal.apk
SHA256SUMS.txt
```

Most modern Android phones and tablets should download `arm64-v8a`. If you are
not sure which one your device uses, `universal` works on any supported
device. `armeabi-v7a`, `x86_64`, and `x86` are additional compatibility builds
for older or less common devices. `SHA256SUMS.txt` contains the SHA-256
checksums for every published APK.

Puriki is not distributed through Google Play. No public release is claimed
until the GitHub Release and its signed APK assets are actually published.

## Install on Android

1. Download the APK from Puriki's official GitHub Release.
2. Open the downloaded file on your Android device.
3. If Android asks, allow installation from the browser or file manager you
   used.
4. Confirm the installation.

Android may warn that the app came from outside Google Play. Verify the filename
and release page before installing. Future APKs can be installed over the
existing app when they use the same signing key and a higher
`android.versionCode`.

## Privacy and security

- Puriki has no separate account service or Puriki-hosted backend containing a
  copy of your anime list.
- AniList and MyAnimeList OAuth tokens are stored on the device with Expo
  SecureStore.
- The production build is configured with public OAuth client IDs only. Client
  secrets must not be placed in `EXPO_PUBLIC_*` variables or bundled with the
  app.
- Language, onboarding state, selected provider, translation cache, and similar
  operational data may be stored locally on the device.
- Guest-list contents exist only for the current application process and may be
  lost when it restarts.
- Puriki 1.0 includes no advertising SDK and no first-party analytics backend.
- On-device synopsis translation may download Google ML Kit language models,
  but synopsis text is not sent to a Puriki server.

AniList, MyAnimeList, Google ML Kit, GitHub, and EAS are third-party services
with their own terms and privacy practices.

## Technology

Puriki is built with React Native, Expo, TypeScript, Expo Router,
React Native Reanimated, NativeWind, TanStack Query, i18next, Jest, and a local
Expo Module for Android ML Kit translation.

## Architecture

The application follows four main boundaries:

- `domain`: provider-neutral models, repository contracts, and business rules.
- `application`: use cases, authentication/session coordination, mutations,
  and runtime ports.
- `infrastructure`: AniList and MyAnimeList APIs, OAuth, storage, caching,
  resilience, repositories, and native translation adapters.
- `presentation`: Expo Router screens, components, providers, localization,
  and React Query integration.

Detailed feature planning belongs in the
[product engineering roadmap](./PURIKI_PRODUCT_ENGINEERING_ROADMAP.md), while
repeatable Android publication steps live in
[docs/RELEASING.md](./docs/RELEASING.md).

## Development

Requirements:

- A current Node.js LTS release and npm.
- Android Studio, the Android SDK, and a compatible JDK for native Android work.
- An emulator or physical Android device.

Install dependencies and create a local environment file:

```bash
npm ci
cp .env.example .env
```

Configure public application client IDs as needed:

```env
EXPO_PUBLIC_ANILIST_CLIENT_ID=
EXPO_PUBLIC_MAL_CLIENT_ID=
```

Do not add client secrets. The native OAuth redirect URIs are
`puriki://auth/anilist` and `puriki://auth/mal`.

Start Metro:

```bash
npm run start
```

Build and run Android:

```bash
npm run android
```

OAuth callbacks and on-device synopsis translation require a native
development/release build; Expo Go cannot provide the local native module.

## Quality

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test:ci
npx expo-doctor
```

Tests use injected transports and fixtures rather than live provider APIs.

## Roadmap

The current and planned product direction is tracked in
[PURIKI_PRODUCT_ENGINEERING_ROADMAP.md](./PURIKI_PRODUCT_ENGINEERING_ROADMAP.md).
List Sync, continuous multi-provider synchronization, and automatic application
update infrastructure are future considerations, not Puriki 1.0 features.

Public README information is maintained in English, Brazilian Portuguese, and
Spanish. When product or release facts change, keep all three versions
synchronized.

## Disclaimer

Puriki is an independent, unofficial project. It is not affiliated with,
endorsed by, sponsored by, or operated by AniList or MyAnimeList. Provider
names and trademarks belong to their respective owners.

## License

Puriki is released under the MIT License. See [LICENSE](./LICENSE) for
details.

The Puriki source code license does not grant rights over AniList,
MyAnimeList, their trademarks, APIs, data, artwork, or other third-party
content. Those remain subject to their respective owners' terms and licenses.
