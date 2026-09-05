import type {
  AnimeAiringStatus,
  AnimeTrackingContext,
} from '@/domain/models/anime';
import {
  applyProgress,
  canDecrementProgress,
  canIncrementProgress,
  decrementProgress,
  incrementProgress,
  normalizeProgress,
} from '@/domain/rules/anime-progress';
import { validateUserScore } from '@/domain/rules/anime-score';
import {
  getAllowedStatusTransitions,
  transitionStatus,
} from '@/domain/rules/anime-status';
import { makeUserAnimeEntry } from '@/tests/builders/anime-builder';

function context(
  totalEpisodes: number | null,
  airingStatus: AnimeAiringStatus = 'finished',
): AnimeTrackingContext {
  return { totalEpisodes, airingStatus };
}

describe('anime progress rules', () => {
  it('normalizes negative, fractional, and excessive progress', () => {
    expect(normalizeProgress(-3, 12)).toBe(0);
    expect(normalizeProgress(4.9, 12)).toBe(4);
    expect(normalizeProgress(99, 12)).toBe(12);
  });

  it('supports unknown episode totals and progress controls', () => {
    expect(normalizeProgress(900, null)).toBe(900);
    expect(canIncrementProgress(900, null)).toBe(true);
    expect(incrementProgress(900, null)).toBe(901);
  });

  it('increments and decrements only when valid', () => {
    expect(canIncrementProgress(11, 12)).toBe(true);
    expect(canIncrementProgress(12, 12)).toBe(false);
    expect(incrementProgress(12, 12)).toBe(12);
    expect(canDecrementProgress(0)).toBe(false);
    expect(decrementProgress(0)).toBe(0);
    expect(decrementProgress(3)).toBe(2);
  });

  it('automatically completes a known final episode only when allowed', () => {
    const entry = makeUserAnimeEntry({
      animeId: 1,
      status: 'watching',
      watchedEpisodes: 11,
    });
    expect(applyProgress(entry, 12, context(12)).status).toBe('completed');
    for (const airingStatus of [
      'releasing',
      'not_yet_released',
      'hiatus',
    ] as const) {
      expect(applyProgress(entry, 12, context(12, airingStatus))).toMatchObject(
        { watchedEpisodes: 12, status: 'watching' },
      );
    }
  });

  it('moves progressed planned and completed entries to watching', () => {
    const planned = makeUserAnimeEntry({
      animeId: 1,
      status: 'plan_to_watch',
      watchedEpisodes: 0,
    });
    const completed = makeUserAnimeEntry({
      animeId: 2,
      status: 'completed',
      watchedEpisodes: 12,
    });
    expect(applyProgress(planned, 1, context(12)).status).toBe('watching');
    expect(applyProgress(completed, 4, context(12)).status).toBe('watching');
  });
});

describe('anime status and score rules', () => {
  const started = makeUserAnimeEntry({
    animeId: 1,
    status: 'watching',
    watchedEpisodes: 3,
  });

  it.each(['watching', 'on_hold', 'dropped'] as const)(
    'blocks %s with progress from returning to plan to watch',
    (status) => {
      const result = transitionStatus(
        { ...started, status },
        'plan_to_watch',
        context(12),
      );
      expect(result).toMatchObject({
        allowed: false,
        reason: 'already_started',
        entry: { status, watchedEpisodes: 3 },
      });
    },
  );

  it('allows plan to watch before progress starts', () => {
    const result = transitionStatus(
      { ...started, watchedEpisodes: 0 },
      'plan_to_watch',
      context(12),
    );
    expect(result).toMatchObject({
      allowed: true,
      entry: { status: 'plan_to_watch', watchedEpisodes: 0 },
    });
  });

  it('does not start tracking an anime that has not premiered', () => {
    const result = transitionStatus(
      { ...started, status: 'plan_to_watch', watchedEpisodes: 0 },
      'watching',
      context(7, 'not_yet_released'),
    );
    expect(result).toMatchObject({
      allowed: false,
      reason: 'not_yet_released',
      entry: { status: 'plan_to_watch', watchedEpisodes: 0 },
    });
  });

  it('does not start tracking from progress before an anime premieres', () => {
    const result = applyProgress(
      { ...started, status: 'plan_to_watch', watchedEpisodes: 0 },
      1,
      context(7, 'not_yet_released'),
    );
    expect(result).toMatchObject({
      status: 'plan_to_watch',
      watchedEpisodes: 0,
    });
  });

  it.each(['releasing', 'not_yet_released', 'hiatus'] as const)(
    'blocks completed while airing status is %s',
    (airingStatus) => {
      expect(
        transitionStatus(started, 'completed', context(12, airingStatus)),
      ).toMatchObject({ allowed: false, reason: 'airing_in_progress' });
    },
  );

  it.each(['finished', 'cancelled', 'unknown'] as const)(
    'allows completed while airing status is %s and fills known progress',
    (airingStatus) => {
      expect(
        transitionStatus(started, 'completed', context(12, airingStatus)),
      ).toMatchObject({
        allowed: true,
        entry: { status: 'completed', watchedEpisodes: 12 },
      });
    },
  );

  it('preserves progress when completed has an unknown total', () => {
    expect(transitionStatus(started, 'completed', context(null))).toMatchObject(
      {
        allowed: true,
        entry: { status: 'completed', watchedEpisodes: 3 },
      },
    );
  });

  it('treats the selected status as an allowed no-op', () => {
    expect(
      transitionStatus(
        { ...started, status: 'completed' },
        'completed',
        context(12, 'releasing'),
      ),
    ).toMatchObject({ allowed: true, entry: { status: 'completed' } });
  });

  it('returns availability for every status', () => {
    const transitions = getAllowedStatusTransitions(started, context(12));
    expect(Object.keys(transitions)).toHaveLength(5);
    expect(transitions.plan_to_watch.allowed).toBe(false);
    expect(transitions.completed.allowed).toBe(true);
  });

  it('accepts null and scores from one to ten', () => {
    expect(validateUserScore(null)).toBeNull();
    expect(validateUserScore(1)).toBe(1);
    expect(validateUserScore(10)).toBe(10);
  });

  it('rejects invalid scores', () => {
    expect(() => validateUserScore(0)).toThrow('between 1 and 10');
    expect(() => validateUserScore(11)).toThrow('between 1 and 10');
    expect(() => validateUserScore(3.5)).toThrow('between 1 and 10');
  });
});
