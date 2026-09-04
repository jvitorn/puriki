# Puriki Android Release Plan

> **Purpose:** this document tracks Release Engineering work needed to produce the
> first installable Android APK build of Puriki via EAS Build. It follows the same
> checklist governance as `PURIKI_PRODUCT_ENGINEERING_ROADMAP.md`.
>
> **Important:** agents may complete and mark sub-tasks, but **only the project
> maintainer may mark a top-level phase (`Phase R1`, `Phase R2`, ...) as complete.**
> A phase may have every nested task checked while the phase itself stays
> unchecked — that means implementation is ready for maintainer acceptance, not
> that the milestone has been approved.

Scope of this plan is **APK release engineering only**:

- no Google Play / AAB;
- no automated GitHub release/publishing;
- no tag creation;
- no landing page changes;
- no Feature 2.0 work (List Sync, Multi-provider Sync, etc.).

---

- [ ] Phase R1 — EAS Release Foundation
  - [x] Audit `app.json`, `package.json`, `.gitignore`, `.env` / `.env.example` for existing release config, secrets, and dev-only settings.
  - [x] Confirm no `eas.json` existed prior to this work and no EAS project was linked (no `extra.eas.projectId` in `app.json`).
  - [x] Set `android.versionCode` explicitly in `app.json` (`1`), matching `version` `1.0.0`. No auto-increment logic introduced.
  - [x] Create `eas.json` with a `production-apk` build profile: `android.buildType: "apk"`, `distribution: "internal"`, `developmentClient: false`, `autoIncrement: false`, `appVersionSource: "local"`.
  - [x] Confirm `production-apk` is not a development-client build (no `expo-dev-client` scheme, no Metro dependency at runtime).
  - [x] Confirm the local Android native module `modules/purikuki-translation` is discovered by Expo's module autolinking (verified via `npx expo-modules-autolinking resolve --platform android`).
  - [x] Confirm `modules/purikuki-translation` structure is correct for EAS prebuild (`expo-module.config.json`, Gradle module, manifest, Kotlin module registration) — no changes required.
  - [x] Confirm environment variable handling: `EXPO_PUBLIC_ANILIST_CLIENT_ID` / `EXPO_PUBLIC_MAL_CLIENT_ID` are public OAuth client identifiers (safe to expose in a compiled app); no client secrets are committed or hardcoded in `eas.json`.
  - [x] Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:ci` — all green.
  - [x] Run `npx expo-doctor` — found 7 SDK-57 patch-version mismatches (`expo`, `expo-auth-session`, `expo-constants`, `expo-dev-client`, `expo-linking`, `expo-router`, `expo-secure-store`); resolved via `npx expo install --fix`; re-ran — 21/21 checks pass.
  - [x] Inspect resolved config via `npx expo config --json`: confirmed `android.package = com.jvitorn.puriki`, `version = 1.0.0`, `android.versionCode = 1`, `sdkVersion = 57.0.0`, all plugins present.
  - [ ] Execute `eas build --platform android --profile production-apk` and confirm a working, installable release APK is produced. **Requires maintainer EAS login/credentials — not performed by this agent.**

- [ ] Phase R2 — Android Signing
  - [x] Audit repository for any committed keystore, `credentials.json`, or signing material — none found. `/android/` and `/ios/` are correctly gitignored (native projects are generated on demand, not committed).
  - [x] Confirm no EAS project is linked yet (no `extra.eas.projectId` in `app.json`, no `eas-cli` session available in this environment).
  - [ ] Maintainer runs `eas init` (or accepts the prompt during the first `eas build`) to link this repo to an EAS project. This writes `extra.eas.projectId` into `app.json` — commit that change once it happens.
  - [ ] Maintainer runs the first `eas build --platform android --profile production-apk` and, when prompted, lets **EAS generate and manage the production Android keystore** (recommended for a first release — avoids ever handling the private key manually).
  - [ ] Maintainer confirms keystore ownership/backup via `eas credentials` (Android → production credentials) so the *same* signing key is reused for all future releases. The private key must never be committed to the repository.

- [ ] Phase R3 — First Production APK
  - [ ] Maintainer runs the build in Phase R1's final task and downloads the resulting APK.
  - [ ] Confirm the build artifact is an APK (not AAB) and is internal-distribution only.

- [ ] Phase R4 — Real Device Acceptance
  - [ ] Install the APK on a real Android device via sideload.
  - [ ] Confirm app launches without Metro/dev-client/dev-menu.
  - [ ] Confirm AniList/MAL login, list browsing, and translation (native module) work on-device.

- [ ] Phase R5 — Upgrade Path
  - [ ] Define how `version` / `android.versionCode` will be bumped for the next release (still no auto-increment automation planned at this stage).

- [ ] Phase R6 — Release Artifact
  - [ ] Decide how/where the accepted APK is stored or distributed (explicitly **not** GitHub Release yet, per current scope).

- [ ] Phase R7 — Puriki 1.0 Acceptance
  - [ ] Maintainer signs off that the Android release pipeline is reproducible, secure, and ready to be made official (tag, GitHub Release, etc. — out of scope for this document).

---

## Security notes (Phase R1 audit findings)

- No personal credentials, API secrets, or `.env` files are tracked in git. `.env` is correctly gitignored; only `.env.example` (empty placeholders) is committed.
- `EXPO_PUBLIC_MAL_CLIENT_SECRET` exists as an optional code path in `src/infrastructure/auth/mal/mal-auth-config.ts`, defaulting to an empty string and unused today (not present in `.env`/`.env.example`). **Do not** set this as an EAS environment variable for this app: any `EXPO_PUBLIC_*` variable is inlined into the JS bundle and is recoverable from the compiled APK, so it cannot hold a real secret. MAL's OAuth PKCE flow does not require a client secret for a public mobile client — leave it unset.
- All `console.*` diagnostic logging and verbose auth diagnostics are gated behind `__DEV__` or `process.env.NODE_ENV === 'development'`, which are compiled out of release builds. No sensitive data (tokens, credentials) is logged.
- No localhost/dev-server URLs, mock providers, or test accounts are wired into production code paths.

## Environment variables (EAS)

Public, non-secret build-time configuration needed for full functionality (OAuth login) in a production APK:

- `EXPO_PUBLIC_ANILIST_CLIENT_ID`
- `EXPO_PUBLIC_MAL_CLIENT_ID`

These should be provided to EAS Build via `eas env:create` (scoped to the `production` environment), not hardcoded into `eas.json`. The app degrades gracefully (guest/disconnected state) if they are absent, so this is required for a *fully functional* release candidate but not for the build to succeed.
