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
- Native React Native `fetch` requests and duplicate-request coalescing
- In-memory collection, summary, full-detail, and in-flight request caches
- Deterministic gradient artwork whenever remote images are missing or fail to load
- Static Jikan fixtures for all automated integration tests; tests never call the live API

## Screens and data sources

In Jikan mode, Home, Search, and Anime Details use the public Jikan v4 catalog. My List displays a locally generated sample of real catalog entries and saves changes only for the current process. Settings can switch between Jikan and mock modes, clear the catalog cache, refresh the Jikan sample, or reset current list changes.

Mock mode preserves the Phase 1 Faker-backed repositories, delay controls, forced-error controls, and deterministic scenarios. A mode change clears React Query data before the new repository pair is used, so Jikan IDs and mock IDs are never silently mixed.

Jikan mode is the development default. Tests default to mock mode and can continue injecting explicit repositories.

## Jikan endpoints

The integration uses React Native's global `fetch` directly with the Jikan v4 API at `https://api.jikan.moe/v4`. It does not use Axios, Ky, or a Jikan wrapper. Set `EXPO_PUBLIC_JIKAN_BASE_URL` only when development or automated tests need a different endpoint; the standard development setup requires no environment variable.

- `GET /top/anime`
- `GET /seasons/now`
- `GET /seasons/upcoming`
- `GET /anime?q=...&order_by=popularity&sort=asc&sfw=true&limit=25`
- `GET /anime/{id}/full`

“Upcoming” is used instead of the misleading “Recently Added” label because Jikan does not expose a reliable MAL catalog-addition timestamp.

The typed infrastructure client builds endpoint URLs, sends only `Accept: application/json` for GET requests, reads each response body once, and validates DTOs before mapping. A 12-second `AbortController` timeout and optional external cancellation signal apply to native and web requests. HTTP failures are mapped explicitly: 404 is not found, 429 is rate limiting, 500/502/503/504 are temporary service failures, malformed successful bodies are format errors, and fetch `TypeError` failures are network errors. Production UI receives concise application messages rather than upstream exception text.

Each logical request has at most three total attempts. Only rate limits, 500–504 responses, timeouts, and temporary network failures are retried. `Retry-After` seconds or HTTP dates take priority; otherwise, bounded backoff with jitter uses longer delays for rate limiting and shorter delays for network failures. React Query retries are disabled so it does not multiply the infrastructure policy.

The request scheduler spaces starts by at least 500 ms, allowing no more than two starts per second. Identical in-flight logical requests are coalesced under a stable key, including while retry handling is active. Every retry passes through the scheduler, different requests remain queued, and clearing the scheduler creates an isolated state generation so older running work cannot mutate the new queue.

Collection responses populate an in-memory mapped summary cache by MAL ID. Full details have a separate cache and enrich the summary cache. `getManyByIds` resolves the personal list from cached summaries in one bulk repository operation during normal initialization, avoiding one request per list card. Clearing the cache explicitly erases catalog and session shuffle state; no cache is written to disk. Refresh is different: it keeps the valid cache and current session data, loads all replacement discovery collections, and commits them only after the replacement succeeds. A failed refresh reports an error while previously loaded data remains available.

The catalog collections are deduplicated and shuffled once per application session. A suitable item with a synopsis, score, and image is selected as featured. The session user-list repository merges the same popular, seasonal, and upcoming collections, deduplicates MAL IDs, selects roughly 20–25 items with an injectable random generator, represents every status, includes known and unknown episode totals when available, and creates scored and unscored entries. Reset restores that session's sample; refresh transactionally replaces the catalog and then generates a new sample.

Home loads sections independently. Featured anime is preferred, but usable catalog content can provide a fallback. Continue Watching, Popular Now, This Season, and Upcoming retain their successful content when another section fails and expose section-specific retry actions. A full-page error appears only when no usable featured or catalog content is available.

## Architecture

The app preserves strict layered boundaries:

- `domain` owns models, repository contracts, errors, and pure business rules.
- `application` owns query keys, React Query hooks, mutations, and use cases.
- `infrastructure` owns the isolated native-fetch boundary, response validation, mapping, caches, and repository implementations.
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

For a development-only connectivity check, call `runJikanConnectivityDiagnostic` from `src/infrastructure/api/jikan/jikan-diagnostics.ts` in a debugger or temporary development tool. It sends `GET /top/anime?limit=1&sfw=true` through the same native transport and returns platform, status, elapsed time, and a classified error kind. Purikuki does not expose a diagnostic screen in production.

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

## Troubleshooting

### Jikan works in the browser but not in the app

Expo Web and the native application use independent networking and in-memory caches, so a browser result does not prove that the same native request was served successfully. A real HTTP 504 response means the native HTTPS request reached Jikan; it is not an Android cleartext, CORS, proxy, or network-permission problem. Jikan can return intermittent errors while connecting to its own upstream MyAnimeList data source.

Development request logs include the platform, logical request key, real URL, status, elapsed time, cache header, retry attempt, and a bounded sanitized diagnostic. They do not include full successful anime payloads. Use the connectivity diagnostic to compare native and web transport results without repository mapping. Jikan remains read-only, and Purikuki has no MyAnimeList authentication yet.

API structure and attribution: [Jikan REST API v4 documentation](https://docs.api.jikan.moe/).
