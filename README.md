# Purikuki

Purikuki is a dark-first React Native anime list manager built with Expo. Phase 1 is a polished mobile prototype for browsing a reproducible local catalog, organizing a personal list, and managing episode progress, status, and scores.

This version uses mock data only. It does not call Jikan, MyAnimeList, or any other anime API, and it never handles real user credentials.

## Phase 1 features

- Streaming-inspired home with a featured hero, Continue Watching, Popular Now, This Season, and Recently Added rails
- Debounced local search across primary and alternative titles
- Personal-list filtering across Watching, Completed, On Hold, Dropped, and Plan to Watch
- Details outside the tab navigator, with poster/banner placeholders and complete catalog metadata
- Local episode, status, and score mutations with optimistic progress and status updates
- Accessible loading skeletons, empty states, recoverable error states, and disabled invalid controls
- Session-only settings for request delay, forced repository errors, and mock-data reset
- Deterministic Faker factories and reusable edge-case scenarios
- Unit, component, screen, repository, and React Query tests

## Technology stack

- Expo and React Native
- Expo Router and TypeScript in strict mode
- NativeWind v4 and Tailwind CSS
- TanStack React Query
- Lucide React Native and Expo Linear Gradient
- Faker (`@faker-js/faker`)
- Jest, `jest-expo`, and React Native Testing Library
- ESLint and Prettier

## Architecture

The app uses layered, feature-oriented boundaries:

- `domain` owns models, repository contracts, errors, and pure business rules.
- `application` owns query keys, React Query hooks, mutations, and use cases.
- `infrastructure` implements the contracts with session-local mock repositories.
- `mocks` owns deterministic factories, fixtures, scenario builders, and timing configuration.
- `presentation` owns providers, tokens, hooks, reusable components, and composed screens.
- `app` contains thin Expo Router route modules only.

Repositories are injected through `RepositoryProvider`; screens never construct mock implementations. Presentation code consumes domain models rather than Faker values or repository internals. React Query sits between repositories and every screen so a future API-backed implementation can replace the mock repositories without rewriting the UI.

```text
app/
├── (tabs)/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── search.tsx
│   ├── my-list.tsx
│   └── settings.tsx
├── anime/[id].tsx
├── +not-found.tsx
└── _layout.tsx
src/
├── application/{mutations,queries,use-cases}/
├── domain/{errors,models,repositories,rules}/
├── infrastructure/repositories/mock/
├── mocks/{config,factories,fixtures,scenarios}/
├── presentation/{components,hooks,providers,screens,theme,utils}/
├── shared/{constants,types,utils}/
└── tests/{builders,mocks,render,setup}/
```

## Getting started

Requirements: a current Node.js LTS release, npm, and an Expo-compatible Android/iOS emulator or physical device.

```bash
npm install
npm start
```

From the Expo terminal, open Android, iOS, or web. Platform-specific commands are also available:

```bash
npm run android
npm run ios
npm run web
```

## Development and quality commands

```bash
npm run typecheck
npm run lint
npm run format
npm run format:check
npm test
npm run test:watch
npm run test:coverage
npm run test:ci
```

## Mock data and scenarios

The initial fixture is generated once with a fixed seed and then cloned into the session runtime. It contains 50 catalog titles and 25 personal-list entries spanning all statuses, known and unknown episode totals, and scored and unscored entries. Reset restores the exact starting state.

Scenario builders are available for focused development and tests:

- `default`: the complete seeded fixture
- `empty`: no catalog or list entries
- `loading`: the default fixture for delayed repository behavior
- `error`: the default fixture for forced failures
- `long-titles`: layout stress data
- `unknown-episodes`: an airing title without a known total
- `watching-only`: only watching entries
- `completed-only`: only completed entries
- `large-list`: a 50-entry list for performance checks

Settings exposes a normal simulated delay and forced-error toggle. The mock runtime also supports `none`, `normal`, and `slow` delay modes for development and tests. None of these settings persist after the app session ends.

## Business rules

Progress is always a non-negative whole number and is capped when the catalog has a known total. Unknown totals remain incrementable. Reaching the final known episode marks an entry completed; moving to Plan to Watch resets progress; returning to Watching preserves valid progress. Scores are either empty or whole numbers from 1 through 10.

## Phase 1 limitations

- Data and settings are in memory and reset when the application process restarts.
- Catalog titles and metadata are fictional, seeded development content.
- Artwork is represented by deterministic gradients and initials.
- There is no authentication, user profile, synchronization, notification system, social layer, backend, or offline mutation queue.
- End-to-end testing and production EAS/store configuration are intentionally out of scope.

## Future integrations

A later phase can add a Jikan-backed catalog repository and an authenticated MyAnimeList user-list repository behind the existing contracts. Authentication, secure credential storage, persistence, offline mutation handling, and synchronization should be introduced as separate infrastructure concerns rather than embedded in screens.
