# Feature 1.0, Phase 1 architecture review

## Review baseline

Review started from `master` at `a4aeb8b` before Phase 1 refactoring.

Initial quality results:

- `npm run typecheck`, `npm run lint`, and `npm run format:check` passed.
- `npm run test:ci` passed 84 suites and 656 tests. Existing React test
  `act(...)` warnings were observed and are deferred to Feature 1.0, Phase 10.
- `npx expo-doctor` passed 20 of 21 checks and reported 12 Expo SDK patch
  mismatches.

## Initial findings

### Dependency boundaries

- Domain production code is provider-neutral and has no application,
  infrastructure, or presentation dependencies.
- Provider DTOs and their parsers/mappers are confined to infrastructure.
- Two production modules under `application` contain React Query hooks and
  import `RepositoryProvider`, creating an application-to-presentation
  dependency.
- Several presentation providers construct infrastructure defaults. The
  largest case is `RepositoryProvider`, which also owns access-token lookup,
  MAL refresh behavior, repository construction, diagnostics, resilience
  status mapping, and Sync Engine startup.
- Developer Tools calls the MAL infrastructure diagnostic directly and uses
  infrastructure-owned result/status types.

### Business rules and providers

- Guest, AniList, and MyAnimeList repositories all delegate progress, status,
  and score decisions to the same domain rules.
- Repeated repository code is limited to adapter-specific pagination, caches,
  mutation serialization, identity mapping, and transport payloads. A generic
  provider repository base class would obscure those differences without
  removing duplicated business rules.
- The authenticated MyAnimeList repository resolves real catalog tracking
  context before applying domain decisions.

### Sync Engine

- The current Sync Engine handles incremental `SET_PROGRESS`, `SET_STATUS`,
  and `SET_SCORE` intents only.
- Its contracts contain no List Sync planner, snapshot, comparison, job,
  cooldown, or bulk-reconciliation concepts.
- Production wiring intentionally targets the guest list today. Authenticated
  multi-provider replication remains Feature 3.0 work.

### Large modules and naming

- `RepositoryProvider` has accumulated production composition and credential
  responsibilities unrelated to React context delivery.
- The React Query hook modules are named as application queries/mutations even
  though their framework and cache responsibilities belong to presentation.
- The large provider clients and repositories reviewed are internally
  cohesive; they are not Phase 1 refactor targets.
- Large visual screens are deferred to the dedicated UI/UX phases.

## Phase 1 decisions

- Move React Query hooks, mutations, cache keys, and cache helpers to
  presentation while retaining provider-neutral coordinators/use cases in
  application.
- Introduce explicit application runtime contracts and keep concrete creation
  in one infrastructure factory reached only by `AppProviders`.
- Inject storage, translation, diagnostics, auth, and provider-selection
  dependencies instead of constructing them in ordinary presentation modules.
- Enforce dependency direction with ESLint restrictions, without adding a DI
  framework, service locator, base repository hierarchy, event bus, CQRS, or
  mediator.

## Resolution status

### Resolved in Phase 1

- Aligned all 12 Expo/React Native patch mismatches in `package.json` and
  regenerated `package-lock.json`. `npx expo install --check` now reports that
  dependencies are up to date, and Expo Doctor passes all 21 checks.
- Moved React Query queries, mutations, cache keys, and cache helpers from
  `application` to `presentation`. Existing hook names and behavioral tests
  were retained; `LatestProgressIntentCoordinator` remains in `application`.
- Added provider-neutral `ApplicationRuntime`, `RepositoryServices`, storage,
  translation, diagnostic report, and `UserListAccess` contracts to
  `application`.
- Added the infrastructure production-runtime factory. It now owns concrete
  clients, repositories, token lookup and MAL refresh, circuit/rate-limit
  wiring, diagnostics, persistence and translation adapters, and guest-only
  Sync Engine startup.
- Reduced `RepositoryProvider` from 431 lines to 107 lines. It now performs
  React context delivery, user-list access derivation, account-scope cache
  invalidation, catalog runtime subscription, and React Query cache removal.
- Made `AppProviders` the only production presentation module allowed to
  import infrastructure. Auth, primary-provider control, onboarding,
  developer settings, translations, and both provider diagnostics are
  injected through application-owned contracts.
- Split production composition tests from React provider tests. Coverage now
  includes production graph creation, account-aware repository behavior,
  expired-token reconnect, MAL token refresh and persistence, catalog runtime
  subscriptions, and intentionally guest-only Sync Engine wiring.
- Added executable ESLint boundary guards and representative tests for every
  forbidden direction plus the single `AppProviders` exception. Test files
  remain exempt so they can use infrastructure fixtures and integration
  doubles.
- Updated the architecture documentation to reflect the production
  composition boundary and presentation ownership of React Query.

### Confirmed without refactoring

- Provider DTOs remain confined to infrastructure; domain and production
  presentation code consume provider-neutral models and reports.
- Guest, AniList, and MAL repositories continue to reuse shared domain rules.
  No base repository hierarchy or dependency-injection framework was added.
- The existing incremental Sync Engine remains limited to progress, status,
  and score intents and contains no List Sync concepts.
- Reviewed large provider clients, repositories, hook modules, and screens
  remain cohesive or belong to later roadmap phases. They were not split only
  to reduce file size.

### Validation

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `npm run test:ci` — 87 suites and 662 tests passed.
- `npx expo install --check` — passed.
- `npx expo-doctor` — 21 of 21 checks passed.

### Deferred observations

- The pre-existing React `act(...)` and VirtualizedList timer warnings remain
  visible in otherwise passing presentation tests. They were not introduced
  or worsened by this refactor and remain Feature 1.0, Phase 10 cleanup.
- Native device/emulator validation was not performed; it remains Feature 1.0,
  Phase 12 as planned.
- `npm install` reports 17 transitive dependency advisories (11 moderate and 6
  high). No broad `npm audit fix` was applied because Phase 1 is limited to the
  Expo-compatible patch alignment and an automated fix could change product
  dependencies beyond this stabilization scope.
