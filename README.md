# Purikuki

Purikuki is a dark-first React Native anime list manager built with Expo. Phase 2A adds a professional, read-only Jikan catalog while keeping the personal anime list simulated and session-local.

Jikan is an unofficial MyAnimeList data source. It supplies public anime metadata and artwork, but it does not support authenticated list updates. Purikuki has no MyAnimeList authentication or synchronization in this phase.

## Phase 2A features

- Home discovery backed by real Jikan titles, metadata, MAL IDs, and remote artwork
- Featured, Continue Watching, Popular Now, This Season, and Upcoming rails
- Remote title search across primary and alternative titles after two normalized characters
- Full anime details from Jikan's full-detail endpoint
- Session-only personal list containing approximately 20–25 real anime IDs across every list status
- Local episode, status, and score mutations using the existing domain rules
- Explicit Jikan and deterministic mock data-source modes
- Direct `jikan-ts` requests and duplicate-request coalescing
- In-memory collection, summary, full-detail, and in-flight request caches
- Deterministic gradient artwork whenever remote images are missing or fail to load
- Static Jikan fixtures for all automated integration tests; tests never call the live API

## Screens and data sources

In Jikan mode, Home, Search, and Anime Details use the public Jikan v4 catalog. My List displays a locally generated sample of real catalog entries and saves changes only for the current process. Settings can switch between Jikan and mock modes, clear the catalog cache, refresh the Jikan sample, or reset current list changes.

Mock mode preserves the Phase 1 Faker-backed repositories, delay controls, forced-error controls, and deterministic scenarios. A mode change clears React Query data before the new repository pair is used, so Jikan IDs and mock IDs are never silently mixed.

Jikan mode is the development default. Tests default to mock mode and can continue injecting explicit repositories.

## Jikan endpoints

The integration uses `@tutkli/jikan-ts` over the current Jikan v4 API at `https://api.jikan.moe/v4`:

- `GET /top/anime`
- `GET /seasons/now`
- `GET /seasons/upcoming`
- `GET /anime?q=...&order_by=popularity&sort=asc&sfw=true&limit=25`
- `GET /anime/{id}/full`

“Upcoming” is used instead of the misleading “Recently Added” label because Jikan does not expose a reliable MAL catalog-addition timestamp.

The `jikan-ts` `JikanClient` executes every HTTP request. Its supported `kyInstance` extension is configured with the package's own `BASE_URL` and an `Accept` header, avoiding the unnecessary `Content-Type` header that otherwise triggers failing CORS preflight requests for browser GETs. The infrastructure boundary spaces collection starts by 500 ms, validates responses, retries only transient failures at most twice, maps transport errors into safe application errors, and coalesces identical in-flight repository operations. React Query does not add another retry layer. A single failed collection does not discard other successful Jikan data.

Collection responses populate a mapped summary cache by MAL ID. Full details have a separate cache and enrich the summary cache. `getManyByIds` resolves the personal list from cached summaries in one bulk repository operation during normal initialization, avoiding one request per list card. Clearing the cache also clears session catalog shuffles; no cache is written to disk.

The catalog collections are deduplicated and shuffled once per application session. A suitable item with a synopsis, score, and image is selected as featured. The session user-list repository merges the same popular, seasonal, and upcoming collections, deduplicates MAL IDs, selects roughly 20–25 items with an injectable random generator, represents every status, includes known and unknown episode totals when available, and creates scored and unscored entries. Reset restores that session's sample; refresh clears the catalog and generates a new sample.

## Architecture

The app preserves strict layered boundaries:

- `domain` owns models, repository contracts, errors, and pure business rules.
- `application` owns query keys, React Query hooks, mutations, and use cases.
- `infrastructure` owns the isolated `jikan-ts` boundary, response validation, mapping, caches, and repository implementations.
- `mocks` owns deterministic factories, fixtures, scenarios, and timing configuration.
- `presentation` consumes domain models only and receives repositories through `RepositoryProvider`.
- `app` contains thin Expo Router route modules only.

```text
src/
├── application/{mutations,queries,use-cases}/
├── domain/{errors,models,repositories,rules}/
├── infrastructure/
│   ├── api/jikan/{fixtures,...}
│   └── repositories/{jikan,mock,session}/
├── mocks/{config,factories,fixtures,scenarios}/
├── presentation/{components,hooks,providers,screens,theme,utils}/
├── shared/{constants,types,utils}/
└── tests/{builders,mocks,render,setup}/
```

No screen calls `fetch`, consumes Jikan DTOs, or constructs repositories.

## Getting started

Requirements: a current Node.js LTS release, npm, and an Expo-compatible Android/iOS emulator or physical device.

```bash
npm install
npm start
```

Use Settings → Data source to switch between Jikan and mock modes during development. The selection lasts for the current mounted app session only.

Platform-specific commands are also available:

```bash
npm run android
npm run ios
npm run web
```

## Quality commands

```bash
npx expo install --fix
npx expo-doctor
npm run typecheck
npm run lint
npm run format:check
npm run test:ci
```

Use `npm test` or `npm run test:watch` for local test iteration. `npm run format` writes Prettier formatting.

## Business rules

Progress is always a non-negative whole number and is capped when the catalog has a known total. Unknown totals remain incrementable. Reaching the final known episode marks an entry completed; moving to Plan to Watch resets progress; returning to Watching preserves valid progress. Scores are either empty or whole numbers from 1 through 10.

## Current limitations

- Jikan is read-only and unofficial; Purikuki is not affiliated with Jikan or MyAnimeList.
- Personal-list entries, catalog caches, data-source selection, and settings are not persisted.
- There is no MAL OAuth, authentication, list synchronization, offline mutation queue, backend, or user profile.
- Remote artwork depends on the URLs supplied by Jikan; deterministic local gradients remain the fallback.
- End-to-end tests and store publication remain out of scope.

API structure and attribution: [Jikan REST API v4 documentation](https://docs.api.jikan.moe/).
