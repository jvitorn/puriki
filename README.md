# Puriki

Puriki is a dark-first React Native anime list manager built with Expo. It combines a resilient public anime catalog with a temporary guest list that exists only for the current application process.

## Product identity

The Expo identity is `Puriki`, with slug and URL scheme `puriki`. The Android application identifier is `com.jvitorn.puriki`; this migration is safe because the project has no EAS binding, store publication, provider callback, or committed native project tied to the former identifier.

Native branding uses the normalized assets in `assets/app-icon/` and `assets/splash/`. Original brand masters remain in `assets/brand/source/`, while presentation-ready vectors live in `assets/brand/svg/`. The official dark background is `#090C11`, and the brand red `#970C10` is the semantic primary. A lighter red is reserved for small text, focus rings, and active icons that require stronger contrast; the existing purple secondary remains available.

Legacy technical identifiers such as `purikuki:` AsyncStorage keys and the `modules/purikuki-translation` native bridge remain unchanged to preserve persisted data and avoid an unrelated native-module migration. They do not represent the visible product name.

## Production catalog

Catalog routing is infrastructure behavior, not a user preference:

```text
AniList primary → eligible failure → public MAL fallback → valid cache
```

AniList is queried through the public GraphQL endpoint at `https://graphql.anilist.co`. Puriki keeps its current domain identity based on MyAnimeList IDs: AniList media and continuity relations without a valid `idMal` are skipped. This avoids a premature domain-wide identity migration while allowing AniList artwork and metadata to power the product.

The AniList integration provides:

- Popular, Seasonal, Upcoming, Search, Details, and derived Featured content.
- A lean summary fragment for collections and a rich detail operation for synopsis, studios, synonyms, and continuity.
- A single aliased GraphQL operation for the initial Popular + Seasonal + Upcoming snapshot. Concurrent cold calls coalesce into one HTTP request, while a GraphQL error in one alias does not discard healthy aliases.
- Individual operations for family-specific refresh.
- Native `fetch`, a 12-second timeout, runtime response validation, explicit error classes, and at most two attempts for network, timeout, and supported 5xx failures.
- Shared request coalescing, bounded concurrency, and provider-wide rate-limit state. HTTP 429 respects `Retry-After` and reset headers and does not open family circuits.

Search requests 25 safe anime summaries. Seasonal lookup uses the local date with Winter Dec–Feb, Spring Mar–May, Summer Jun–Aug, and Fall Sep–Nov. Details are looked up by MAL ID, and missing AniList media softly falls back to MAL without damaging primary-provider health.

Title preference is English, then romaji, then native. `averageScore` is mapped from 0–100 to 0–10. Vertical covers deliberately use AniList cover images, while `heroImageUrl` uses only `bannerImage`; a missing banner remains null so the existing UI fallback can render. Only anime `PREQUEL` and `SEQUEL` relations with a MAL ID enter domain continuity.

Upstream contracts: [AniList rate limiting](https://docs.anilist.co/guide/rate-limiting), [Media](https://docs.anilist.co/reference/object/media), [Media cover images](https://docs.anilist.co/reference/object/mediacoverimage), and [Page](https://docs.anilist.co/reference/object/page).

## Automatic fallback and recovery

MAL fallback is eligible after a primary network failure, timeout, rate limit, temporary service failure, invalid response, unexpectedly empty required discovery collection, or a soft detail miss. Invalid GraphQL operations and arbitrary HTTP authorization/programming failures remain visible instead of being hidden by fallback.

Resilience is isolated into `featured`, `popular`, `seasonal`, `upcoming`, `search`, and `details` operation families. Each family owns a circuit breaker that opens after two consecutive eligible failures for five minutes. A failing Popular family therefore does not stop healthy Seasonal, Search, or Details traffic. After cooldown, a single half-open probe decides whether that family closes or reopens.

A provider-wide primary rate gate is separate from family health. When it is active, new primary work uses MAL without opening otherwise healthy circuits. The valid operation cache is the final fallback when both live providers fail.

The provider-neutral Catalog Item Store is keyed by MAL ID and records both source and completeness:

```text
Catalog Item Store
├── summary  → Home, My List, Continue Watching, Search, and rails
└── details  → explicit Anime Details resolution
```

Completeness outranks provider preference, preventing a later summary from replacing known details. At equal completeness, preference is `anilist > mal > cache`. Missing IDs in `getManyByIds` are resolved sequentially so rate and circuit state can be checked between items.

Provider caches are in memory, distinguish summaries from details, and coalesce identical in-flight work. Clearing the catalog removes provider data, operation results, and normalized items without resetting circuit health or the shared request budget.

## MyAnimeList public fallback

Configure the application Client ID in a local `.env` file:

```env
EXPO_PUBLIC_MAL_CLIENT_ID=
```

Restart Metro after changing `.env`:

```bash
npx expo start --clear
```

MAL requests use React Native's global `fetch`, a 12-second timeout, `Accept: application/json`, and `X-MAL-CLIENT-ID`. The Client ID is never rendered or logged. Do not put a MAL Client Secret in a React Native bundle. Puriki does not implement MAL OAuth, user profiles, or list synchronization.

The fallback uses the official API v2 search, anime details, popularity ranking, upcoming ranking, and current-season endpoints. It maps provider DTOs into the same `AnimeCatalogItem` contract and supplies Prequel/Sequel continuity from `related_anime`. See the [official MyAnimeList API v2 reference](https://myanimelist.net/apiconfig/references/api/v2).

## Settings and diagnostics

Public Settings contains Account, Language, and About. Developer Tools is hidden by default and is enabled by tapping the About description five times within the three-second inactivity window.

Permanent service diagnostics are intentionally compact:

- **Test AniList API** sequentially checks Details, Search, Popular, Seasonal, and Upcoming and shows HTTP status, latency, and observed remaining rate budget.
- **Test MyAnimeList API** directly checks one public ranking result with the configured application Client ID.

The two diagnostics share one UI lock. AniList diagnostics share the application request coordinator and may update the known rate window, but they bypass catalog repositories, caches, fallback, React Query, guest-list state, and family circuits.

Developer Tools also shows AniList runtime health, rate-limit expiry, source and circuit state per family, a primary-circuit reset action, and a separate catalog-cache clear action.

## Guest personal list

Before authentication, `GuestUserAnimeListRepository` builds a small temporary list from real Popular, Seasonal, and Upcoming catalog items. My List and Continue Watching reuse the normalized item index rather than hydrating every anime again.

Membership is explicit: adding creates a Plan to Watch entry; progress, status, and score updates require membership; removal does not remove catalog metadata. Guest data is discarded when the process restarts. No authenticated account endpoint is used.

## Pending change synchronization

Progress, status, and score changes update React Query immediately and are persisted in a dedicated AsyncStorage queue before delivery. A small Sync Engine coalesces repeated changes to the same anime field, waits for 400 ms of inactivity, tracks success independently per target, and retains failed work for conservative retry. The queue is separate from catalog caches and is restored when the dependency graph is rebuilt.

The current target applies changes to the guest-list repository. Provider-neutral target and operation contracts leave explicit extension points for future authenticated AniList and MyAnimeList targets without adding OAuth or credentials in this phase.

## Localization and synopsis translation

The complete interface is available in English, Brazilian Portuguese, and Spanish. Settings offers those choices plus System default. The preference is stored with AsyncStorage and changing it does not clear or refetch catalog data.

On Android Development/Release Builds, Portuguese and Spanish users can explicitly translate an English synopsis with Google ML Kit on device. Puriki preserves the original provider synopsis, caches source-aware translations, and displays Google's official unmodified attribution badge. Expo Go, web, and iOS keep the original synopsis.

## Architecture

- `domain` owns provider-neutral models, repository contracts, errors, and rules.
- `application` owns React Query hooks, mutations, and use cases.
- `infrastructure` owns AniList and MAL transports, DTO validation, mapping, caches, request coordination, circuit breaking, and repositories.
- `infrastructure/sync` owns pending-operation persistence, coalescing, retry, and concrete sync targets.
- `presentation` receives repositories through `RepositoryProvider` and consumes domain models only.
- `tests` owns deterministic fixtures and in-memory repository doubles.
- `modules/purikuki-translation` owns the Android Expo Modules bridge to Google ML Kit.

```text
src/infrastructure/
├── api/
│   ├── anilist/
│   └── mal/
├── repositories/
│   ├── anilist/
│   ├── mal/
│   ├── resilient/
│   ├── catalog/
│   └── guest/
└── sync/
```

Normal application screens do not call `fetch`, consume provider DTOs, or construct repositories.

## Getting started

Requirements: a current Node.js LTS release, npm, and an Expo-compatible emulator or physical device.

```bash
npm install
npx expo start --clear
```

Platform commands:

```bash
npm run android
npm run ios
npm run web
```

Synopsis translation needs a Puriki Development Build because Expo Go cannot execute the local native module:

```bash
npm install
npx expo run:android --device
npm run start:dev-client
```

The persistent Android application identifier is `com.jvitorn.puriki`. Generated `android/` and `ios/` directories are intentionally not committed.

## Quality commands

Automated tests use injected transports and static fixtures; they do not call live catalog services.

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

- Guest-list data, catalog caches, and diagnostic results are not persisted.
- Public catalog availability and artwork depend on AniList or the configured MAL fallback.
- AniList media without `idMal` cannot enter the current domain model.
- On-device synopsis translation is Android-only and may require a one-time Wi-Fi model download.
- MAL OAuth, login, profile access, authenticated provider synchronization, account-list migration, a backend, and E2E tests are out of scope.
- Puriki is not affiliated with AniList or MyAnimeList.

## Troubleshooting

### AniList is unavailable

Enable Developer Tools with five taps on the About description and use **Test AniList API**. Eligible runtime failures automatically use MAL when configured; two consecutive family failures open only that family's circuit. A 429 activates the provider-wide rate gate instead.

### Test MyAnimeList API fails

Check its classified message and HTTP status. HTTP 401 or 403 means MAL rejected the application Client ID. Restart Metro after changing `.env`.

### MyAnimeList Client ID is not configured

Add `EXPO_PUBLIC_MAL_CLIENT_ID` to `.env`, then restart Metro with `npx expo start --clear`. The runtime continues with AniList and its valid cache until the public MAL fallback is configured. Do not add a Client Secret.
