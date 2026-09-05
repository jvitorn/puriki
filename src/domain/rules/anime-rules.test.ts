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
import {
  getKnownEpisodeCount,
  getTrackableEpisodeLimit,
} from '@/domain/rules/anime-tracking';
import { makeUserAnimeEntry } from '@/tests/builders/anime-builder';

function context(
  totalEpisodes: number | null,
  airingStatus: AnimeAiringStatus = 'finished',
  releasedEpisodes: number | null = totalEpisodes,
): AnimeTrackingContext {
  return { totalEpisodes, releasedEpisodes, airingStatus };
}

describe('anime tracking context', () => {
  it.each([
    ['finished', 12, 12, 12],
    ['releasing', 12, 4, 4],
    ['releasing', null, 4, 4],
    ['not_yet_released', 12, null, 0],
    ['hiatus', 24, 8, 8],
    ['cancelled', 24, 8, 8],
    ['cancelled', 24, null, null],
    ['unknown', 12, 4, 4],
    ['unknown', 12, null, 12],
    ['unknown', null, null, null],
  ] as const)(
    '%s with total %s and released %s has trackable limit %s',
    (airingStatus, totalEpisodes, releasedEpisodes, expected) => {
      expect(
        getTrackableEpisodeLimit(
          context(totalEpisodes, airingStatus, releasedEpisodes),
        ),
      ).toBe(expected);
    },
  );

  it('keeps catalog count separate and prefers the real total for copy', () => {
    const tracking = context(12, 'releasing', 4);
    expect(getTrackableEpisodeLimit(tracking)).toBe(4);
    expect(getKnownEpisodeCount(tracking)).toBe(12);
  });
});

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
    expect(applyProgress(entry, 12, context(12, 'releasing', 4))).toMatchObject(
      { watchedEpisodes: 4, status: 'watching' },
    );
    expect(applyProgress(entry, 12, context(12, 'hiatus', 8))).toMatchObject({
      watchedEpisodes: 8,
      status: 'watching',
    });
    expect(
      applyProgress(entry, 12, context(12, 'not_yet_released', null)),
    ).toMatchObject({ watchedEpisodes: 0, status: 'watching' });
  });

  it('clamps releasing progress to episodes known to be released', () => {
    const entry = makeUserAnimeEntry({
      animeId: 1,
      status: 'watching',
      watchedEpisodes: 4,
    });
    expect(applyProgress(entry, 12, context(12, 'releasing', 4))).toMatchObject(
      {
        watchedEpisodes: 4,
        status: 'watching',
      },
    );
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

  it('does not fill a cancelled title to its unreleased planned total', () => {
    expect(
      transitionStatus(started, 'completed', context(24, 'cancelled', 8)),
    ).toMatchObject({
      allowed: true,
      entry: { status: 'completed', watchedEpisodes: 8 },
    });
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
