# Releasing Puriki for Android

This document keeps the reusable release-engineering rules that should remain
after the temporary `PURIKI_ANDROID_RELEASE_PLAN.md` is removed.

## Release invariants

- The Android package is `com.jvitorn.puriki`.
- Public releases use semantic versions in `app.json`.
- Every new Android APK must use an `android.versionCode` greater than every
  APK previously released with the same package.
- Puriki 1.0 uses `version: 1.0.0` and `android.versionCode: 1`.
- Choose the next patch, minor, or major version from the actual release scope.
  Version and versionCode increments are manual.
- Keep the same production signing key for every upgrade. Never commit a
  keystore, `credentials.json`, passwords, or private signing material.

## Production configuration

The EAS profile is `production-apk`:

- environment: `production`
- distribution: `internal`
- development client: disabled
- Android build type: `apk`
- version auto-increment: disabled

The EAS `production` environment supplies these public OAuth identifiers:

- `EXPO_PUBLIC_ANILIST_CLIENT_ID`
- `EXPO_PUBLIC_MAL_CLIENT_ID`

Do not configure client secrets as `EXPO_PUBLIC_*` values. EAS-managed Android
credentials must continue using the established production key.

## Preflight

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run test:ci
npx expo-doctor
npx expo config --json
npx eas-cli@latest config --platform android --profile production-apk
```

Verify the intended `version`, increasing `android.versionCode`, package,
production environment, APK build type, and disabled development client before
starting a build.

## Build and accept the APK

Run a production build only when a new artifact is actually required:

```bash
npx eas-cli@latest build --platform android --profile production-apk
```

Install the resulting APK on a real Android device and validate startup,
authentication for both providers, catalog/list reads, list mutations,
on-device translation, navigation, and representative episode-tracking states.
Confirm that the app runs without Metro, a development client, or a development
menu.

## Prepare the release asset

Rename the accepted artifact using:

```text
puriki-v<version>.apk
```

For Puriki 1.0:

```text
puriki-v1.0.0.apk
```

Calculate SHA-256 after the final rename:

```bash
sha256sum puriki-v1.0.0.apk
```

PowerShell:

```powershell
Get-FileHash .\puriki-v1.0.0.apk -Algorithm SHA256
```

Record the checksum in the GitHub Release notes or another clearly linked
release artifact. Do not calculate it from a different build or rename a file
after recording the checksum.

## Publish through GitHub Releases

1. Create the release tag `v<version>` from the accepted release commit.
2. Create a non-draft public GitHub Release for that tag.
3. Attach exactly one official APK named `puriki-v<version>.apk`.
4. Include installation context, material changes, known limitations, and the
   APK SHA-256 in the release notes.
5. Verify the asset downloads and installs over the previous release when
   applicable.
6. Refresh and deploy the official landing page so its stable-release metadata
   points to the new asset.

Android binaries are distributed through official Puriki GitHub Releases, not
committed to the app or landing-page repositories.

## Update policy

Puriki 1.0 is a standalone APK. It does not require EAS Update, OTA channels,
`runtimeVersion` for OTA, an in-app version checker, automatic APK downloads,
or background update infrastructure. Users update manually by installing a
newer officially signed APK. Update infrastructure may be evaluated for Puriki
2.x.
