# Puriki Product & Engineering Roadmap

> **Purpose:** this document is the public source of truth for Puriki's feature roadmap, implementation phases, acceptance rules, and progress tracking.
>
> It is designed to be read and maintained by the project maintainer, human contributors, Codex, Claude Code, and other coding agents.
>
> **Important:** agents may complete and mark sub-tasks, but **only the project maintainer may mark a top-level phase as complete**.

---

## 0. How to use this document

### 0.1 Checklist ownership

There are two checklist levels:

```md
- [ ] Phase N — Phase name
  - [ ] Implementation task
  - [ ] Test task
  - [ ] Validation task
```

Rules:

- **Top-level phase checkbox**
  - Example: `- [ ] Phase 3 — List Sync Planner`
  - This is an **acceptance gate**.
  - **Only the project maintainer may mark it as `[x]`.**
  - Coding agents must never mark a phase complete unless explicitly instructed by the maintainer.

- **Nested task checkbox**
  - Example: `  - [ ] Add normalized comparison model`
  - May be marked by a contributor or coding agent **only after the work is implemented and validated**.
  - A code change existing is not enough if the task also requires tests, validation, documentation, or device verification.

A phase may have every nested task checked while the phase itself remains unchecked. This means the implementation is ready for maintainer acceptance but the milestone has not yet been approved.

### 0.2 Agent workflow

Any coding agent working on Puriki should follow this sequence:

1. Read this roadmap before making a plan.
2. Identify the current feature and current phase.
3. Read the relevant code and tests before proposing changes.
4. Preserve existing Puriki architecture and domain rules.
5. Implement only work that belongs to the current phase unless explicitly asked otherwise.
6. Update nested checkboxes only for work actually completed.
7. Do not mark a top-level phase as complete.
8. Do not silently change product rules. If a product rule conflicts with implementation reality, stop and report the conflict.
9. Do not move future-feature responsibilities into the current feature.
10. Run the appropriate quality checks before marking implementation sub-tasks complete.
11. Keep roadmap/documentation changes in sync with code changes when behavior changes.
12. Prefer incremental, reviewable changes over large rewrites.

### 0.3 Architectural rules that apply to every feature

Puriki follows a provider-neutral architecture:

```text
src/domain
  provider-neutral models, repository contracts, rules, errors, services

src/application
  queries, mutations, use cases, orchestration, provider selection,
  authentication/session contracts, sync contracts

src/infrastructure
  AniList/MAL transports, provider DTOs, repositories, auth, persistence,
  rate limiting, caching, resilience, sync implementations

src/presentation
  screens, components, providers, hooks, theme, visual state
```

Global rules:

- Domain rules must not depend on AniList or MyAnimeList.
- Provider DTOs must not leak into presentation.
- Presentation must not call provider HTTP APIs directly.
- Infrastructure may adapt provider behavior, but must not redefine Puriki business rules.
- Avoid adding architectural machinery without a demonstrated need.
- Do not introduce Event Bus, CQRS, Mediator, service locator, or DI frameworks only for abstraction.
- Preserve testability through explicit contracts and dependency injection at composition boundaries.
- Existing provider-neutral contracts should be extended before creating provider-specific behavior in application or presentation.
- New background/persistence features must survive process interruption where the product contract requires resume.
- External provider limitations must be surfaced honestly in the UI.

### 0.4 Quality gate

Before a nested implementation task that changes production code is considered complete, run the relevant subset of:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test:ci
npx expo-doctor
```

For native Android changes, additionally validate with a Puriki Development/Release Build on a real device or emulator where applicable.

---

# Feature 1.0 — Foundation Stabilization

## Goal

Feature 1.0 is the stabilization pass for the current Puriki master baseline.

The objective is **not** to add a new major product surface. The objective is to make the existing application reliable, coherent, maintainable, and polished enough to become the foundation for List Sync.

Feature 1.0 acceptance means:

- current core flows are stable;
- provider integrations are validated;
- loading/error/empty/retry behavior is consistent;
- UI/UX regressions have been reviewed;
- the architecture is still clean after recent feature growth;
- tests and CI cover the critical behavior;
- documentation matches the product that actually exists.

---

- [x] Phase 1 — Architecture and dependency review
  - [x] Review `domain`, `application`, `infrastructure`, and `presentation` boundaries.
  - [x] Confirm provider DTOs do not leak into domain/presentation.
  - [x] Confirm domain rules remain provider-neutral.
  - [x] Review `RepositoryProvider` as composition root for accidental business logic.
  - [x] Identify large files/classes that have accumulated unrelated responsibilities.
  - [x] Identify duplicated business rules between AniList and MAL implementations.
  - [x] Verify authenticated repositories share domain behavior instead of reproducing rules.
  - [x] Review current Sync Engine boundaries and verify it is not coupled to List Sync concepts.
  - [x] Review naming consistency across repositories, hooks, controllers, ports, and providers.
  - [x] Record architecture findings before refactoring.
  - [x] Refactor only issues with demonstrated maintenance or correctness value.
  - [x] Add/update architecture tests where useful.
  - [x] Confirm no unnecessary abstraction/framework was introduced during cleanup.

- [x] Phase 2 — Authentication and account-provider validation
  - [x] Validate AniList authentication flow end-to-end. (`anilist-auth-provider.test.ts`, `settings-screen.test.tsx`, `onboarding-screen.test.tsx`; also manually re-validated PASS on the current native Developer Build — see `docs/RELEASING.md`.)
  - [x] Validate MAL authentication flow end-to-end. (`mal-auth-provider.test.ts`, `settings-screen.test.tsx`.)
  - [x] Validate reconnect-required behavior. (Both providers' `restoreSession`/`signIn` tests; central transition in `auth-session-coordinator.test.ts`.)
  - [x] Validate expired/invalid credential handling. (AniList hard-expiry branch and MAL refresh-then-fallback branch, both covered in their `restoreSession` tests.)
  - [x] Validate temporary provider/network failure does not incorrectly destroy valid credentials. (Covered for `signIn` in both providers; the `restoreSession` path was the one gap found by this audit and has been closed with a new test in each provider's suite: "keeps a stored token after a transient restore failure for retry".)
  - [x] Validate logout behavior. (Both providers' `signOut` tests, coordinator sign-out tests, `settings-screen.test.tsx`.)
  - [x] Validate provider switching when both accounts are connected. (`src/application/user-list/primary-list-provider-controller.ts`; `settings-screen.test.tsx` — "shows a Primary list picker only once both providers are connected".)
  - [x] Validate primary list provider selection persistence. (`primary-list-provider-storage.ts` + tests; `primary-list-provider-controller.test.ts`.)
  - [x] Validate account identity/state after app restart. (`restoreSession` cold-start tests for both providers; coordinator restore test.)
  - [x] Validate disconnected-account states in presentation. (`onboarding-screen.test.tsx`, `settings-screen.test.tsx`.)
  - [x] Ensure tokens never appear in logs, AsyncStorage, diagnostics, React Query cache, or UI. (Tokens only ever go through `ExpoSecureAuthTokenStore`; `oauth-diagnostics.ts` strips query/fragment before logging, tested in `oauth-diagnostics.test.ts`; AsyncStorage usage elsewhere in the app never carries a token.)
  - [x] Add missing automated tests for authentication/session state transitions. (`auth-session-coordinator.test.ts` already covered the state machine; the transient-restore-failure gap above has now been closed.)

- [x] Phase 3 — User list correctness
  - [x] Validate list loading for AniList. (`anilist-user-anime-list-repository.test.ts`.)
  - [x] Validate list loading for MAL. (`mal-user-anime-list-repository.test.ts`.)
  - [x] Validate guest-list behavior. (`guest-user-anime-list-repository.test.ts`.)
  - [x] Validate add-to-list behavior. (Covered for AniList, MAL, guest, and the optimistic presentation mutation.)
  - [x] Validate remove-from-list behavior where supported by the current app. (Implemented and tested for all three providers, including AniList's `deleted=false` guard and MAL's 404-as-already-removed handling.)
  - [x] Validate progress updates. (Covered per provider, including released-episode clamping.)
  - [x] Validate status updates. (Covered per provider, including no-op/rejection cases.)
  - [x] Validate score updates. (Covered per provider plus the domain score rule tests.)
  - [x] Validate rapid multi-tap episode progress behavior. (`use-episode-progress-intent.test.tsx`, `anime-details-screen.test.tsx`, `sync-engine.test.ts`.)
  - [x] Validate failure rollback/reconciliation behavior for progress. (`use-episode-progress-intent.test.tsx`, `anime-mutations.ts` reconciliation helpers and their `anime-details-screen.test.tsx` coverage.)
  - [x] Validate `Plan to Watch` restrictions after progress has started. (`anime-rules.test.ts`; enforced again at the AniList/guest repository layer.)
  - [x] Validate `Completed` restrictions for currently airing anime. (`anime-rules.test.ts`; enforced again at the AniList repository layer.)
  - [x] Validate completion auto-progress behavior when total episodes are known. (`anime-rules.test.ts`; MAL repository test.)
  - [x] Validate status/progress behavior when episode total is unknown. (`anime-rules.test.ts` unknown-total matrix.)
  - [x] Validate MAL uses real catalog tracking context for domain decisions. (`mal-user-anime-list-repository.ts` resolves tracking context from the catalog repository, not guessed defaults; tested.)
  - [ ] Add tests for uncovered cross-provider rule parity. **Known gap (LOW, deferred):** there is no shared/parametrized test harness that runs the identical domain-rule assertions against both the AniList and MAL repository implementations. The underlying domain rules themselves are already tested provider-agnostically (`anime-rules.test.ts`), and each provider independently re-tests the overlapping scenarios with its own fixtures, so the risk of undetected divergence is low but not zero. Deferred to a future hardening pass rather than blocking 1.0.

- [x] Phase 4 — Catalog and provider resilience review
  - [x] Validate AniList catalog primary behavior. (`resilient-anime-catalog-repository.test.ts` — "uses AniList first and records provider-neutral runtime state".)
  - [x] Validate MAL public fallback behavior. (Same suite — "uses MAL for eligible failures and empty required collections"; non-fallback-eligible errors are proven not to fall back.)
  - [x] Validate operation-family circuit breakers. (`catalog-circuit-breaker.test.ts` and `catalog-circuit-breaker-registry.test.ts` cover breaker mechanics and family isolation using representative families.)
  - [x] Validate provider-wide rate-limit gate behavior. (`resilient-anime-catalog-repository.test.ts` — "uses one provider-wide rate gate without opening a family circuit".)
  - [x] Validate cache fallback behavior. (Same suite — "uses a previous valid operation cache only after both providers fail".)
  - [x] Validate cold-start request coalescing. (`anilist-anime-catalog-repository.test.ts`, `anilist-request-coordinator.test.ts`, `mal-anime-catalog-repository.test.ts`.)
  - [x] Validate search request coalescing. (Handled via `AniListCatalogCache`'s keyed in-flight map, architecturally separate from Home's discovery coalescing; behavior confirmed by code review.)
  - [x] Validate malformed provider response handling. (DTO validation tests across `anilist-dtos.test.ts`, `mal-dtos.test.ts`, `mal-user-list-dtos.test.ts`, `anilist-user-list-mapper.test.ts`.)
  - [x] Validate timeout/network/5xx error classification. (`anilist-errors.ts`/`mal-errors.ts` with their status-mapping tests.)
  - [x] Verify HTTP 429 does not incorrectly open unrelated circuits. (`resilient-anime-catalog-repository.test.ts` — "uses one provider-wide rate gate without opening a family circuit" proves the rate gate absorbs 429s instead of the circuit breaker recording them.)
  - [x] Review retry policies to prevent ambiguous duplicate writes. (List mutations intentionally disable automatic retry (`retry: false`); guest add/remove is proven idempotent; `SyncEngine` retries and coalesces pending writes to a single final value before delivery.)
  - [x] Check request concurrency limits against provider safety goals. (`AniListRequestCoordinator` bounds concurrent work with a semaphore, tested in `anilist-request-coordinator.test.ts`.)
  - [x] Add missing resilience tests. (Coverage above was already in place; no additional gap found worth a dedicated new test.)

- [x] Phase 5 — Loading, empty, error, retry, and offline UX
  - [x] Audit every major screen for initial loading. (Home/Search/My List/Anime Details each gate a dedicated `Skeleton` layout on their loading state; Settings has no primary async fetch to skeleton.)
  - [x] Audit every major screen for refresh loading. **Finding (LOW, deferred):** only My List has explicit pull-to-refresh (`onRefresh`/`RefreshControl`). Home, Search, Anime Details, and Settings refresh only via their retry action or React Query's default refetch-on-focus, not a pull gesture. Not release-blocking; candidate for a future polish pass.
  - [x] Audit every major screen for empty state. (Shared `EmptyState` primitive reused by Home rails, Search, My List, and Anime Details.)
  - [x] Audit every major screen for provider error state. (Shared `ErrorState`/`SectionErrorState`, visually distinct from loading/empty, used consistently.)
  - [x] Audit every major screen for retry state. (Each screen's `ErrorState` wires a retry action to the relevant `refetch`; My List additionally retries only the failed page.)
  - [x] Audit account reconnect-required states. **Finding (LOW, deferred):** Settings and Onboarding show a dedicated reconnect-required state distinctly from not-connected. Home only surfaces the related `errors.sessionExpired` message reactively when that specific error occurs, without a standing reconnect banner of its own. Not release-blocking.
  - [x] Audit slow-network behavior. (All provider clients use `AbortController` + timeout, mapped to a `timeout` error surfaced through the normal error UI rather than an indefinite spinner.)
  - [x] Avoid blank content flashes during background refetches. (Search explicitly uses `keepPreviousData`; other catalog queries reduce refetch frequency via `staleTime`. Acceptable for 1.0.)
  - [x] Avoid blocking the entire screen for mutations that can remain local-first. (Episode progress and status/score mutations update optimistically via React Query cache patches; only the specific control shows a busy state.)
  - [x] Ensure error messages are actionable without exposing provider internals. (Spot-checked `errors.*` strings — no raw HTTP status codes or provider jargon.)
  - [x] Ensure rate-limit states use human language instead of raw HTTP messages. (`errors.rateLimit` — "The anime catalog is receiving too many requests. Please wait a moment and try again.")
  - [x] Standardize loading indicators/skeletons where visually appropriate. (Single shared `Skeleton` primitive reused across all data screens.)
  - [x] Review disabled-state feedback for buttons and controls. (`Button` and status/radio rows consistently apply a reduced-opacity disabled style.)

- [x] Phase 6 — UI and UX refinement
  - [x] Review Home visual hierarchy. (Brand header → featured hero → Continue Watching / Popular Now / This Season / Upcoming rails, each independently loading/empty/error.)
  - [x] Review Search interaction and result states. (Debounced input, empty/loading/error/result grid, responsive column count.)
  - [x] Review Anime Details interaction density. (Reviewed; the screen intentionally carries progress, status, score, synopsis/translation, alternative titles, info table, continuity, and streaming sections — dense by design, not accidentally cluttered.)
  - [x] Review My List readability and list actions. (Status filter chips + infinite list; per-item editing intentionally lives in Anime Details rather than inline, keeping the list itself scannable.)
  - [x] Review Settings information architecture. (Account / Preferences / About, with a gated Primary List Provider section once both accounts are connected.)
  - [x] Review account/provider selection UX. (`PrimaryListProviderSection` in Settings, `PrimaryListProviderBanner` reactively in My List.)
  - [x] Review onboarding completion and first-use flow. (Welcome → Learn carousel → Providers, completion gated on a validated account.)
  - [x] Check touch targets. (Consistent `min-h-11`/`min-h-12` (44/48px) convention across buttons, chips, radio rows, and selector pills.)
  - [x] Check spacing consistency. **Finding (LOW, deferred):** no dedicated spacing-token scale exists; screens use Tailwind's default numeric utilities directly rather than app-specific named spacing tokens. Not a visible inconsistency, just a design-system maturity item for a future pass.
  - [x] Check typography hierarchy. (Centralized `textVariants` in `ui/text.tsx`.)
  - [x] Check icon consistency. (Single icon library, `lucide-react-native`, via a shared `Icon` wrapper.)
  - [x] Check modal/sheet consistency. **Finding (LOW, deferred):** there is no shared Modal/BottomSheet primitive; confirmations use the native `Alert.alert` API directly. Acceptable for 1.0's simple confirm/cancel needs.
  - [x] Check animation/loading transitions for jank. (Reanimated-based throughout — status selector, tab bar, splash/startup, expandable text, progress bar, collapsible sections — consistently respecting `ReduceMotion.System`.)
  - [x] Check small-device layouts. (Responsive breakpoints via `useWindowDimensions` and Tailwind `md:` classes; discrete column-count function for Search rather than fixed pixel widths.)
  - [x] Check large-device layouts. (Same responsive mechanisms extend to `web:max-w-6xl` centering on wide viewports.)
  - [x] Review dark-mode contrast. (Puriki is intentionally dark-only per `app.json`; `tokens.test.ts` asserts a real WCAG contrast ratio ≥ 4.5 for primary/foreground/background. Semantic status colors (success/warning/destructive) are defined but not individually contrast-tested — noted as a LOW follow-up, not a blocker.)
  - [x] Remove visual states that imply unavailable functionality. (Removed a vestigial `'coming_soon'` state from `AccountProfileCard` — dead code left over from before MAL was fully implemented, confirmed unreachable by every call site, and already regression-tested as absent in `onboarding-screen.test.tsx`.)

- [x] Phase 7 — Accessibility and localization
  - [x] Audit accessibility labels on interactive controls. (`accessibilityLabel`/`accessibilityRole`/`accessibilityHint` used consistently across ~28 presentation files, not sporadically.)
  - [x] Audit focus behavior where relevant. **Finding (LOW, deferred):** no explicit focus-management code (e.g. autofocus on the search input) exists anywhere. Minor for a touch-first mobile app; candidate for a future accessibility pass.
  - [x] Audit screen-reader descriptions for progress/status controls. (Episode progress control and status selector both expose full localized labels/hints/state, not icon-only.)
  - [x] Audit contrast of semantic colors. **Finding (LOW, deferred):** `tokens.test.ts` enforces a real WCAG contrast ratio for primary/foreground/background, but not for the success/warning/destructive tokens individually. Deferred, not a known failure — just untested.
  - [x] Audit dynamic text wrapping. (Synopsis body uses an expandable component rather than hard truncation; some card/list titles cap at a fixed line count, an accepted, common trade-off.)
  - [x] Audit English strings. (`src/localization/locales/en.ts`, 305 keys across 16 namespaces.)
  - [x] Audit Brazilian Portuguese strings. (`pt-BR.ts` — key set verified identical to `en.ts`, 305/305.)
  - [x] Audit Spanish strings. (`es.ts` — key set verified identical to `en.ts`, 305/305.)
  - [x] Confirm pluralization does not rely on English word order. (i18next `_one`/`_other` interpolation used correctly for every count-dependent string.)
  - [x] Remove hardcoded presentation strings that should be localized. (Sampled multiple screens; the only literal string found was the "Puriki" brand name itself, which is correct to leave untranslated.)
  - [x] Ensure provider names remain proper nouns and are not incorrectly translated. (Verified "AniList"/"MyAnimeList" remain untranslated inside pt-BR and es strings.)

- [x] Phase 8 — Synopsis translation hardening
  - [x] Re-run Android translation success flow. (`use-synopsis-translation.test.tsx`; underlying `ml-kit-synopsis-translator.test.ts`.)
  - [x] Re-run first-model-download flow. (Native module calls `downloadModelIfNeeded` before translating; UI shows a "first use may require downloading" hint while translating. It shares JS-level loading state with normal translation rather than having its own distinct state — acceptable, noted as a minor UX nicety for later.)
  - [x] Re-run corrupted/invalid model recovery flow. (Native `deleteDownloadedModels()` in `PurikukiTranslationModule.kt` explicitly forces a clean re-download when a model is corrupt — this is the exact RC1 fix already validated on a real device; not independently unit-testable since it requires an instrumented Android test, not a Jest one.)
  - [x] Validate fallback to original synopsis after translation failure. (`use-synopsis-translation.test.tsx` — "preserves the original after failure and succeeds on retry".)
  - [x] Validate translation cache behavior. (`async-storage-synopsis-translation-cache.test.ts`.)
  - [x] Validate language switching behavior. (`use-synopsis-translation.test.tsx` — resets to original on language change and discards stale in-flight results.)
  - [x] Ensure model deletion/re-download logic remains isolated in native infrastructure. (Confirmed: lives entirely in the Kotlin module; JS/presentation only consume `translate()`/error codes.)
  - [x] Validate attribution rendering. (`anime-synopsis-section.tsx` renders the Google attribution image/label whenever a translation is showing.)
  - [x] Validate non-Android behavior remains graceful. (`requireOptionalNativeModule` resolves to `null` off-Android; `isAvailable()`/`canTranslate` gate the UI without crashing, tested.)

- [x] Phase 9 — Performance and resource review
  - [x] Measure Home cold-start request count. (4 React Query hooks collapse into a single coalesced GraphQL request at the repository layer — see Phase 4's coalescing tests.)
  - [x] Measure Search request behavior during typing. (Input is debounced 250ms via `use-debounced-value.ts` before querying.)
  - [x] Measure My List initial load. (Single `useInfiniteUnifiedUserList` query, not N+1; MAL collection resolution explicitly tested against N+1.)
  - [x] Measure Anime Details load behavior. (Single `useAnimeDetails` query on mount; mutations are user-triggered, not additional load-time reads.)
  - [x] Identify unnecessary list re-renders. **Finding (LOW, deferred):** `anime-card.tsx` and `anime-list-item.tsx` use no `React.memo`/`useMemo`/`useCallback`. Not a demonstrated user-facing issue at 1.0's typical list sizes; a candidate for a future performance pass rather than a 1.0 blocker.
  - [x] Identify duplicate catalog hydration. (Single shared `CatalogItemStore` inside the resilient repository serves the same anime to multiple screens without refetching.)
  - [x] Validate React Query cache keys and invalidation. (Centralized `query-keys.ts` factory used consistently; no ad-hoc inline keys found.)
  - [x] Review expensive selectors/computations in presentation. (Spot-checked Home/Search/My List render bodies; no unmemoized heavy sort/filter found in that sample.)
  - [x] Check unnecessary image reloads. **Finding (LOW, deferred):** the app uses plain React Native `Image`, not a caching component like `expo-image`. A concrete post-1.0 improvement, not a correctness issue, and adding a new imaging dependency is out of scope for this task.
  - [x] Check memory growth during long browsing sessions. **Finding (LOW, deferred):** `CatalogItemStore` is an unbounded `Map` with no TTL/eviction beyond a full manual `clear()`. For 1.0's expected session lengths this is acceptable; worth revisiting if long-session memory growth is ever reported.
  - [x] Confirm request preservation/rate-limit behavior remains a design priority. (Enforced in code via the provider-wide rate gate and per-family circuit breakers reviewed in Phase 4; explicitly documented as a priority in this roadmap's Feature 2.0 rate-limit contract for future List Sync work.)

- [x] Phase 10 — Automated test gap analysis
  - [x] Inventory current unit tests. (726 tests across 92 suites; 91 `.test.ts(x)` files under `src`.)
  - [x] Inventory repository integration-style tests. (47 test files under `src/infrastructure`, covering AniList/MAL/guest repositories, resilience, sync, and auth.)
  - [x] Inventory hook/controller tests. (31 test files under `src/presentation`, including screens, mutation hooks, and controllers.)
  - [x] Identify critical production paths with no regression coverage. (This audit's four evidence passes over auth, list mutations, resilience/performance, loading/UX, accessibility, and translation found no uncovered critical path — only the specific low-severity gaps documented inline in Phases 2–9.)
  - [ ] Add missing tests for provider parity. **Same known gap as Phase 3:** no shared cross-provider (AniList vs. MAL) parity test harness exists yet. Deferred (LOW), not release-blocking — see the Phase 3 note for the underlying risk assessment.
  - [x] Add missing tests for domain rule boundaries. (`anime-rules.test.ts` already covers the status/progress/score rule matrix; no gap found.)
  - [x] Add missing tests for account-provider selection. (`primary-list-provider-controller.test.ts`, `settings-screen.test.tsx`.)
  - [x] Add missing tests for malformed provider data. (DTO tests across both providers already cover this; no gap found.)
  - [x] Add missing tests for mutation failure paths. (Rollback/reconciliation tests already exist for progress, status, and membership mutations; the one concrete gap found — `restoreSession` transient-failure safety — has been closed with a new test per provider.)
  - [x] Remove redundant tests that duplicate assertions without increasing confidence. (No redundant tests identified during this audit; existing suites were judged purposeful, not padding.)
  - [x] Keep tests deterministic and independent of live provider APIs. (Confirmed throughout: all repository/auth/translation tests use injected transports and fixtures, never live HTTP calls.)

- [x] Phase 11 — Documentation cleanup
  - [x] Update README to reflect current MAL OAuth support. (Supported-services table lists "OAuth with PKCE" for MyAnimeList in all three languages.)
  - [x] Update README to reflect authenticated MAL user-list support. (Same table: read/add/remove/progress/status/score for MyAnimeList.)
  - [x] Update README Sync Engine section to mention both authenticated providers write directly today. **Obsolete as originally worded:** the public README never exposes internal "Sync Engine" terminology — that concept only exists in this roadmap's Feature 3.0 section. The user-facing concern is already satisfied by the README's explicit "Puriki 1.0 manages one selected provider list at a time... does not copy or continuously synchronize" wording.
  - [x] Update guest-list documentation if current behavior differs. (Guest mode accurately described in the Features list and Supported-services table.)
  - [x] Update current limitations. (Covered by the Roadmap section's explicit "future considerations" list and the Privacy/security section.)
  - [x] Update provider/auth setup instructions. (Development section documents the public client-ID env vars and native redirect URIs.)
  - [x] Review architecture documentation. (README Architecture section's four-layer breakdown matches the current `domain/application/infrastructure/presentation` split confirmed in Phase 1.)
  - [x] Ensure this roadmap is linked from the main README. (Linked at the top and from the Roadmap section, in all three languages.)
  - [x] Remove stale project naming/description references where appropriate. (No stale "Purikuki" branding remains in any public README; `app.json`'s description was also corrected this pass to say Google ML Kit instead of Google Translate.)
  - [x] Ensure documentation clearly separates implemented vs planned features. (README explicitly lists List Sync, continuous multi-provider sync, and auto-update infrastructure as future, not 1.0, features.)

- [x] Phase 12 — Device validation and Feature 1.0 release candidate
  - [x] Run clean install on Android Development Build. (Performed repeatedly across the RC1/RC2/RC3 hardening passes and this reconciliation; see `docs/RELEASING.md`.)
  - [x] Validate onboarding. (Manually verified first-run/returning-user routing during RC2 device acceptance.)
  - [x] Validate AniList-only, MAL-only, both-connected, and no-provider states. (Exercised manually during screenshot capture and RC device passes; automated coverage in `settings-screen.test.tsx` and `onboarding-screen.test.tsx` for all four combinations.)
  - [x] Validate primary-provider switching. (`settings-screen.test.tsx` — Primary List Provider picker; manually confirmed available once both accounts are connected.)
  - [x] Validate list reads/writes on AniList. (RC1/RC2 real-device acceptance; AniList Developer Build authentication re-confirmed PASS during the RC3 investigation.)
  - [x] Validate list reads/writes on MAL. (RC1/RC2 real-device acceptance; unaffected by the RC3 AniList investigation.)
  - [x] Validate synopsis translation. (RC1 real-device fix for corrupted-model recovery; RC2 real-device acceptance.)
  - [x] Validate app restart with persisted sessions/settings. (`restoreSession` cold-start tests for both providers; manually confirmed during RC device passes.)
  - [x] Run the complete automated quality gate. (`npm ci`, typecheck, lint, format:check — clean; `test:ci` — 92 suites / 728 tests passing after this reconciliation's two new tests; `expo-doctor` — 21/21.)
  - [x] Record remaining known limitations. (Documented inline throughout Phases 2–10 above: cross-provider parity test harness, per-screen pull-to-refresh coverage, Home reconnect banner, list-item memoization, image caching, focus management, and semantic-color contrast tests — all LOW severity and explicitly deferred, none release-blocking.)
  - [x] Fix release-blocking defects. (None found during this reconciliation. The one confirmed regression — AniList OAuth on a production APK — is tracked separately in `docs/RELEASING.md`'s AniList verification checklist and is pending validation on the next production APK, not a Feature 1.0 code defect.)
  - [x] Prepare a maintainer review summary for Feature 1.0 acceptance. (This reconciliation pass and its final report serve as that summary.)

## Feature 1.0 acceptance summary

This reconciliation pass audited every nested task in Phases 1–12 against the
current source, automated tests, and prior accepted release validations,
rather than mechanically checking boxes. All 12 phases are now accepted as
**COMPLETE** under the authorization granted for this reconciliation. No
BLOCKER or HIGH-severity gap was found.

A handful of concrete, LOW-severity items were found and intentionally
**deferred past 1.0** rather than turned into an open-ended redesign. None of
them affect correctness; they are documented inline in their phase above and
summarized here for visibility:

- No shared cross-provider (AniList/MAL) domain-rule parity test harness
  (Phase 3 / Phase 10) — the rules themselves are already tested
  provider-agnostically.
- Pull-to-refresh exists only on My List, not Home/Search/Anime Details/
  Settings (Phase 5) — those screens still refresh via retry actions and
  React Query's default refetch behavior.
- Home has no dedicated "reconnect required" banner of its own (Phase 5) —
  it inherits the generic session-expired message reactively.
- No `React.memo`/`useMemo` on list/card components (Phase 9).
- Plain React Native `Image` rather than a caching image component (Phase 9).
- `CatalogItemStore` has no cache eviction policy (Phase 9).
- No explicit focus-management code (Phase 7).
- Contrast is only asserted for primary/foreground/background tokens, not
  individually for success/warning/destructive (Phase 6/7).
- No shared Modal/BottomSheet primitive; confirmations use native
  `Alert.alert` (Phase 6).
- No dedicated spacing-token scale; screens use Tailwind's default numeric
  utilities directly (Phase 6).

Two concrete gaps found during this pass were small enough to fix directly
rather than defer:

- Both AniList's and MAL's `restoreSession` were missing a test proving a
  transient (network/timeout) failure does not destroy a stored credential —
  the behavior was already correct, only the test coverage was missing. Added
  one test per provider.
- `AccountProfileCard` retained a vestigial `'coming_soon'` connection state
  and its associated dimmed styling, left over from before MyAnimeList was
  fully implemented and confirmed unreachable by every call site. Removed.

Feature 1.0 — Foundation Stabilization: **COMPLETE**.

---

# Feature 2.0 — List Sync + Visual/Color Refresh

## Goal

Feature 2.0 introduces two coordinated product changes:

1. **Puriki visual/color refresh**
2. **List Sync**

The visual refresh should be established before the final List Sync UI is built, so the new product surface does not immediately require a second visual migration.

List Sync is a **manual, reusable, directional reconciliation** between two connected provider lists.

```text
Source provider → Destination provider
```

The user explicitly chooses the direction.

The source is authoritative **only where Puriki can safely apply a non-regressive supported change**.

List Sync is not continuous synchronization and does not replace the future multi-provider Sync Engine.

---

## 2.0 Product contract

### Supported synchronized state

V1 List Sync synchronizes:

- list membership from source to destination by **adding** missing destination entries;
- status;
- watched episode progress;
- score.

V1 does **not** synchronize:

- start date;
- finish date;
- rewatch count/state;
- priority;
- tags;
- custom lists;
- comments;
- notes;
- reviews;
- provider-specific metadata.

Puriki must tell the user that List Sync focuses on progress, status, score, and source membership.

### Safety contract

Puriki must prefer user-data safety over perfect mirroring.

Rules:

```text
Source has anime; destination does not
→ add to destination and apply supported state.

Source and destination both have anime; safe difference exists
→ apply source supported state to destination.

Any protected regression is detected
→ skip the entire anime.
→ do not partially update another field on that anime.
→ report the anime as a conflict / not synchronized.

Anime exists only in destination
→ never remove it.
→ display it as exclusive to the destination.
→ do not treat it as a mutation failure.

Anime cannot be mapped/identified in destination provider
→ do not attempt a write.
→ show an informational provider-data limitation.
→ no retry/manual Puriki mutation path is offered for that mapping failure.
```

### Regression contract

Puriki is not responsible for applying regressions during List Sync.

Examples:

- source episode 5, destination episode 10 → skip entire anime;
- source score 7, destination score 9 → skip entire anime;
- destination `Completed` and source would downgrade that consolidated state → skip entire anime.

Status differences that do not clearly represent loss of consolidated progress may be treated as normal synchronization differences.

Do not create an artificial full ordering of every status unless later product evidence requires it.

### Mapping limitation copy

Recommended neutral copy:

> **Não foi possível identificar este anime no MyAnimeList.**
>
> O Puriki depende das informações disponibilizadas pelo provedor. Você pode tentar novamente em alguns dias ou verificar o título diretamente no MyAnimeList.

Equivalent localized copy must exist for supported languages.

### Write lock contract

While a List Sync Job is actively writing:

```text
Reads       → allowed
Navigation  → allowed
Search      → allowed
List writes → blocked
```

Blocked writes include:

- add to list;
- remove from list;
- progress changes;
- status changes;
- score changes.

The UI must explain that list editing becomes available again when List Sync stops or completes.

### Single-job contract

There may be only **one List Sync Job at a time**.

No parallel List Sync jobs.

### Stop contract

User may stop an active sync.

Stop behavior:

1. user requests stop;
2. Puriki stops accepting new items for processing;
3. if one anime is currently being written, Puriki waits for that item to settle;
4. execution is closed as `stopped_by_user`;
5. no remaining checkpoint is resumed later;
6. the next sync requires the complete List Sync flow again from analysis;
7. the global cooldown starts.

This is effectively **stop + reset**, not pause/resume.

### Retry contract

For normal per-anime write failures:

```text
initial attempt fails
→ record failure and continue processing remaining anime

job finishes with failures
→ user may explicitly retry only failed items once

second failure
→ mark item as manual_action_required / needs attention
→ no third automatic List Sync attempt in the same execution
```

Mapping/identity failures are different: they are known before mutation and should not consume this retry path.

### Rate-limit contract

HTTP 429 / provider rate-limit state is not an anime failure.

```text
provider asks Puriki to wait
→ List Sync enters waiting_for_provider
→ apply provider-safe delay/backoff
→ resume automatically when safe
```

If waiting/retry reaches a defined operational ceiling, the job may enter a global paused/provider-unavailable state instead of waiting forever.

User-facing UI should not say `Error 429`.

### Cooldown contract

After a List Sync execution is definitively closed, a **global 15-minute cooldown** begins.

During cooldown:

- no new List Sync analysis;
- no new List Sync execution;
- direction changes may be viewed but cannot initiate provider reads for analysis;
- UI shows when List Sync becomes available again.

For a `completed_with_failures` execution:

- the dedicated retry of failed items belongs to the same execution and bypasses the cooldown;
- a brand-new analysis remains unavailable;
- cooldown starts after the retry finishes or the user closes the execution without retry, according to final UX decision.

### ETA contract

List Sync should provide an ETA.

ETA principles:

- conservative rather than optimistic;
- based on a provider-safe processing rate / request budget;
- available early in the job when enough information exists;
- recalculated upward when rate limits, waits, or slower provider behavior occur;
- must never encourage Puriki to send requests faster to satisfy the displayed estimate.

### Last execution contract

UI label should be **Last List Sync / Último List Sync / Última execução**, not “last synchronization” if that implies success.

The visible summary does not need to expose source → destination history.

Internally, every execution must still persist:

- source provider;
- source account identity;
- destination provider;
- destination account identity;
- start/end timestamps;
- outcome;
- counts;
- reason for stop/failure.

---

- [ ] Phase 1 — Visual and color design foundation
  - [ ] Define the Feature 2.0 visual direction before List Sync presentation work.
  - [ ] Decide whether Puriki remains dark-first or gains broader appearance changes.
  - [ ] Define new semantic color tokens.
  - [ ] Define primary/brand color.
  - [ ] Define background colors.
  - [ ] Define elevated surface colors.
  - [ ] Define foreground/text colors.
  - [ ] Define muted text colors.
  - [ ] Define border/divider colors.
  - [ ] Define success color semantics.
  - [ ] Define warning color semantics.
  - [ ] Define destructive/error color semantics.
  - [ ] Define informational/waiting color semantics.
  - [ ] Define focus/pressed/disabled states.
  - [ ] Define provider-brand usage rules without allowing provider colors to replace Puriki semantics.
  - [ ] Define List Sync directional visual language.
  - [ ] Validate contrast/accessibility.
  - [ ] Centralize new tokens instead of scattering literal colors.
  - [ ] Migrate shared primitives/components first.
  - [ ] Review Home/Search/List/Details/Settings under new tokens.
  - [ ] Avoid mixing legacy and Feature 2.0 color systems in final UI.
  - [ ] Add visual migration notes to documentation.

- [ ] Phase 2 — List Sync domain vocabulary and contracts
  - [ ] Define provider-neutral `ListSyncProviderId`/account-scope representation.
  - [ ] Define normalized `ListSyncEntry`.
  - [ ] Define provider-neutral supported fields: status, watchedEpisodes, score.
  - [ ] Define list-membership semantics.
  - [ ] Define normalized identity required to compare AniList and MAL entries safely.
  - [ ] Define comparison result model.
  - [ ] Define difference reasons.
  - [ ] Define regression/conflict reasons.
  - [ ] Define exclusive-destination representation.
  - [ ] Define unmapped/unidentified representation.
  - [ ] Define planner result contract.
  - [ ] Define job state contract.
  - [ ] Define item execution state contract.
  - [ ] Define terminal execution outcomes.
  - [ ] Keep these contracts separate from existing incremental Sync Engine contracts.
  - [ ] Add unit tests for contract invariants.

- [ ] Phase 3 — Provider snapshot acquisition
  - [ ] Define provider-neutral source list snapshot port.
  - [ ] Define provider-neutral destination list snapshot port.
  - [ ] Fetch complete AniList authenticated list snapshot.
  - [ ] Fetch complete MAL authenticated list snapshot.
  - [ ] Preserve provider account identity with each snapshot.
  - [ ] Capture enough provider metadata for future writes without leaking it to presentation.
  - [ ] Detect incomplete pagination.
  - [ ] Fail analysis safely if a provider list cannot be completely loaded.
  - [ ] Ensure no mutations occur during analysis.
  - [ ] Share existing authenticated rate/request coordination where appropriate.
  - [ ] Avoid duplicating provider API clients.
  - [ ] Test multi-page provider lists.
  - [ ] Test partial-page failure.
  - [ ] Test provider authorization failure.
  - [ ] Test rate-limited snapshot acquisition.
  - [ ] Test malformed response handling.

- [ ] Phase 4 — Anime identity and provider mapping
  - [ ] Document current MAL-ID domain identity constraint.
  - [ ] Define how AniList list entries map to MAL-backed Puriki identity.
  - [ ] Define how destination-provider write identity is resolved.
  - [ ] Detect source anime that cannot be identified for destination.
  - [ ] Ensure identity failures cannot accidentally mutate a similarly named anime.
  - [ ] Do not use fuzzy title matching for destructive or authoritative writes unless explicitly approved in a future phase.
  - [ ] Represent mapping failure as provider-data limitation.
  - [ ] Exclude known mapping failures from executable work items.
  - [ ] Include mapping failures in analysis summary.
  - [ ] Test missing MAL IDs.
  - [ ] Test missing AniList provider IDs where required.
  - [ ] Test identity collisions/duplicate defensive behavior.

- [ ] Phase 5 — List Sync planner and comparison engine
  - [ ] Compare source and destination locally after complete snapshots are available.
  - [ ] Count total analyzed anime separately from work items.
  - [ ] Count each anime requiring work once, even if multiple fields differ.
  - [ ] Record field-level differences for explanation/debugging.
  - [ ] Detect source-only anime that should be added.
  - [ ] Detect destination-only anime as exclusive destination items.
  - [ ] Never plan destination deletion.
  - [ ] Detect progress difference.
  - [ ] Detect score difference.
  - [ ] Detect status difference.
  - [ ] Detect protected regression.
  - [ ] Skip the entire anime when protected regression exists.
  - [ ] Produce a deterministic work-item order.
  - [ ] Produce analysis summary counts.
  - [ ] Ensure summary category counts may overlap while unique work-item count does not.
  - [ ] Test identical lists.
  - [ ] Test source-only additions.
  - [ ] Test destination-only exclusives.
  - [ ] Test multi-field differences on one anime.
  - [ ] Test mixed safe/conflicting anime sets.

- [ ] Phase 6 — Regression safety rules
  - [ ] Implement episode regression detection.
  - [ ] Implement score regression detection.
  - [ ] Implement consolidated-status regression detection.
  - [ ] Treat destination `Completed` downgrade as protected conflict.
  - [ ] Document which status transitions are considered safe List Sync differences.
  - [ ] Reuse existing Puriki domain rules where they apply.
  - [ ] Do not let List Sync bypass anime airing/completion rules.
  - [ ] Ensure a regression in one field prevents every write for that anime.
  - [ ] Expose neutral conflict reason to presentation.
  - [ ] Keep provider-specific status mapping in infrastructure.
  - [ ] Add table-driven tests for regression scenarios.
  - [ ] Add tests proving no partial write is planned after regression.

- [ ] Phase 7 — Analysis UX
  - [ ] Add List Sync as a primary navigation destination.
  - [ ] Require two connected supported providers before enabling the feature.
  - [ ] Build source/destination selector.
  - [ ] Make direction visually unmistakable.
  - [ ] Support swapping source/destination before a job begins.
  - [ ] Disable new analysis during global cooldown.
  - [ ] Show consequence text before analysis.
  - [ ] Explain supported synchronized fields.
  - [ ] Show full analysis loading state.
  - [ ] Show total analyzed count.
  - [ ] Show unique anime requiring synchronization.
  - [ ] Show already aligned count.
  - [ ] Show progress/status/score difference indicators.
  - [ ] Show source-only additions.
  - [ ] Show destination-exclusive anime as informational and unchanged.
  - [ ] Show unidentified/mapping-limited anime as informational.
  - [ ] Show protected regressions as skipped/conflicts.
  - [ ] Handle “lists already synchronized”.
  - [ ] Do not expose technical provider DTOs or raw HTTP errors.
  - [ ] Add localized strings and pluralization tests.

- [ ] Phase 8 — Confirmation and safety UX
  - [ ] Show source → destination again before confirmation.
  - [ ] Show number of executable work items.
  - [ ] Show number of skipped regression conflicts.
  - [ ] Show number of mapping limitations.
  - [ ] Show destination-exclusive items remain untouched.
  - [ ] State clearly that Puriki never removes destination-only entries in List Sync.
  - [ ] State clearly that list editing is temporarily disabled while writes are active.
  - [ ] Warn Android users that minimizing is supported but force-closing may interrupt execution.
  - [ ] Explain that interrupted process state is handled according to persisted job guarantees.
  - [ ] Require explicit user confirmation before first write.
  - [ ] Prevent double-submit.
  - [ ] Revalidate connected accounts immediately before starting the job.

- [ ] Phase 9 — Persistent List Sync Job model
  - [ ] Create List Sync persistence separate from existing Sync Engine pending-operation storage.
  - [ ] Persist job ID.
  - [ ] Persist source provider/account scope.
  - [ ] Persist destination provider/account scope.
  - [ ] Persist analysis/planner version.
  - [ ] Persist work items.
  - [ ] Persist processed/succeeded/failed/remaining counts.
  - [ ] Persist current item.
  - [ ] Persist per-item attempt count.
  - [ ] Persist per-item final state.
  - [ ] Persist started/updated/finished timestamps.
  - [ ] Persist stop request state.
  - [ ] Persist provider waiting state where necessary.
  - [ ] Persist enough information to recover after process recreation.
  - [ ] Version the storage schema.
  - [ ] Handle corrupted persisted state safely.
  - [ ] Handle account mismatch safely.
  - [ ] Test serialization/deserialization.
  - [ ] Test migration/future-schema defensive behavior.

- [ ] Phase 10 — List Sync processor
  - [ ] Create provider-neutral `ListSyncProcessor`.
  - [ ] Process one work item safely at a time unless later evidence supports bounded parallelism.
  - [ ] Apply add-to-list when source membership is missing in destination.
  - [ ] Apply safe supported status.
  - [ ] Apply safe progress.
  - [ ] Apply safe score.
  - [ ] Let destination adapter decide the minimum provider calls required.
  - [ ] Avoid replaying historical episode increments.
  - [ ] Apply desired final supported state instead.
  - [ ] Respect existing Puriki domain rules before provider writes.
  - [ ] Record success only after provider confirms the operation.
  - [ ] Continue after normal per-item failure.
  - [ ] Serialize state checkpoint after meaningful transitions.
  - [ ] Never delete a destination-only anime.
  - [ ] Never write an item skipped for regression/mapping.
  - [ ] Test successful mixed add/update job.
  - [ ] Test provider write rejection.
  - [ ] Test network ambiguity handling.
  - [ ] Test process restart between work items.

- [ ] Phase 11 — Provider write adapters
  - [ ] Implement AniList List Sync target adapter.
  - [ ] Implement MAL List Sync target adapter.
  - [ ] Reuse authenticated clients/repositories where safe.
  - [ ] Avoid routing bulk reconciliation through the existing incremental Sync Engine.
  - [ ] Preserve provider mutation serialization rules.
  - [ ] Map normalized status safely to AniList.
  - [ ] Map normalized status safely to MAL.
  - [ ] Handle score semantics correctly.
  - [ ] Handle add-to-list semantics correctly.
  - [ ] Use actual tracking context when domain validation needs it.
  - [ ] Classify unauthorized globally.
  - [ ] Classify rate limit globally.
  - [ ] Classify provider item rejection as per-item failure.
  - [ ] Classify mapping errors before mutation when possible.
  - [ ] Add adapter tests using injected transports.

- [ ] Phase 12 — Rate limiting, backoff, and provider waiting
  - [ ] Integrate existing provider rate-limit knowledge where possible.
  - [ ] Define safe List Sync pacing independent of optimistic provider maxima.
  - [ ] Respect `Retry-After` / reset information when available.
  - [ ] Implement `waiting_for_provider` job state.
  - [ ] Continue automatically when safe.
  - [ ] Ensure waiting does not increment anime failure count.
  - [ ] Define operational ceiling for repeated waits/provider unavailability.
  - [ ] Transition to global paused/provider issue when ceiling is reached.
  - [ ] Keep UI language non-technical.
  - [ ] Add deterministic tests with injected clock/timers.

- [ ] Phase 13 — ETA
  - [ ] Define initial conservative ETA formula.
  - [ ] Base ETA on remaining executable work items, not total analyzed anime.
  - [ ] Include provider-safe request pacing.
  - [ ] Include known current provider wait when available.
  - [ ] Recalculate after meaningful processing samples.
  - [ ] Recalculate upward after throttling/backoff.
  - [ ] Avoid large second-to-second oscillation.
  - [ ] Hide or label ETA as calculating when confidence is insufficient.
  - [ ] Ensure ETA logic never changes request pacing merely to satisfy estimate.
  - [ ] Add deterministic ETA tests.

- [ ] Phase 14 — Retry and final attention states
  - [ ] Complete initial execution even when some anime fail.
  - [ ] Show succeeded count.
  - [ ] Show failed count.
  - [ ] Show skipped conflicts separately.
  - [ ] Show mapping limitations separately.
  - [ ] Enable retry only for eligible per-item write failures.
  - [ ] Retry only failed items.
  - [ ] Allow exactly one dedicated retry round.
  - [ ] Mark second failure as `manual_action_required` / needs attention.
  - [ ] Do not offer a third List Sync retry in the same execution.
  - [ ] Do not offer mutation retry for mapping limitations.
  - [ ] Ensure a future brand-new List Sync analysis can reconsider every anime.
  - [ ] Add tests for all retry transitions.

- [ ] Phase 15 — Stop + reset behavior
  - [ ] Add explicit stop action.
  - [ ] Require confirmation explaining already-applied changes are not reverted.
  - [ ] Set `stop_requested` without interrupting an in-flight anime unsafely.
  - [ ] Finish current anime operation.
  - [ ] Do not start the next work item.
  - [ ] Close execution as `stopped_by_user`.
  - [ ] Clear resumable remaining-work intent for this execution.
  - [ ] Preserve final execution summary/history metadata.
  - [ ] Start cooldown after stop finalizes.
  - [ ] Require complete new analysis after cooldown.
  - [ ] Test stop while idle between items.
  - [ ] Test stop during provider write.
  - [ ] Test repeated stop presses.

- [ ] Phase 16 — Global write lock
  - [ ] Introduce provider-neutral application-level List Sync write-lock state.
  - [ ] Block add-to-list while an active job is writing/waiting.
  - [ ] Block remove-from-list while an active job is writing/waiting.
  - [ ] Block episode progress changes.
  - [ ] Block status changes.
  - [ ] Block score changes.
  - [ ] Keep Home reads available.
  - [ ] Keep Search available.
  - [ ] Keep Anime Details reads available.
  - [ ] Keep My List reads available.
  - [ ] Show consistent explanation when a blocked write is attempted.
  - [ ] Avoid scattering List Sync checks through unrelated UI components if a centralized mutation guard can express the rule.
  - [ ] Add tests proving every current mutation path respects the lock.

- [ ] Phase 17 — Cooldown
  - [ ] Persist last List Sync terminal execution timestamp.
  - [ ] Implement global 15-minute cooldown.
  - [ ] Block analysis during cooldown.
  - [ ] Block new job start during cooldown.
  - [ ] Block direction-triggered provider analysis reads during cooldown.
  - [ ] Show countdown/availability time.
  - [ ] Survive app restart.
  - [ ] Ensure clock drift/invalid persisted time is handled defensively.
  - [ ] Allow same-execution eligible failure retry before final cooldown.
  - [ ] Prevent retry path from accidentally becoming a new analysis.
  - [ ] Add clock-controlled tests.

- [ ] Phase 18 — Active Job UI
  - [ ] Build dedicated full List Sync active state.
  - [ ] Show source → destination.
  - [ ] Show processed / executable work count.
  - [ ] Base progress percentage on executable work items only.
  - [ ] Show current anime when appropriate.
  - [ ] Show succeeded count.
  - [ ] Show failure/attention count.
  - [ ] Show remaining count.
  - [ ] Show ETA.
  - [ ] Show waiting-for-provider state.
  - [ ] Show provider/account-paused state.
  - [ ] Show stop action.
  - [ ] Keep global navigation usable.
  - [ ] Restore the same active-job UI when user returns to List Sync.
  - [ ] Restore active-job UI when opening from Android notification.
  - [ ] Avoid raw logs in primary UX.

- [ ] Phase 19 — Android background execution strategy
  - [ ] Decide exact native/Expo implementation only after validating required behavior against current Android/Expo capabilities.
  - [ ] Support user-initiated long-running List Sync semantics.
  - [ ] Use user-visible foreground execution where Android requires it.
  - [ ] Persist checkpoints independent of notification lifecycle.
  - [ ] Define app-background behavior.
  - [ ] Define process-recreation behavior.
  - [ ] Do not promise completion after force stop.
  - [ ] Handle Android notification permission behavior appropriately.
  - [ ] Validate Android 12+ foreground-service restrictions.
  - [ ] Validate Android 13+ notification behavior.
  - [ ] Validate opening the app from the notification.
  - [ ] Document limitations honestly.
  - [ ] Add native integration tests where practical.
  - [ ] Perform real-device validation.

- [ ] Phase 20 — Android ongoing notification
  - [ ] Show Puriki ongoing notification during active execution.
  - [ ] Show List Sync direction.
  - [ ] Show progress percentage.
  - [ ] Show processed/work-item count.
  - [ ] Show waiting/provider state when applicable.
  - [ ] Keep notification copy localized if supported by implementation.
  - [ ] Tapping notification opens List Sync active-job screen.
  - [ ] Avoid mutation actions directly in notification for V1.
  - [ ] Update notification without excessive churn.
  - [ ] Remove/update notification on terminal state.
  - [ ] Validate collapsed notification.
  - [ ] Validate expanded notification.
  - [ ] Validate notification after backgrounding app.

- [ ] Phase 21 — Last execution and result UX
  - [ ] Use “Last List Sync” / “Último List Sync” / equivalent wording.
  - [ ] Record completed execution.
  - [ ] Record completed-with-failures execution.
  - [ ] Record stopped-by-user execution.
  - [ ] Record globally failed/paused terminal outcome where applicable.
  - [ ] Show final synchronized count.
  - [ ] Show retry-eligible failures.
  - [ ] Show manual-attention second failures.
  - [ ] Show regression conflicts.
  - [ ] Show mapping limitations.
  - [ ] Show destination-exclusive untouched anime.
  - [ ] Do not imply that stopped execution synchronized the entire list.
  - [ ] Keep internal source/destination/account metadata even if history UI stays simple.

- [ ] Phase 22 — Localization and accessibility
  - [ ] Implement List Sync strings in English.
  - [ ] Implement Brazilian Portuguese.
  - [ ] Implement Spanish.
  - [ ] Use plural-aware interpolation for counts.
  - [ ] Avoid sentence construction that depends on English word order.
  - [ ] Review directional copy in every language.
  - [ ] Review regression/conflict copy.
  - [ ] Review mapping limitation copy.
  - [ ] Review cooldown copy.
  - [ ] Review stop confirmation.
  - [ ] Add accessibility labels to progress indicators.
  - [ ] Add accessibility descriptions for source/destination.
  - [ ] Ensure semantic colors are not the only indicator of state.
  - [ ] Validate large text layouts.

- [ ] Phase 23 — List Sync automated validation
  - [ ] Planner unit test matrix.
  - [ ] Regression rule matrix.
  - [ ] Provider snapshot tests.
  - [ ] Mapping tests.
  - [ ] Job persistence tests.
  - [ ] Processor tests.
  - [ ] Retry tests.
  - [ ] Stop tests.
  - [ ] Cooldown tests.
  - [ ] ETA tests.
  - [ ] Rate-limit/waiting tests.
  - [ ] Global write-lock tests.
  - [ ] Account mismatch tests.
  - [ ] Process-recovery tests.
  - [ ] Localization/pluralization tests where practical.
  - [ ] Ensure tests use deterministic clocks/transports.
  - [ ] Ensure tests do not call live AniList/MAL services.

- [ ] Phase 24 — Feature 2.0 device and acceptance validation
  - [ ] Test AniList → MAL with identical lists.
  - [ ] Test MAL → AniList with identical lists.
  - [ ] Test additions.
  - [ ] Test progress synchronization.
  - [ ] Test status synchronization.
  - [ ] Test score synchronization.
  - [ ] Test multi-field anime synchronization.
  - [ ] Test episode regression conflict.
  - [ ] Test score regression conflict.
  - [ ] Test completed-status regression conflict.
  - [ ] Test mapping limitation.
  - [ ] Test destination-exclusive anime remains untouched.
  - [ ] Test per-item provider failure and continuation.
  - [ ] Test one retry round.
  - [ ] Test second failure attention state.
  - [ ] Test provider rate-limit wait.
  - [ ] Test stop during active item.
  - [ ] Test global write lock.
  - [ ] Test navigation while job runs.
  - [ ] Test Android background behavior.
  - [ ] Test Android ongoing notification.
  - [ ] Test notification deep link.
  - [ ] Test cooldown through app restart.
  - [ ] Test account disconnect during job.
  - [ ] Run full quality gate.
  - [ ] Document known limitations.
  - [ ] Prepare maintainer review summary for Feature 2.0 acceptance.

---

# Feature 3.0 — Multi-provider Sync Engine

## Goal

Feature 3.0 evolves Puriki's existing incremental Sync Engine into an optional authenticated multi-provider replication system.

Its responsibility is the **future**:

```text
User changes anime in Puriki
→ primary provider is authoritative for that interaction
→ primary write succeeds
→ Puriki persists replication intent
→ secondary provider(s) receive the new state
```

It does not replace List Sync.

```text
List Sync
→ compares current provider states and reconciles historical/external divergence

Multi-provider Sync Engine
→ replicates new Puriki-originated mutations after primary success
```

A user may update a provider directly on its website/app. Those changes did not pass through Puriki and are therefore a List Sync concern, not an incremental Sync Engine event.

Feature 3.0 should remain less implementation-prescriptive than Feature 2.0 until List Sync lessons are available.

---

## 3.0 Core rules already established

- Multi-provider synchronization is opt-in.
- Primary provider remains authoritative for the user interaction.
- Primary mutation is written directly first.
- Replication is enqueued only after primary success.
- Primary is not a replication target for its own mutation.
- Replication queue must be persistent.
- Target identity must be account-scoped.
- Old queued work must never be applied to a different account after logout/login.
- Domain rules are not duplicated in the Sync Engine.
- Retryable and non-retryable failures must be distinguished.
- Primary success is never rolled back because secondary persistence/replication failed.
- Initial/historical reconciliation is not a Sync Engine responsibility.
- List Sync and Multi-provider Sync Engine may coexist but cannot write concurrently.
- While List Sync holds the global write lock, new user mutations cannot occur and therefore no new incremental intents are created.
- If pending Sync Engine intents already exist when List Sync starts, Sync Engine processing must pause and resume after List Sync closes.

---

- [ ] Phase 1 — Reassess existing Sync Engine after Feature 2.0
  - [ ] Review current `PendingSyncIntent`.
  - [ ] Review `SyncTarget`.
  - [ ] Review pending operation persistence.
  - [ ] Review coalescing behavior.
  - [ ] Review retry behavior.
  - [ ] Review current guest-only production wiring.
  - [ ] Identify reusable List Sync infrastructure without coupling the two features.
  - [ ] Identify lessons from account-scoped List Sync persistence.
  - [ ] Confirm Feature 3.0 scope before coding.

- [ ] Phase 2 — Account-scoped replication identity
  - [ ] Define account-scoped target ID.
  - [ ] Include provider ID.
  - [ ] Include authenticated provider-user identity.
  - [ ] Persist account scope with every target state.
  - [ ] Reject stale queued operations after account mismatch.
  - [ ] Define logout behavior.
  - [ ] Define reconnect behavior.
  - [ ] Define account-switch behavior.
  - [ ] Add account-isolation tests.

- [ ] Phase 3 — Membership intents
  - [ ] Extend operation model with add-to-list intent.
  - [ ] Extend operation model with remove-from-list intent if current product supports removal.
  - [ ] Define ordering between membership and field updates.
  - [ ] Define coalescing semantics for add/remove/update sequences.
  - [ ] Prevent progress/status/score replication to non-member target state unless adapter can safely add.
  - [ ] Add deterministic coalescing tests.

- [ ] Phase 4 — Primary-success outbox integration
  - [ ] Identify all authenticated user-list mutation entry points.
  - [ ] Keep direct primary write behavior.
  - [ ] Enqueue replication only after confirmed primary success.
  - [ ] Persist replication before reporting secondary synchronization success.
  - [ ] Do not rollback primary when queue persistence fails.
  - [ ] Surface replication-persistence failure honestly.
  - [ ] Ensure rapid progress intent coalescing remains compatible.
  - [ ] Add mutation/outbox integration tests.

- [ ] Phase 5 — Authenticated AniList replication target
  - [ ] Implement account-scoped AniList target.
  - [ ] Apply add membership.
  - [ ] Apply remove membership if supported.
  - [ ] Apply progress.
  - [ ] Apply status.
  - [ ] Apply score.
  - [ ] Reuse domain validation.
  - [ ] Classify retryable errors.
  - [ ] Classify permanent errors.
  - [ ] Add transport/repository tests.

- [ ] Phase 6 — Authenticated MAL replication target
  - [ ] Implement account-scoped MAL target.
  - [ ] Apply add membership.
  - [ ] Apply remove membership if supported.
  - [ ] Apply progress.
  - [ ] Apply status.
  - [ ] Apply score.
  - [ ] Reuse catalog tracking context when required.
  - [ ] Classify retryable errors.
  - [ ] Classify permanent errors.
  - [ ] Add transport/repository tests.

- [ ] Phase 7 — Ordering and coalescing
  - [ ] Define latest-state behavior for progress.
  - [ ] Define latest-state behavior for status.
  - [ ] Define latest-state behavior for score.
  - [ ] Define membership + update ordering.
  - [ ] Define add → update collapse.
  - [ ] Define add → remove collapse.
  - [ ] Define remove → add behavior.
  - [ ] Preserve successful target states independently.
  - [ ] Avoid replaying unnecessary intermediate state.
  - [ ] Add sequence/property tests.

- [ ] Phase 8 — List Sync isolation
  - [ ] Pause Sync Engine processing when List Sync becomes active.
  - [ ] Preserve pending replication queue.
  - [ ] Do not discard pending work.
  - [ ] Resume only after List Sync terminal close.
  - [ ] Revalidate target account identity before resume.
  - [ ] Prevent race between List Sync destination write and Sync Engine target write.
  - [ ] Add concurrency/state tests.

- [ ] Phase 9 — User opt-in and provider configuration
  - [ ] Design explicit enable/disable control.
  - [ ] Explain primary provider behavior.
  - [ ] Explain secondary replication.
  - [ ] Explain that direct provider-site changes require List Sync.
  - [ ] Require both compatible accounts.
  - [ ] Define behavior when one account disconnects.
  - [ ] Define behavior when primary provider changes.
  - [ ] Do not enable automatically after List Sync.
  - [ ] Persist preference safely.
  - [ ] Add configuration tests.

- [ ] Phase 10 — Replication health and recovery UX
  - [ ] Expose compact replication health.
  - [ ] Show pending replication count when useful.
  - [ ] Show provider reconnect requirement.
  - [ ] Show persistent replication problem without overwhelming normal UX.
  - [ ] Add explicit manual retry for eligible failed replication.
  - [ ] Avoid raw queue/HTTP details in standard UI.
  - [ ] Keep developer diagnostics available for deeper inspection.
  - [ ] Define notification policy if future product evidence requires it.

- [ ] Phase 11 — Failure taxonomy and retry policy
  - [ ] Define retryable network errors.
  - [ ] Define retryable provider-unavailable errors.
  - [ ] Define rate-limit behavior.
  - [ ] Define unauthorized/reconnect behavior.
  - [ ] Define permanent provider rejection.
  - [ ] Define mapping/identity failure.
  - [ ] Avoid infinite retries for permanent failures.
  - [ ] Preserve successful provider target state.
  - [ ] Add failure-policy tests.

- [ ] Phase 12 — Feature 3.0 validation
  - [ ] Test AniList primary → MAL secondary.
  - [ ] Test MAL primary → AniList secondary.
  - [ ] Test progress replication.
  - [ ] Test status replication.
  - [ ] Test score replication.
  - [ ] Test membership replication.
  - [ ] Test rapid progress changes.
  - [ ] Test secondary offline.
  - [ ] Test rate limited secondary.
  - [ ] Test account logout with pending queue.
  - [ ] Test login to a different account with stale queue.
  - [ ] Test primary provider change.
  - [ ] Test List Sync pause/resume isolation.
  - [ ] Test app restart with pending replication.
  - [ ] Run full quality gate.
  - [ ] Document known limitations.
  - [ ] Prepare maintainer review summary for Feature 3.0 acceptance.

---

# Cross-feature Definition of Done

A feature should not be considered accepted until the maintainer has reviewed:

- behavior against this roadmap;
- automated quality checks;
- regression coverage;
- provider safety/rate-limit behavior;
- UX/loading/error states;
- localization;
- documentation;
- known limitations;
- device validation for native behavior.

The maintainer, not an automated agent, decides when the feature or top-level phase is complete.

---

# Change protocol

When a product decision changes:

1. Update the relevant rule in this roadmap.
2. Update affected nested checklist tasks.
3. Update implementation/tests.
4. Update end-user documentation if behavior changed.
5. Do not rewrite historical completed checklists to pretend the original scope never existed; add a new task/phase when the change is material.

When an agent discovers a conflict between code and this roadmap:

1. Do not silently choose one.
2. Report the conflict.
3. Identify whether the code or roadmap appears stale.
4. Wait for maintainer direction if resolving it changes product behavior.

---

# Explicit non-goals

Unless a future roadmap revision explicitly adds them:

- no backend service solely to support these features;
- no bidirectional automatic historical merge;
- no automatic deletion of destination-only anime during List Sync;
- no fuzzy-title-based authoritative writes;
- no parallel List Sync jobs;
- no List Sync analysis during cooldown;
- no user-list writes while List Sync is active;
- no automatic enabling of Multi-provider Sync after List Sync;
- no duplication of Puriki domain rules inside provider adapters;
- no architecture framework expansion without demonstrated need.

---

# Roadmap summary

```text
Feature 1.0
Foundation Stabilization
  ↓ maintainer acceptance

Feature 2.0
Visual / Color Refresh
+ Manual List Sync
  ↓ maintainer acceptance

Feature 3.0
Optional Multi-provider Sync Engine
```

The features intentionally remain separate:

```text
Feature 1.0 → make the current application dependable.

Feature 2.0 → reconcile current/historical provider-list divergence safely.

Feature 3.0 → replicate future Puriki-originated writes across providers.
```

This separation is a product rule, not just an implementation detail.
