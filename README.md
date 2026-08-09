# Purikuki

Purikuki is a dark-first React Native anime list manager built with Expo. It combines a read-only public anime catalog with a simulated personal list that exists only for the current application process.

Jikan remains the primary catalog provider. The official public MyAnimeList API v2 is available as an automatic fallback and as a standalone catalog source. Purikuki uses only an application Client ID for MAL catalog requests. It does not implement OAuth, access tokens, user-profile requests, or MAL list synchronization.

## Catalog modes

Settings exposes four session-only data-source modes:

- **Automatic** is the non-test default. It uses Jikan first per operation family, then public MAL for that operation's eligible failures, then a previously normalized valid cache.
- **Jikan only** uses the public Jikan v4 catalog without MAL fallback and retains Jikan's full retry policy.
- **MyAnimeList only** uses the official public MAL v2 catalog directly. This option is disabled until a Client ID is configured.
- **Mock** uses the existing deterministic local development catalog and remains the automated-test default.

Changing modes clears React Query state and constructs a new compatible catalog and session-list repository pair. This prevents mock, Jikan, and MAL IDs from being mixed.

Home loads Featured, Continue Watching, Popular Now, This Season, and Upcoming independently. Search starts after two normalized characters. Anime Details and the session-only progress, status, and score controls use the same provider-neutral domain model in every mode.

## Localization

The complete interface is available in English, Brazilian Portuguese, and Spanish. Settings → **Language** offers those three manual choices plus **System default**. The preference is stored with AsyncStorage; System default is resolved with Expo Localization and checked again when the app becomes active. Catalog titles, alternative titles, synopsis, genres, and studio names remain exactly as supplied by the active provider.

Translation resources are bundled locally under `src/localization/locales`, so interface translation works offline. Changing the interface language makes no network request and does not clear or refetch React Query data. Dates and numbers rendered by the interface use locale-aware `Intl` formatters.

On Android Development/Release Builds, Portuguese and Spanish users can explicitly translate an English anime synopsis with Google. Purikuki uses [Google ML Kit on-device Translation](https://developers.google.com/ml-kit/language/translation) and never replaces the original provider synopsis. The action first checks a source-text-aware AsyncStorage cache, then downloads the required ML Kit model over Wi-Fi when necessary and translates locally on the device. English does not show the translation action, and changing the interface language never translates automatically.

Translated results display Google's official unmodified “powered by Google Translate” attribution badge. The bundled white badge assets come from Google's [Cloud Translation attribution resources](https://cloud.google.com/translate/attribution). Purikuki is not affiliated with or endorsed by Google.

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

Jikan resilience is isolated into `featured`, `popular`, `seasonal`, `upcoming`, `search`, and `details` operation families. Each family has its own circuit breaker, which opens after two consecutive eligible final-operation failures and remains open for five minutes. While one family is open, Automatic mode skips only that Jikan capability and uses MAL for it; healthy families continue using Jikan. `getDetailsById` and `getManyByIds` share the Details family, while all normalized search queries share the Search family. After cooldown, one request per family becomes the half-open probe. Success closes that family circuit, while an eligible failure reopens it. Application errors and legitimate 404 results do not count as provider-health failures.

Jikan HTTP 429 responses are handled separately from endpoint health. `Retry-After` activates one provider-wide rate-limit gate; when the header is missing, the gate uses a bounded 15-second default. Requests that begin while the gate is active use MAL without opening otherwise healthy family circuits. After the window expires, the next operation may use Jikan normally.

Developer runtime status shows compact Popular, Seasonal, Upcoming, Search, and Details rows with independent circuit and source state. Featured still has an isolated circuit internally, but its row is omitted because it is a composite selection derived from discovery collections rather than a direct Jikan endpoint. A separate development-only action resets Jikan circuit state; clearing catalog data does not reset provider health.

Successful normalized results are cached by logical operation. If Jikan and MAL both fail, Automatic mode returns the previous valid result for that same operation when one exists and records `cache` for that family. Popular, Seasonal, and Upcoming refresh independently, replacing each family only after a fresh usable result; a Popular failure can therefore use MAL without discarding healthy Jikan Seasonal or Upcoming refreshes. **Clear active catalog cache** and **Clear all catalog caches** remove data caches without pretending provider health recovered or resetting circuit state.

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
- **Test Jikan API** sequentially checks raw Jikan Details (`/anime/1/full`), Popular (`/top/anime?limit=1&sfw=true`), Seasonal (`/seasons/now?limit=1&sfw=true`), Upcoming (`/seasons/upcoming?limit=1&sfw=true`), and Search (`/anime?q=Naruto&limit=1&sfw=true`). It uses the existing 500 ms request scheduler and bypasses catalog repositories, caches, fallback, and circuit breakers. The result is Healthy, Degraded, Unavailable, or Rate limited and includes one compact row per endpoint.

Only one diagnostic can run at a time. Results are accessible alerts and are not persisted. Diagnostics report configuration, authorization, rate limiting, service, network, timeout, and invalid-payload failures without exposing credentials or large upstream response bodies. A failing Popular endpoint no longer makes healthy Jikan Details or Seasons appear unavailable.

## Session-only personal list

The personal list remains simulated in every mode. Live catalog modes build a sample from already loaded popular, seasonal, and upcoming collections, deduplicate real provider IDs, and avoid N+1 details when summaries are available. Episode progress, list status, and user score changes use local domain rules and are discarded when the process restarts. No MAL account or authenticated list endpoint is used.

Progress is a non-negative whole number and is capped when the catalog has a known total. Unknown totals remain incrementable. Reaching the final known episode marks an entry completed; Plan to Watch resets progress; returning to Watching preserves valid progress. Scores are empty or whole numbers from 1 through 10.

In Mock mode, Settings → Developer tools → **Mock environment** includes **Generate 100-item test list**. It replaces the current mock dataset with exactly 100 deterministic matching catalog/list records, designed to exercise four 25-item pages without network access. **Reset current list** restores the normal mock baseline. This development control resets only `user-list` React Query entries; catalog query caches are left intact.

## Architecture

The app preserves layered boundaries:

- `domain` owns provider-neutral models, repository contracts, errors, and rules.
- `application` owns query keys, React Query hooks, mutations, and use cases.
- `infrastructure` owns native transports, DTO validation, mapping, caches, circuit breaking, and repositories.
- `mocks` owns deterministic factories, fixtures, scenarios, and timing.
- `localization` owns local resources, system-locale resolution, persistence, localized presentation errors, and locale-aware formatting.
- `presentation` receives repositories through `RepositoryProvider` and consumes domain models only.
- `modules/purikuki-translation` owns the small Android Expo Modules bridge to Google ML Kit; presentation code depends only on the `SynopsisTranslator` contract.
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

## Android Development Build

Synopsis translation uses a custom Android native module and therefore requires a Purikuki Development Build; Expo Go cannot execute this feature. The persistent Android application identifier is `com.jvitorn.purikuki`.

With the Android toolchain and a USB-debuggable device already configured, install dependencies and build/install the app locally:

```bash
npm install
npx expo run:android --device
```

After the Development Build is installed, start Metro for it with:

```bash
npm run start:dev-client
```

JavaScript/TypeScript-only changes normally work through Fast Refresh without rebuilding. Rebuild the native app after changing the local Expo Module, native dependencies, or native app configuration. Missing translation models are downloaded on the first user-requested translation and require Wi-Fi by product policy.

The Android bridge is implemented in `modules/purikuki-translation` and is regenerated into the native project through Expo Continuous Native Generation. The repository intentionally does not commit generated `android/` or `ios/` directories. iOS translation is not implemented or validated in this phase, and web safely keeps the original synopsis without offering a cloud translator.

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

- Personal-list data, catalog caches, diagnostic results, and source selection are not persisted. The interface-language preference is persisted.
- Public catalog availability and remote artwork depend on Jikan or MAL.
- On-device synopsis translation is Android-only, requires a Purikuki Development Build, and may require a one-time Wi-Fi model download. Expo Go, web, and iOS keep the original synopsis without native translation.
- MAL OAuth, login, profile access, list synchronization, offline mutation storage, a backend, and E2E tests are out of scope.
- Purikuki is not affiliated with Jikan or MyAnimeList.

## Troubleshooting

### Jikan is unavailable

Use Settings → **Test Jikan API** to test five Jikan endpoint families directly. In Automatic mode, eligible failures use MAL when configured; after two consecutive final-operation failures only that family's circuit skips Jikan for five minutes. Runtime catalog status shows app-observed Jikan health plus independent source and circuit rows. A real Jikan 5xx response can reflect an upstream failure and does not imply Android cleartext or CORS configuration trouble.

### Test MyAnimeList API fails

The diagnostic bypasses Jikan and all catalog caches. Check its classified message and HTTP status. Network and temporary service failures may receive one bounded retry. HTTP 401 or 403 means MAL rejected the application Client ID. Restart Metro after changing `.env`.

### MyAnimeList Client ID is not configured

Add `EXPO_PUBLIC_MAL_CLIENT_ID` to the local `.env`, then restart Metro with `npx expo start --clear`. Automatic mode continues as Jikan-only until configured, and **MyAnimeList only** remains disabled. Do not add a Client Secret.
