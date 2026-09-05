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
  - [x] (RC1 fix) Add `"environment": "production"` to the `production-apk` profile so EAS-hosted `production` environment variables (`EXPO_PUBLIC_ANILIST_CLIENT_ID`, `EXPO_PUBLIC_MAL_CLIENT_ID`) are actually injected at build time. Verified schema support and resolution with `npx eas-cli@latest config --platform android --profile production-apk`, which now returns `"environment": "production"` alongside the unchanged `buildType: "apk"`, `distribution: "internal"`, `developmentClient: false`, `autoIncrement: false`.
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
  - [ ] Maintainer confirms keystore ownership/backup via `eas credentials` (Android → production credentials) so the _same_ signing key is reused for all future releases. The private key must never be committed to the repository.

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

## RC1 validation findings & fixes

The first production APK (RC1, `version 1.0.0` / `versionCode 1`) was built and
sideloaded onto a real Android device. That real-device pass surfaced six
issues, all addressed in this hardening pass. `version`/`versionCode` were
**not** bumped for this — RC1's fixes still ship as `1.0.0` / `1`, since this
remains an internal RC, not a public release.

Each item below is checked only for what this pass actually implemented and
validated with automated tests (typecheck/lint/tests). None of this implies
Phase R4 (Real Device Acceptance) is complete — that still requires an actual
RC2 sideload by the maintainer.

- [x] **EAS `production` environment not applied to `production-apk`.** AniList
      and MyAnimeList both showed "sign-in is not configured for this build" on
      RC1 because the profile never told EAS which hosted environment to pull
      `EXPO_PUBLIC_ANILIST_CLIENT_ID` / `EXPO_PUBLIC_MAL_CLIENT_ID` from. Fixed
      by adding `"environment": "production"` to `eas.json`'s `production-apk`
      profile (see Phase R1 above). Validated via `eas config` profile
      resolution; real injection can only be confirmed by an actual RC2 build.
- [x] **MyAnimeList permanently showed "Coming soon" in onboarding.** The
      onboarding screen hardcoded `available: false` for MAL and short-circuited
      its status/label instead of reusing the same `useAuthSession` connection
      contract that Settings already uses symmetrically for both providers.
      Fixed in `src/presentation/screens/onboarding-screen.tsx`: onboarding now
      treats AniList and MAL identically, driven off
      `snapshot.connections[provider]`; an unconfigured client ID now surfaces
      the existing `'configuration'` auth-failure message inline (the same one
      Settings already showed), not "Coming soon". The now-dead
      `auth.comingSoon` translation key was removed from all three locales.
      Covered by 5 new tests in `onboarding-screen.test.tsx`.
- [x] **Status selector reflowed when a pill became active.** The five list
      statuses were laid out with `flex-row flex-wrap` and intrinsic pill
      widths, so the check icon appearing/disappearing changed a pill's width
      and shifted how many statuses fit per line. Fixed in
      `anime-status-selector.tsx` by switching to two fixed rows (3 + 2)
      of equal-width (`flex-1`) slots, with a permanent fixed-size icon slot
      per pill (blocked-lock, check, or empty) so toggling selection never
      changes a slot's width. Validated with 5 new parametrized tests in
      `anime-selectors.test.tsx` asserting the row grouping is identical for
      every one of the five possible active statuses.
- [x] **Literal `<br>` tags in the synopsis, original and translated.** AniList
      (and potentially MAL) descriptions can contain `<br>`/`<br/>`/`<br />`
      markup, which was passed through unmodified to both the display text and
      the ML Kit translator input. Added `normalizeHtmlLineBreaks` in
      `src/shared/utils/html-text.ts` (small, pure, reusable) and wired it into
      both `anilist-mapper.ts` and `mal-mapper.ts` at the DTO → domain
      boundary, so `AnimeCatalogItem.synopsis` is already clean by the time it
      reaches the UI or the translator — no changes needed in the translation
      hook or presentation component. Covered by a dedicated unit-test suite
      (`html-text.test.ts`) plus one regression test per mapper.
- [x] **"Where to watch" was always a single vertical column.** Fixed in
      `anime-streaming-section.tsx`: a single service still renders the
      original full-width card; two or more are laid out in fixed two-column
      rows (`flex-1` cards, invisible spacer for a trailing odd item), matching
      the 1/2/3/4/5-service layouts from the bug report exactly. Validated with
      6 new tests in `anime-streaming-section.test.tsx` covering every one of
      those counts.
- [x] **PT-BR showed "Prequela" instead of "Anterior".** Presentation-only
      localization fix: `details.continuityPrequel` in `pt-BR.ts` changed from
      `'Prequela'` to `'Anterior'`. The underlying `AnimeContinuityKind` domain
      value (`'prequel' | 'sequel'`) is untouched; EN (`Prequel`) and ES
      (`Precuela`) were left as-is since they were not reported as wrong.
      `details.continuitySequel` in PT-BR was already `'Sequência'`.

## Security notes (Phase R1 audit findings)

- No personal credentials, API secrets, or `.env` files are tracked in git. `.env` is correctly gitignored; only `.env.example` (empty placeholders) is committed.
- `EXPO_PUBLIC_MAL_CLIENT_SECRET` exists as an optional code path in `src/infrastructure/auth/mal/mal-auth-config.ts`, defaulting to an empty string and unused today (not present in `.env`/`.env.example`). **Do not** set this as an EAS environment variable for this app: any `EXPO_PUBLIC_*` variable is inlined into the JS bundle and is recoverable from the compiled APK, so it cannot hold a real secret. MAL's OAuth PKCE flow does not require a client secret for a public mobile client — leave it unset.
- All `console.*` diagnostic logging and verbose auth diagnostics are gated behind `__DEV__` or `process.env.NODE_ENV === 'development'`, which are compiled out of release builds. No sensitive data (tokens, credentials) is logged.
- No localhost/dev-server URLs, mock providers, or test accounts are wired into production code paths.

## Environment variables (EAS)

Public, non-secret build-time configuration needed for full functionality (OAuth login) in a production APK:

- `EXPO_PUBLIC_ANILIST_CLIENT_ID`
- `EXPO_PUBLIC_MAL_CLIENT_ID`

These should be provided to EAS Build via `eas env:create` (scoped to the `production` environment), not hardcoded into `eas.json`. The app degrades gracefully (guest/disconnected state) if they are absent, so this is required for a _fully functional_ release candidate but not for the build to succeed.
