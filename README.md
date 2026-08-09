# Purikuki

Purikuki is a dark-first React Native anime list manager built with Expo. It combines a resilient public anime catalog with a temporary guest list that exists only for the current application process.

Jikan is the primary catalog provider. The official public MyAnimeList API v2 is its automatic fallback, followed by a previously valid in-memory operation cache. Purikuki uses only an application Client ID for MAL catalog requests. It does not implement OAuth, access tokens, user-profile requests, or MAL list synchronization.

## Production catalog and Settings

Catalog routing is infrastructure behavior, not a user preference:

```text
Jikan primary → eligible failure → public MAL fallback → valid cache
```

There is no runtime mock mode and no user-selectable data source. Production startup always creates this resilient graph. Tests inject deterministic in-memory repositories explicitly through `RepositoryProvider`; those test doubles are not shipped as a product data source.

Public Settings contains **Account**, **Language**, and **About**. Account truthfully shows MyAnimeList as not connected until OAuth exists. Developer Tools is hidden by default and can be enabled by tapping the About description five times within the three-second inactivity window. Its persisted panel contains service diagnostics, read-only catalog health, separate cache/circuit actions, build information, and an action to disable the tools. It never overrides provider routing.

Home loads Featured, Continue Watching, Popular Now, This Season, and Upcoming independently. Search starts after two normalized characters. Anime Details and the guest progress, status, and score controls use the same provider-neutral domain model.

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

Collection and search requests use these summary fields:

```text
id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,
rank,popularity,num_list_users,num_scoring_users,nsfw,genres,media_type,status,
num_episodes,start_season,broadcast,source,average_episode_duration,rating,studios
```

Detail requests add the officially documented `related_anime` field. Purikuki
maps only `prequel` and `sequel` entries into provider-neutral continuity; the
same detail request supplies both the anime metadata and its continuity.

Responses are validated at the infrastructure boundary before they are mapped. MAL titles, alternative titles, synopsis, named genres and studios, episode count, score, season, year, readable airing status, and picture fallbacks map into `AnimeCatalogItem`; MAL DTO names do not enter the domain or UI. Artwork falls back from the requested size to the available `main_picture` size, and missing artwork uses deterministic ID-based gradient seeds.

See the [official MyAnimeList API v2 reference](https://myanimelist.net/apiconfig/references/api/v2) for the upstream contract.

## Automatic fallback and recovery

The production graph gives Jikan at most two total attempts so a failing primary does not delay MAL fallback. MAL also uses at most two total attempts. Both clients retry only temporary network failures, timeouts, rate limits, and HTTP 500/502/503/504. `Retry-After` seconds or HTTP dates take priority; otherwise a short bounded, jittered delay is used. React Query does not add another retry layer.

MAL fallback is eligible after a Jikan network failure, timeout, rate limit, supported 5xx response, malformed response, or unexpectedly empty required discovery collection. Invalid arguments, programming errors, and legitimate detail 404 results do not trigger fallback. Synthetic data is never substituted when live providers fail.

Jikan resilience is isolated into `featured`, `popular`, `seasonal`, `upcoming`, `search`, and `details` operation families. Each family has its own circuit breaker, which opens after two consecutive eligible final-operation failures and remains open for five minutes. While one family is open, the production graph skips only that Jikan capability and uses MAL for it; healthy families continue using Jikan. `getDetailsById` and `getManyByIds` share the Details family, while all normalized search queries share the Search family. After cooldown, one request per family becomes the half-open probe. Success closes that family circuit, while an eligible failure reopens it. Application errors and legitimate 404 results do not count as provider-health failures.

Jikan HTTP 429 responses are handled separately from endpoint health. `Retry-After` activates one provider-wide rate-limit gate; when the header is missing, the gate uses a bounded 15-second default. Requests that begin while the gate is active use MAL without opening otherwise healthy family circuits. After the window expires, the next operation may use Jikan normally.

Hidden Developer Tools shows compact Popular, Seasonal, Upcoming, Search, and Details rows with independent circuit and source state. Featured still has an isolated circuit internally, but its row is omitted because it is a composite selection derived from discovery collections rather than a direct Jikan endpoint. A separate action resets Jikan circuit state; clearing catalog data does not reset provider health.

Successful normalized results are cached by logical operation. If Jikan and MAL both fail, the resilient repository returns the previous valid result for that same operation when one exists and records `cache` for that family. Cached Featured, collection, and Search operations retain `summary` completeness; cached `details:<id>` operations retain `details` completeness. Popular, Seasonal, and Upcoming refresh independently, replacing each family only after a fresh usable result; a Popular failure can therefore use MAL without discarding healthy Jikan Seasonal or Upcoming refreshes.

The resilient repository also maintains a separate, provider-neutral in-memory Catalog Item Store keyed by anime ID. Every entry carries explicit operation metadata: Featured, Popular, Seasonal, Upcoming, and Search produce `summary`; only an explicit provider detail operation produces `details`. Summary is sufficient for Home cards and rails, My List, Continue Watching, Search results, and page hydration. Anime Details requires `details`, so opening a summary item promotes only that item through the resilient Jikan → MAL → operation-cache detail path. Completeness is never inferred from populated fields.

```text
Catalog Item Store
├── summary  → Home, My List, Continue Watching, Search, and rails
└── details  → explicit Anime Details resolution
```

The store permits `summary → details` promotion and forbids `details → summary` downgrade, replacing the whole normalized item instead of merging fields. Completeness outranks provider preference: MAL details remain intact when a later Jikan collection returns a summary. At equal completeness, the centralized preference is `jikan > mal > cache`. Stored values and item-index results are cloned so callers cannot mutate shared state.

`getManyByIds` is a summary-resolution API, not a bulk-enrichment API. Both stored summaries and details satisfy it. It preserves the caller's first-seen ID order, filters invalid/duplicate IDs, returns known items from the normalized index, and resolves only missing IDs. Missing IDs are processed sequentially through `getDetailsById`, so the Details circuit and provider-wide rate-limit gate are checked between items. Neither the resilient repository nor the direct Jikan/MAL repositories use parallel detail fan-out. Legitimate 404s are omitted without failing the valid remainder. `getDetailsById` returns stored details immediately without probing provider health, but a stored summary still follows the resilient detail flow; once promoted, repeated detail calls make no provider request.

`getKnownById` is the synchronous, no-network lookup for presentation-only reuse. Anime Details uses it for continuity posters: an already-known poster is reused, while an unknown related anime gets the deterministic placeholder. Rendering continuity never calls `getManyByIds` or hydrates related details; normal detail resolution begins only after the user taps a Prequel or Sequel card.

Provider caches remain in memory only. Collection responses populate each provider's ID summary cache, details enrich it, and identical in-flight requests are coalesced. **Clear catalog cache** in hidden Developer Tools removes operation data, the normalized item index, and provider data caches without resetting circuit health or Jikan request-budget coordination. Discovery order and Featured selection remain stable for the application session.

## Jikan catalog

The native Jikan v4 integration uses:

- `GET /top/anime`
- `GET /seasons/now`
- `GET /seasons/upcoming`
- `GET /anime?q=...&order_by=popularity&sort=asc&sfw=true&limit=25`
- `GET /anime/{id}/full`

The standalone Jikan repository remains available to infrastructure tests and preserves its scheduler, duplicate-request coalescing, explicit error mapping, and 12-second timeout. Production injects its bounded two-attempt policy into that same client and repository; it does not duplicate the transport.

The existing `/anime/{id}/full` response also supplies relation groups. Purikuki validates them and exposes only anime Prequel/Sequel continuity, with no `/relations` request or related-anime prefetch.

The application-scoped Jikan request coordinator protects both official public budgets: starts are spaced by 500 ms (below 3 requests/second) and a rolling window allows at most 60 starts per minute. A Jikan 429 pauses all future coordinated work for `Retry-After`, or a bounded 15-second fallback when the header is absent. Catalog traffic and manual Jikan diagnostics share the same coordinator for the active repository dependency graph. Clearing anime data does not reset this transport budget; only an explicit coordinator reset does.

API structure and attribution: [Jikan REST API v4 documentation](https://docs.api.jikan.moe/).

## Service diagnostics

Hidden Developer Tools → **Service diagnostics** checks providers independently:

- **Test MyAnimeList API** directly requests one `bypopularity` ranking result with `id,title,main_picture`. It bypasses Jikan, the resilient repository, React Query, and catalog caches. A successful result shows HTTP status, elapsed time, and one sample title.
- **Test Jikan API** sequentially checks raw Jikan Details (`/anime/1/full`), Popular (`/top/anime?limit=1&sfw=true`), Seasonal (`/seasons/now?limit=1&sfw=true`), Upcoming (`/seasons/upcoming?limit=1&sfw=true`), and Search (`/anime?q=Naruto&limit=1&sfw=true`). It shares the active Jikan request coordinator but bypasses catalog repositories, data caches, fallback, and circuit breakers. The result is Healthy, Degraded, Unavailable, or Rate limited and includes one compact row per endpoint.

Only one diagnostic can run at a time. Results are accessible alerts and are not persisted. Diagnostics report configuration, authorization, rate limiting, service, network, timeout, and invalid-payload failures without exposing credentials or large upstream response bodies. A failing Popular endpoint no longer makes healthy Jikan Details or Seasons appear unavailable.

## Guest personal list

Before authentication, `GuestUserAnimeListRepository` builds a small temporary list directly from real Popular, Seasonal, and Upcoming `AnimeCatalogItem` values; initialization does not call `getManyByIds` or hydrate the selected IDs again. My List and Continue Watching keep their existing query contracts but normally resolve those rows as normalized item-index hits with zero detail requests. Episode progress, list status, and user score changes use local domain rules and are discarded when the process restarts. No MAL account or authenticated list endpoint is used.

Membership is explicit: `addToList` creates a Plan to Watch entry by default, `updateProgress`, `updateStatus`, and `updateScore` require an existing entry, and `removeFromList` removes it without removing the catalog item. Anime Details consequently shows Add to My List for non-members and Progress, Status, Score, and Remove only for members. A future authenticated MAL repository can map `addToList` to an authenticated add/update, `removeFromList` to an authenticated delete, and the three strict update methods to authenticated list updates without treating a field update as a hidden add operation.

A future authenticated MAL list should populate this same normalized item index from MAL list summaries. A large user list must not imply one Jikan full-detail request per entry; rich Jikan details remain an explicit, selected-item operation.

Progress is a non-negative whole number and is capped when the catalog has a known total. Unknown totals remain incrementable. Reaching the final known episode marks an entry completed; Plan to Watch resets progress; returning to Watching preserves valid progress. Scores are empty or whole numbers from 1 through 10.

## Architecture

The app preserves layered boundaries:

- `domain` owns provider-neutral models, repository contracts, errors, and rules.
- `application` owns query keys, React Query hooks, mutations, and use cases.
- `infrastructure` owns native transports, DTO validation, mapping, caches, circuit breaking, and repositories.
- `tests` owns deterministic fixtures, builders, and in-memory repository doubles used only through explicit dependency injection.
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
    └── guest/
```

No screen calls `fetch`, consumes provider DTOs, or constructs repositories. The hidden Developer Tools panel receives only direct diagnostics and read-only runtime source/circuit status.

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

- Guest-list data, catalog caches, and diagnostic results are not persisted. Interface language and the Developer Tools unlock preference are persisted.
- Public catalog availability and remote artwork depend on Jikan or MAL.
- On-device synopsis translation is Android-only, requires a Purikuki Development Build, and may require a one-time Wi-Fi model download. Expo Go, web, and iOS keep the original synopsis without native translation.
- MAL OAuth, login, profile access, list synchronization, offline mutation storage, a backend, and E2E tests are out of scope.
- Purikuki is not affiliated with Jikan or MyAnimeList.

## Troubleshooting

### Jikan is unavailable

Enable Developer Tools with five taps on the About description, then use **Test Jikan API** to test five Jikan endpoint families directly. Eligible runtime failures use MAL when configured; after two consecutive final-operation failures only that family's circuit skips Jikan for five minutes. Runtime catalog status shows app-observed Jikan health plus independent source and circuit rows. A real Jikan 5xx response can reflect an upstream failure and does not imply Android cleartext or CORS configuration trouble.

### Test MyAnimeList API fails

The diagnostic bypasses Jikan and all catalog caches. Check its classified message and HTTP status. Network and temporary service failures may receive one bounded retry. HTTP 401 or 403 means MAL rejected the application Client ID. Restart Metro after changing `.env`.

### MyAnimeList Client ID is not configured

Add `EXPO_PUBLIC_MAL_CLIENT_ID` to the local `.env`, then restart Metro with `npx expo start --clear`. The runtime continues with Jikan and its valid cache until the public MAL fallback is configured. Do not add a Client Secret.
