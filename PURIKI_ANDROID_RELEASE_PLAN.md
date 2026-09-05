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

Scope of this plan is **Android release engineering and public-release
readiness**:

- no Google Play / AAB;
- no new EAS build during the documentation pass;
- no GitHub Release or tag creation during the documentation pass;
- no EAS Update, OTA channel, or automatic application updater;
- no Feature 2.0 work (List Sync, Multi-provider Sync, etc.).

---

- [x] Phase R1 — EAS Release Foundation
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
  - [x] Execute `eas build --platform android --profile production-apk` and confirm a working, installable release APK is produced. **Requires maintainer EAS login/credentials — not performed by this agent.**

- [x] Phase R2 — Android Signing
  - [x] Audit repository for any committed keystore, `credentials.json`, or signing material — none found. `/android/` and `/ios/` are correctly gitignored (native projects are generated on demand, not committed).
  - [x] Confirm no EAS project is linked yet (no `extra.eas.projectId` in `app.json`, no `eas-cli` session available in this environment).
  - [x] Maintainer runs `eas init` (or accepts the prompt during the first `eas build`) to link this repo to an EAS project. This writes `extra.eas.projectId` into `app.json` — commit that change once it happens.
  - [x] Maintainer runs the first `eas build --platform android --profile production-apk` and, when prompted, lets **EAS generate and manage the production Android keystore** (recommended for a first release — avoids ever handling the private key manually).
  - [x] Maintainer confirms keystore ownership/backup via `eas credentials` (Android → production credentials) so the _same_ signing key is reused for all future releases. The private key must never be committed to the repository.

- [x] Phase R3 — First Production APK
  - [x] Maintainer runs the build in Phase R1's final task and downloads the resulting APK.
  - [x] Confirm the build artifact is an APK (not AAB) and is internal-distribution only.

- [x] Phase R4 — Real Device Acceptance
  - [x] Install the accepted production APK via sideload on a real Android device.
  - [x] Confirm the application launches as a production app without Metro, development client, development menu, or another development-only runtime dependency.
  - [x] Validate AniList authentication with the production OAuth configuration.
  - [x] Validate MyAnimeList authentication with the production OAuth configuration.
  - [x] Validate catalog and user-list browsing.
  - [x] Validate add/remove and progress/status/score user-list mutations.
  - [x] Validate native Android synopsis translation.
  - [x] Accept launcher icon, adaptive masks, native splash, startup transition, and bottom navigation on device.
  - [x] Validate finished/releasing/not-yet-released episode tracking where applicable to the test data.

- [x] Phase R5 — Upgrade Path
  - [x] Keep the Puriki 1.0 public release at `version = 1.0.0` and `android.versionCode = 1`.
  - [x] Require every future Android APK for `com.jvitorn.puriki` to increment `android.versionCode`.
  - [x] Choose the next patch, minor, or major semantic version according to the actual release scope.
  - [x] Keep version and versionCode changes manual; no automatic increment mechanism is required for Puriki 1.0.

- [x] Phase R6 — Release Artifact
  - [x] Distribute official Puriki Android binaries through GitHub Releases.
  - [x] Use the already accepted EAS production APK as the Puriki 1.0 release asset; do not create another build for documentation preparation.
  - [x] Publish the accepted artifact under the predictable filename `puriki-v1.0.0.apk`.
  - [x] Point the official landing page to the stable GitHub Release asset rather than hosting or proxying APK files.
  - [x] Document final-artifact SHA-256 calculation and disclosure in `docs/RELEASING.md`; the accepted APK is not present in this workspace, so no checksum was fabricated.

- [x] Phase R7 — Puriki 1.0 Acceptance
  - [x] Record maintainer acceptance that the production APK was built and passed real-device testing.
  - [x] Confirm Android signing is configured and the production key must remain continuous across upgrades.
  - [x] Confirm production AniList and MyAnimeList OAuth configuration works.
  - [x] Confirm the production APK pipeline is reproducible.
  - [x] Accept Puriki 1.0 as technically ready for final public-facing preparation.

- [ ] Phase R8 — Public README & Repository Readiness
  - [x] Rewrite `README.md` as the canonical English front page for Puriki 1.0.
  - [x] Create the Brazilian Portuguese translation at `docs/readme/README.pt-BR.md`.
  - [x] Create the Spanish translation at `docs/readme/README.es.md`.
  - [x] Add working language navigation between EN, PT-BR, and ES.
  - [x] Keep the three versions equivalent in product information and section structure.
  - [x] Replace development-history wording with concise product-facing language.
  - [x] Remove obsolete claims, including the former denial of MyAnimeList OAuth and user-list support.
  - [x] Verify feature claims against the current implementation.
  - [x] Present Puriki as one consistent Android experience over AniList, MyAnimeList, and guest mode.
  - [x] Describe AniList catalog, OAuth, and list management accurately.
  - [x] Describe MyAnimeList fallback, OAuth PKCE, and list management accurately.
  - [x] Describe the temporary in-process guest list accurately.
  - [x] Document add/remove, progress, status, and score management.
  - [x] Document English, Brazilian Portuguese, and Spanish UI support.
  - [x] Add a concise supported-services matrix.
  - [x] Add honest Android download, GitHub Releases, and sideload instructions without claiming the release already exists.
  - [x] Add concise, code-verified privacy and security information.
  - [x] Add the current technology stack and a concise four-layer architecture overview.
  - [x] Add development setup, native requirements, environment variables, and quality commands.
  - [x] Link `PURIKI_PRODUCT_ENGINEERING_ROADMAP.md` and distinguish shipped 1.0 behavior from future List Sync, Multi-provider Sync, and update infrastructure.
  - [x] Add the independent-project disclaimer for AniList and MyAnimeList.
  - [x] Add a synchronized-maintenance note for the three README languages.
  - [x] Add a screenshots section and a real-device capture plan without fabricating product captures.
  - [ ] Maintainer supplies and approves real application screenshots.
  - [x] Verify public links, relative paths, logo assets, headings, tables, and code fences; no potentially stale status badges were introduced.
  - [x] Disclose that the repository currently has no project-wide license instead of making an unsupported open-source licensing claim.
  - [ ] Maintainer chooses and adds a project-wide license if open-source redistribution is intended.
  - [ ] Maintainer performs final desktop/mobile GitHub rendering and content acceptance, then checks Phase R8.

- [ ] Phase R9 — Landing Page Release Readiness
  - [x] Locate and audit the official landing-page repository in the shared workspace.
  - [x] Reference the official landing page from the EN, PT-BR, and ES READMEs.
  - [x] Prepare landing-page source links for the canonical `jvitorn/puriki` repository.
  - [x] Keep the landing page's repository link pointed back to the application source.
  - [x] Prepare the Android download CTA to consume the latest stable GitHub Release at build time.
  - [x] Require the exact public asset filename `puriki-v<version>.apk`.
  - [x] Ignore draft/prerelease releases for the stable download CTA and avoid linking an RC/development APK.
  - [x] Present Puriki 1.0, AniList/MyAnimeList capabilities, and EN/PT-BR/ES support accurately in landing-page source.
  - [x] Explain direct GitHub Release APK distribution without advertising Google Play.
  - [x] Avoid advertising automatic application updates or released List Sync/Multi-provider Sync.
  - [x] Verify landing privacy and independent-project disclaimer copy against the application.
  - [x] Verify the source implementation remains responsive and passes its automated accessibility, test, typecheck, lint, formatting, and production-build gates.
  - [ ] Merge and deploy the landing-page source changes to the production GitHub Pages branch.
  - [ ] After the v1.0.0 GitHub Release exists, refresh stable release metadata and verify the real `puriki-v1.0.0.apk` download.
  - [ ] Maintainer validates the deployed landing page on desktop and mobile.
  - [ ] Maintainer validates repository → landing page → GitHub Release and landing page → repository navigation in production.
  - [ ] Maintainer confirms all deployed public claims and checks Phase R9.

---

## RC1 validation findings & fixes

The first production APK (RC1, `version 1.0.0` / `versionCode 1`) was built and
sideloaded onto a real Android device. That real-device pass surfaced six
issues, all addressed in this hardening pass. `version`/`versionCode` were
**not** bumped for this — RC1's fixes still ship as `1.0.0` / `1`, since this
remains an internal RC, not a public release.

Each item below was initially checked only for implementation and automated
validation. The maintainer subsequently accepted the RC2 APK on a real device;
that final acceptance is now recorded in Phase R4.

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

## RC2 visual/UX hardening

This final pre-RC2 pass was limited to episode-tracking correctness and targeted
Android/presentation polish. Checked implementation items were covered by
automated validation and were subsequently accepted on a real device by the
maintainer.

- [x] **Separate total episodes from the trackable episode ceiling.**
      `AnimeTrackingContext` now carries both `totalEpisodes` and
      `releasedEpisodes`; the provider-neutral domain rule selects the safe
      progress ceiling by airing status. AniList list/catalog/identity queries
      now retain the next airing episode so authenticated repository mutations
      also clamp releasing progress to the released count. Covered across
      domain, AniList, MAL, guest, presentation mutation, rapid-multitap, card,
      and list-item tests.
- [x] **Reduce Android adaptive-icon visual occupancy without redesigning the
      mark.** The existing adaptive and monochrome foreground PNGs remain
      transparent 1024×1024 assets. Their foreground layer was scaled to
      78.125% and recentered; the normal icon, adaptive background, colors, and
      symbol artwork were not changed. Dimensions, alpha channels, and centered
      bounds were validated automatically.
- [x] **Reduce the native splash mark.** Expo splash `imageWidth` is now `132`
      (from `180`) with the same image, contain mode, and `#090C11` background.
- [x] **Add a short React Native startup transition after the native splash.**
      Readiness remains owned by the onboarding/auth gate; the presentation
      overlay performs a 600 ms opacity/scale transition, calls native splash
      hide only after layout, skips motion when the OS requests Reduce Motion,
      and cannot trap users when splash hiding or onboarding storage fails.
      First-run and returning-user gates remain covered by automated tests.
- [x] **Flatten bottom navigation.** Removed the rounded floating container and
      animated primary pill. The active icon/label now use the primary color
      with a restrained scale/opacity transition; inactive items remain muted.
      The top divider, four-tab order, 56 px touch slots, press/long-press
      behavior, selected accessibility state, and bottom safe-area padding are
      preserved and tested.
- [x] **Maintainer real-device acceptance for the next APK.** The maintainer
      compared the launcher icon under multiple masks, inspected splash size,
      startup transition and Reduce Motion on cold start, verified
      first-run/returning-user routing, and exercised
      finished/releasing/not-yet-released tracking plus all four tabs.

## Application update infrastructure decision

Automatic application updating is intentionally not part of Puriki 1.0 and is
not a release blocker. The standalone signed APK works without:

- `expo-updates` or EAS Update configuration;
- OTA release channels;
- `runtimeVersion` configuration introduced only for OTA;
- automatic GitHub Release version checks inside the app;
- in-app “new version available” checks;
- automatic APK downloads;
- background updater infrastructure.

Puriki 1.0 users update manually from official GitHub Releases. Update
infrastructure may be evaluated during Puriki 2.x.

## Release-plan lifecycle

This checklist is intentionally temporary. Do not delete it until:

1. the maintainer accepts Phase R8;
2. the maintainer accepts Phase R9;
3. all permanent release knowledge has been migrated.

Reusable release engineering knowledge now lives in `docs/RELEASING.md`.
Immediately before the final v1.0.0 release commit/tag workflow, the maintainer
should verify that document, delete this temporary plan, and then run the normal
quality gates. The plan must not be deleted while either R8 or R9 remains
unchecked.

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
