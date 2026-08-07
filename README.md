# Purikuki

Purikuki is a dark-first React Native anime list manager built with Expo. It combines a read-only public anime catalog with a simulated personal list that exists only for the current application process.

Jikan remains the primary catalog provider. The official public MyAnimeList API v2 is available as an automatic fallback and as a standalone catalog source. Purikuki uses only an application Client ID for MAL catalog requests. It does not implement OAuth, access tokens, user-profile requests, or MAL list synchronization.

## Catalog modes

Settings exposes four session-only data-source modes:

- **Automatic** is the non-test default. It uses Jikan first, then public MAL for eligible failures, then a previously normalized valid cache.
- **Jikan only** uses the public Jikan v4 catalog without MAL fallback and retains Jikan's full retry policy.
- **MyAnimeList only** uses the official public MAL v2 catalog directly. This option is disabled until a Client ID is configured.
- **Mock** uses the existing deterministic local development catalog and remains the automated-test default.

Changing modes clears React Query state and constructs a new compatible catalog and session-list repository pair. This prevents mock, Jikan, and MAL IDs from being mixed.

Home loads Featured, Continue Watching, Popular Now, This Season, and Upcoming independently. Search starts after two normalized characters. Anime Details and the session-only progress, status, and score controls use the same provider-neutral domain model in every mode.

## MyAnimeList public catalog

Configure the application Client ID in a local `.env` file:

```env
EXPO_PUBLIC_MAL_CLIENT_ID=
```

Restart Metro after changing `.env` so Expo reloads the public environment value:

```bash
npx expo start --clear
```

MAL requests use React Native's global `fetch`, a 12-second `AbortController` timeout, and only these GET headers:

```text
Accept: application/json
X-MAL-CLIENT-ID: <application-client-id>
```

The Client ID is never rendered or logged. Do not put a MAL Client Secret in React Native; application bundles cannot keep a secret. This project sends no authorization header and does not call authenticated user or list endpoints.

The integration implements these official catalog endpoints at `https://api.myanimelist.net/v2`:

- `GET /anime?q=...` for search
- `GET /anime/{id}` for details
- `GET /anime/ranking?ranking_type=bypopularity` for Popular Now
- `GET /anime/ranking?ranking_type=upcoming` for Upcoming
- `GET /anime/season/{year}/{season}` for the current season

The requested fields are:

```text
id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,
rank,popularity,num_list_users,num_scoring_users,nsfw,genres,media_type,status,
num_episodes,start_season,broadcast,source,average_episode_duration,rating,studios
```

Responses are validated at the infrastructure boundary before they are mapped. MAL titles, alternative titles, synopsis, named genres and studios, episode count, score, season, year, readable airing status, and picture fallbacks map into `AnimeCatalogItem`; MAL DTO names do not enter the domain or UI. Artwork falls back from the requested size to the available `main_picture` size, and missing artwork uses deterministic ID-based gradient seeds.

See the [official MyAnimeList API v2 reference](https://myanimelist.net/apiconfig/references/api/v2) for the upstream contract.

## Automatic fallback and recovery

Automatic mode gives Jikan at most two total attempts so a failing primary does not delay MAL for the full Jikan-only retry sequence. MAL also uses at most two total attempts. Both clients retry only temporary network failures, timeouts, rate limits, and HTTP 500/502/503/504. `Retry-After` seconds or HTTP dates take priority; otherwise a short bounded, jittered delay is used. React Query does not add another retry layer.

MAL fallback is eligible after a Jikan network failure, timeout, rate limit, supported 5xx response, malformed response, or unexpectedly empty required discovery collection. Invalid arguments, programming errors, and legitimate detail 404 results do not trigger fallback. Mock data is never substituted when live providers fail.

The Jikan circuit breaker opens after two consecutive eligible failures and remains open for five minutes. While open, automatic mode skips Jikan and goes directly to MAL. After cooldown it permits one half-open Jikan probe: success closes the circuit, while an eligible failure reopens it. Application errors and legitimate 404 results do not count as provider-health failures.

Successful normalized results are cached by logical operation. If Jikan and MAL both fail, automatic mode returns the previous valid result when one exists and records `cache` as the source. Failed manual refreshes do not erase valid catalog data. **Clear all catalog caches** intentionally removes provider and resilient caches and resets the circuit breaker.

Provider caches remain in memory only. Collection responses populate the ID summary cache, details enrich it, and identical in-flight requests are coalesced. `getManyByIds` resolves known collection IDs without one detail request per list entry. Discovery order and Featured selection remain stable for the application session.

## Jikan catalog

The native Jikan v4 integration uses:

- `GET /top/anime`
- `GET /seasons/now`
- `GET /seasons/upcoming`
- `GET /anime?q=...&order_by=popularity&sort=asc&sfw=true&limit=25`
- `GET /anime/{id}/full`

Jikan-only mode preserves its scheduler, duplicate-request coalescing, explicit error mapping, 12-second timeout, and maximum three-attempt policy. Automatic mode injects the shorter two-attempt policy into the same client and repository; it does not duplicate the transport.

API structure and attribution: [Jikan REST API v4 documentation](https://docs.api.jikan.moe/).

## Service diagnostics

Settings → **Service diagnostics** compares providers independently:

- **Test MyAnimeList API** directly requests one `bypopularity` ranking result with `id,title,main_picture`. It bypasses Jikan, the resilient repository, React Query, and catalog caches. A successful result shows HTTP status, elapsed time, and one sample title.
- **Test Jikan API** directly checks the Jikan native transport in a separate request.

Only one diagnostic can run at a time. Results are accessible alerts and are not persisted. The MAL diagnostic reports missing configuration, rejected Client IDs, rate limiting, service failures, network failures, timeouts, and invalid payloads without exposing credentials or upstream response bodies.

## Session-only personal list

The personal list remains simulated in every mode. Live catalog modes build a sample from already loaded popular, seasonal, and upcoming collections, deduplicate real provider IDs, and avoid N+1 details when summaries are available. Episode progress, list status, and user score changes use local domain rules and are discarded when the process restarts. No MAL account or authenticated list endpoint is used.

Progress is a non-negative whole number and is capped when the catalog has a known total. Unknown totals remain incrementable. Reaching the final known episode marks an entry completed; Plan to Watch resets progress; returning to Watching preserves valid progress. Scores are empty or whole numbers from 1 through 10.

## Architecture

The app preserves layered boundaries:

- `domain` owns provider-neutral models, repository contracts, errors, and rules.
- `application` owns query keys, React Query hooks, mutations, and use cases.
- `infrastructure` owns native transports, DTO validation, mapping, caches, circuit breaking, and repositories.
- `mocks` owns deterministic factories, fixtures, scenarios, and timing.
- `presentation` receives repositories through `RepositoryProvider` and consumes domain models only.
- `app` contains thin Expo Router route modules.

```text
src/infrastructure/
├── api/
│   ├── jikan/
│   └── mal/
└── repositories/
    ├── jikan/
    ├── mal/
    ├── resilient/
    ├── session/
    └── mock/
```

No screen calls `fetch`, consumes provider DTOs, or constructs repositories. Settings receives only direct diagnostic functions and session-only runtime source/circuit status.

## Getting started

Requirements: a current Node.js LTS release, npm, and an Expo-compatible emulator or physical device.

```bash
npm install
npx expo start --clear
```

Platform-specific commands:

```bash
npm run android
npm run ios
npm run web
```

## Quality commands

Automated tests use injected fetch implementations and static fixtures; they never call live Jikan or MAL services.

```bash
npm install
npx expo install --fix
npx expo-doctor
npm run typecheck
npm run lint
npm run format
npm run format:check
npm run test:ci
```

## Current limitations

- Personal-list data, catalog caches, settings, diagnostic results, and source selection are not persisted.
- Public catalog availability and remote artwork depend on Jikan or MAL.
- MAL OAuth, login, profile access, list synchronization, offline mutation storage, a backend, and E2E tests are out of scope.
- Purikuki is not affiliated with Jikan or MyAnimeList.

## Troubleshooting

### Jikan is unavailable

Use Settings → **Test Jikan API** to test Jikan directly. In Automatic mode, eligible failures use MAL when configured; after two consecutive failures the circuit skips Jikan for five minutes. Runtime catalog status shows the latest source and circuit state. A real Jikan 5xx response can reflect an upstream failure and does not imply Android cleartext or CORS configuration trouble.

### Test MyAnimeList API fails

The diagnostic bypasses Jikan and all catalog caches. Check its classified message and HTTP status. Network and temporary service failures may receive one bounded retry. HTTP 401 or 403 means MAL rejected the application Client ID. Restart Metro after changing `.env`.

### MyAnimeList Client ID is not configured

Add `EXPO_PUBLIC_MAL_CLIENT_ID` to the local `.env`, then restart Metro with `npx expo start --clear`. Automatic mode continues as Jikan-only until configured, and **MyAnimeList only** remains disabled. Do not add a Client Secret.
