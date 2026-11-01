# AGENTS.md

This file defines the repository-wide working agreement for coding agents and
contributors. It applies to every file under the Puriki repository root.

## Project intent

Puriki is an Android-first React Native + Expo anime list client. Version 1.0
supports AniList, MyAnimeList, and a temporary guest experience while keeping
provider details behind provider-neutral domain and application boundaries.

Before changing behavior, read the relevant source and tests. For roadmap or
release work, also read:

- `PURIKI_PRODUCT_ENGINEERING_ROADMAP.md`
- `PURIKI_ANDROID_RELEASE_PLAN.md`, while it exists
- `docs/RELEASING.md`

Do not turn maintenance, bug-fix, or release-hardening tasks into feature
development. List Sync, continuous Multi-provider Sync, automatic application
updates, OTA infrastructure, and broad visual redesigns are separate scopes.

## Architecture boundaries

Keep dependencies pointing inward:

```text
presentation -> application -> domain
infrastructure -> application/domain
composition -> concrete infrastructure
```

### `src/domain`

- Owns provider-neutral models, repository contracts, errors, and business
  rules.
- Must not import React, React Native, Expo, provider DTOs, storage, networking,
  or presentation code.
- Business decisions belong in small, pure, testable rules. Do not duplicate
  them in screens, hooks, mutations, or repositories.

### `src/application`

- Owns use cases, ports, coordinators, provider selection, session contracts,
  and mutation intent.
- May depend on `domain`, but not on concrete infrastructure or presentation.
- Express side effects through contracts so they remain testable.

### `src/infrastructure`

- Owns AniList/MyAnimeList transport, OAuth, DTO validation, mapping, caching,
  persistence, resilience, repositories, and native adapters.
- Validate untrusted API/storage data before mapping it into domain models.
- Keep provider IDs, DTOs, headers, endpoints, and error formats inside their
  provider boundary.
- Map provider data into provider-neutral types once; do not leak DTOs upward.

### `src/presentation`

- Owns Expo Router screens, components, hooks, providers, localization usage,
  and React Query coordination.
- Must not call `fetch`, consume provider DTOs, or construct repositories.
- Ordinary presentation files must not import concrete infrastructure. The
  application composition/provider entrypoint is the intentional exception.
- Components consume domain/application results; they do not reimplement
  business rules.

### Other boundaries

- `src/localization` owns all user-facing strings and locale selection.
- `src/tests` owns shared fixtures, builders, and in-memory doubles.
- `modules/purikuki-translation` owns the Android Expo Module for Google ML
  Kit translation. The legacy module name is intentional.
- Generated `android/` and `ios/` projects are not source-of-truth and must
  not be committed.

The architecture test in `src/tests/architecture/layer-boundaries.test.js`
must remain green. Update a boundary only through an explicit architectural
decision, not as a shortcut.

## Domain and list semantics

- The current domain identity is the MyAnimeList anime ID. AniList-specific IDs
  remain infrastructure metadata. Do not start an identity migration inside an
  unrelated task.
- Keep `totalEpisodes`, `releasedEpisodes`, and the trackable episode limit
  semantically distinct.
- Use the centralized tracking helpers in `src/domain/rules/anime-tracking.ts`.
  Never recreate fallbacks such as
  `totalEpisodes ?? releasedEpisodes` in presentation code.
- Preserve airing-status rules for progress and completion. A title that has
  not released cannot start progress, and planned totals must not be treated as
  released episodes.
- Clamp writes at domain/repository boundaries as well as in UI affordances.
  Do not rely on disabled buttons as the only invariant.
- When both authenticated providers are connected, Puriki manages one selected
  primary list at a time. Do not imply that 1.0 synchronizes the two lists.
- Guest list membership is temporary and process-local. Do not describe it as
  a durable local account.

## Provider behavior

- AniList is the primary catalog source; eligible failures may use the public
  MyAnimeList fallback and then valid cached data.
- AniList and MyAnimeList both support authenticated user-list reads and
  add/remove/progress/status/score mutations.
- Preserve error classification, rate-limit handling, request coordination,
  family circuit breakers, and cache completeness rules. Do not replace them
  with broad catch-and-ignore behavior.
- Authenticated writes must remain conservative: serialize per anime and do not
  add automatic mutation retries when a provider may already have applied the
  write.
- Do not call live provider services from automated tests. Inject transports
  and use deterministic fixtures.

## Authentication and security

- `EXPO_PUBLIC_ANILIST_CLIENT_ID` and `EXPO_PUBLIC_MAL_CLIENT_ID` are public
  OAuth application identifiers.
- Never place client secrets, access tokens, refresh tokens, signing material,
  or private credentials in `EXPO_PUBLIC_*`, source files, fixtures, logs, or
  documentation.
- Production OAuth tokens belong in Expo SecureStore, separated by provider.
  Do not move them to AsyncStorage or React Query persistence.
- Never log authorization headers, tokens, OAuth callback payloads, or user
  credentials.
- Keep `.env`, keystores, `credentials.json`, and generated signing files
  untracked.

## UI, motion, and accessibility

- Reuse existing design tokens and UI primitives. Avoid hardcoded colors,
  spacing, or one-off components when a project primitive already exists.
- Puriki 1.0 is dark-first. Do not advertise or implement a theme mode without
  an explicit feature scope.
- Preserve safe areas, accessible touch targets, labels, roles, selected
  states, disabled states, long-press behavior, and navigation event semantics.
- Animations must be short, purposeful, and respect Reduce Motion through
  Reanimated or the existing motion abstraction.
- Keep the four-tab order unless the roadmap task explicitly changes it:
  Home, Search, My List, Settings.
- Do not fabricate screenshots or present mockups as real device captures.

## Localization

- Do not hardcode user-facing copy in components or domain code.
- Add or update equivalent strings in English, Brazilian Portuguese, and
  Spanish.
- Keep interpolation keys and pluralization contracts aligned across locales.
- Use natural translations, not word-for-word output. Preserve technical names
  such as AniList, MyAnimeList, OAuth, APK, and provider status values where
  appropriate.
- A locale change must not silently clear catalog or account data.

## Testing expectations

Add the smallest regression test that proves the requested behavior at the
lowest useful layer:

- pure domain rule -> domain unit test;
- DTO or provider mapping -> mapper/parser test;
- repository boundary -> repository test with injected transport;
- hook/provider behavior -> React hook/provider test;
- visible interaction/accessibility -> component or screen test;
- dependency direction -> architecture test.

Cover success, the reported regression, and meaningful boundary/failure cases.
Avoid snapshots for behavior that can be asserted semantically.

Before handing off a normal code change, run:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test:ci
```

For dependency, Expo, native-module, or release configuration changes, also run:

```bash
npx expo-doctor
npx expo config --json
```

Use `npm ci` for clean verification. Change dependencies through npm and never
edit `package-lock.json` by hand.

## Documentation standards

- `README.md` is the canonical English public README.
- Keep `docs/readme/README.pt-BR.md` and
  `docs/readme/README.es.md` synchronized with public product and release
  facts.
- Verify claims against current code. In particular, do not repeat the obsolete
  claim that MyAnimeList lacks OAuth or user-list support.
- Distinguish shipped 1.0 behavior from roadmap work. Never advertise List
  Sync, continuous Multi-provider Sync, Google Play distribution, OTA updates,
  or automatic APK updates as released.
- Do not claim a public GitHub Release exists until it actually exists.
- Do not call the project open source unless a project-wide license has been
  selected and added. Source visibility and an open-source license are not the
  same thing.
- The official landing page is a separate repository. Do not redesign or
  publish it unless that repository is explicitly included in the task.

## Release governance

- Only the maintainer may approve or check a top-level roadmap/release phase,
  unless the maintainer explicitly states that acceptance has occurred.
- Agents may check nested tasks only after implementation and appropriate
  validation.
- Do not create tags, GitHub Releases, store submissions, AABs, new EAS builds,
  or public uploads unless the user explicitly requests that exact action.
- Do not change `version` or `android.versionCode` as incidental cleanup.
- Puriki 1.0 remains `version = 1.0.0` and
  `android.versionCode = 1`.
- Every future public Android APK must increment `android.versionCode` and use
  the established production signing key.
- The production EAS profile is `production-apk`, uses the `production`
  environment, builds an APK, and must keep `developmentClient: false`.
- Official APKs belong in GitHub Releases and use
  `puriki-v<version>.apk`. Do not commit APK files to this repository.
- Puriki 1.0 does not require EAS Update, OTA channels, runtime update checks,
  automatic downloads, or a background updater.

## Working discipline

- Inspect `git status` before editing. Existing changes belong to the user;
  preserve them and avoid unrelated rewrites.
- Prefer `rg` and `rg --files` for discovery.
- Make the smallest coherent change and follow existing naming/style.
- Do not use destructive Git commands or discard changes without explicit
  authorization.
- Do not commit generated coverage, build output, native projects, APKs, local
  environment files, or secrets.
- Keep comments focused on why an invariant exists, not on narrating obvious
  code.
- If a requirement conflicts with current behavior or documentation, verify
  the implementation and report the discrepancy rather than inventing a fact.

## Definition of done

A task is complete only when:

1. the requested behavior or documentation is implemented within scope;
2. architectural and security boundaries remain intact;
3. relevant regression tests exist;
4. localization and accessibility are updated when affected;
5. required quality gates pass;
6. documentation and release claims match reality;
7. remaining maintainer-only or real-device work is reported explicitly.
