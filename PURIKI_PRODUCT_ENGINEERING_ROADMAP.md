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

- [ ] Phase 1 — Architecture and dependency review
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

- [ ] Phase 2 — Authentication and account-provider validation
  - [ ] Validate AniList authentication flow end-to-end.
  - [ ] Validate MAL authentication flow end-to-end.
  - [ ] Validate reconnect-required behavior.
  - [ ] Validate expired/invalid credential handling.
  - [ ] Validate temporary provider/network failure does not incorrectly destroy valid credentials.
  - [ ] Validate logout behavior.
  - [ ] Validate provider switching when both accounts are connected.
  - [ ] Validate primary list provider selection persistence.
  - [ ] Validate account identity/state after app restart.
  - [ ] Validate disconnected-account states in presentation.
  - [ ] Ensure tokens never appear in logs, AsyncStorage, diagnostics, React Query cache, or UI.
  - [ ] Add missing automated tests for authentication/session state transitions.

- [ ] Phase 3 — User list correctness
  - [ ] Validate list loading for AniList.
  - [ ] Validate list loading for MAL.
  - [ ] Validate guest-list behavior.
  - [ ] Validate add-to-list behavior.
  - [ ] Validate remove-from-list behavior where supported by the current app.
  - [ ] Validate progress updates.
  - [ ] Validate status updates.
  - [ ] Validate score updates.
  - [ ] Validate rapid multi-tap episode progress behavior.
  - [ ] Validate failure rollback/reconciliation behavior for progress.
  - [ ] Validate `Plan to Watch` restrictions after progress has started.
  - [ ] Validate `Completed` restrictions for currently airing anime.
  - [ ] Validate completion auto-progress behavior when total episodes are known.
  - [ ] Validate status/progress behavior when episode total is unknown.
  - [ ] Validate MAL uses real catalog tracking context for domain decisions.
  - [ ] Add tests for uncovered cross-provider rule parity.

- [ ] Phase 4 — Catalog and provider resilience review
  - [ ] Validate AniList catalog primary behavior.
  - [ ] Validate MAL public fallback behavior.
  - [ ] Validate operation-family circuit breakers.
  - [ ] Validate provider-wide rate-limit gate behavior.
  - [ ] Validate cache fallback behavior.
  - [ ] Validate cold-start request coalescing.
  - [ ] Validate search request coalescing.
  - [ ] Validate malformed provider response handling.
  - [ ] Validate timeout/network/5xx error classification.
  - [ ] Verify HTTP 429 does not incorrectly open unrelated circuits.
  - [ ] Review retry policies to prevent ambiguous duplicate writes.
  - [ ] Check request concurrency limits against provider safety goals.
  - [ ] Add missing resilience tests.

- [ ] Phase 5 — Loading, empty, error, retry, and offline UX
  - [ ] Audit every major screen for initial loading.
  - [ ] Audit every major screen for refresh loading.
  - [ ] Audit every major screen for empty state.
  - [ ] Audit every major screen for provider error state.
  - [ ] Audit every major screen for retry state.
  - [ ] Audit account reconnect-required states.
  - [ ] Audit slow-network behavior.
  - [ ] Avoid blank content flashes during background refetches.
  - [ ] Avoid blocking the entire screen for mutations that can remain local-first.
  - [ ] Ensure error messages are actionable without exposing provider internals.
  - [ ] Ensure rate-limit states use human language instead of raw HTTP messages.
  - [ ] Standardize loading indicators/skeletons where visually appropriate.
  - [ ] Review disabled-state feedback for buttons and controls.

- [ ] Phase 6 — UI and UX refinement
  - [ ] Review Home visual hierarchy.
  - [ ] Review Search interaction and result states.
  - [ ] Review Anime Details interaction density.
  - [ ] Review My List readability and list actions.
  - [ ] Review Settings information architecture.
  - [ ] Review account/provider selection UX.
  - [ ] Review onboarding completion and first-use flow.
  - [ ] Check touch targets.
  - [ ] Check spacing consistency.
  - [ ] Check typography hierarchy.
  - [ ] Check icon consistency.
  - [ ] Check modal/sheet consistency.
  - [ ] Check animation/loading transitions for jank.
  - [ ] Check small-device layouts.
  - [ ] Check large-device layouts.
  - [ ] Review dark-mode contrast.
  - [ ] Remove visual states that imply unavailable functionality.

- [ ] Phase 7 — Accessibility and localization
  - [ ] Audit accessibility labels on interactive controls.
  - [ ] Audit focus behavior where relevant.
  - [ ] Audit screen-reader descriptions for progress/status controls.
  - [ ] Audit contrast of semantic colors.
  - [ ] Audit dynamic text wrapping.
  - [ ] Audit English strings.
  - [ ] Audit Brazilian Portuguese strings.
  - [ ] Audit Spanish strings.
  - [ ] Confirm pluralization does not rely on English word order.
  - [ ] Remove hardcoded presentation strings that should be localized.
  - [ ] Ensure provider names remain proper nouns and are not incorrectly translated.

- [ ] Phase 8 — Synopsis translation hardening
  - [ ] Re-run Android translation success flow.
  - [ ] Re-run first-model-download flow.
  - [ ] Re-run corrupted/invalid model recovery flow.
  - [ ] Validate fallback to original synopsis after translation failure.
  - [ ] Validate translation cache behavior.
  - [ ] Validate language switching behavior.
  - [ ] Ensure model deletion/re-download logic remains isolated in native infrastructure.
  - [ ] Validate attribution rendering.
  - [ ] Validate non-Android behavior remains graceful.

- [ ] Phase 9 — Performance and resource review
  - [ ] Measure Home cold-start request count.
  - [ ] Measure Search request behavior during typing.
  - [ ] Measure My List initial load.
  - [ ] Measure Anime Details load behavior.
  - [ ] Identify unnecessary list re-renders.
  - [ ] Identify duplicate catalog hydration.
  - [ ] Validate React Query cache keys and invalidation.
  - [ ] Review expensive selectors/computations in presentation.
  - [ ] Check unnecessary image reloads.
  - [ ] Check memory growth during long browsing sessions.
  - [ ] Confirm request preservation/rate-limit behavior remains a design priority.

- [ ] Phase 10 — Automated test gap analysis
  - [ ] Inventory current unit tests.
  - [ ] Inventory repository integration-style tests.
  - [ ] Inventory hook/controller tests.
  - [ ] Identify critical production paths with no regression coverage.
  - [ ] Add missing tests for provider parity.
  - [ ] Add missing tests for domain rule boundaries.
  - [ ] Add missing tests for account-provider selection.
  - [ ] Add missing tests for malformed provider data.
  - [ ] Add missing tests for mutation failure paths.
  - [ ] Remove redundant tests that duplicate assertions without increasing confidence.
  - [ ] Keep tests deterministic and independent of live provider APIs.

- [ ] Phase 11 — Documentation cleanup
  - [ ] Update README to reflect current MAL OAuth support.
  - [ ] Update README to reflect authenticated MAL user-list support.
  - [ ] Update README Sync Engine section to mention both authenticated providers write directly today.
  - [ ] Update guest-list documentation if current behavior differs.
  - [ ] Update current limitations.
  - [ ] Update provider/auth setup instructions.
  - [ ] Review architecture documentation.
  - [ ] Ensure this roadmap is linked from the main README.
  - [ ] Remove stale project naming/description references where appropriate.
  - [ ] Ensure documentation clearly separates implemented vs planned features.

- [ ] Phase 12 — Device validation and Feature 1.0 release candidate
  - [ ] Run clean install on Android Development Build.
  - [ ] Validate onboarding.
  - [ ] Validate AniList-only account state.
  - [ ] Validate MAL-only account state.
  - [ ] Validate both providers connected.
  - [ ] Validate no providers connected.
  - [ ] Validate primary-provider switching.
  - [ ] Validate list reads/writes on AniList.
  - [ ] Validate list reads/writes on MAL.
  - [ ] Validate synopsis translation.
  - [ ] Validate app restart with persisted sessions/settings.
  - [ ] Run the complete automated quality gate.
  - [ ] Record remaining known limitations.
  - [ ] Fix release-blocking defects.
  - [ ] Prepare a maintainer review summary for Feature 1.0 acceptance.

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
