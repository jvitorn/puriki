import {
  applyProgress,
  canDecrementProgress,
  canIncrementProgress,
  decrementProgress,
  incrementProgress,
  normalizeProgress,
} from '@/domain/rules/anime-progress';
import { validateUserScore } from '@/domain/rules/anime-score';
import { transitionStatus } from '@/domain/rules/anime-status';
import { makeUserAnimeEntry } from '@/tests/builders/anime-builder';

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

  it('automatically completes a known final episode', () => {
    const entry = makeUserAnimeEntry({
      animeId: 1,
      status: 'watching',
      watchedEpisodes: 11,
    });
    expect(applyProgress(entry, 12, 12).status).toBe('completed');
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
    expect(applyProgress(planned, 1, 12).status).toBe('watching');
    expect(applyProgress(completed, 4, 12).status).toBe('watching');
  });
});

describe('anime status and score rules', () => {
  const entry = makeUserAnimeEntry({
    animeId: 1,
    status: 'completed',
    watchedEpisodes: 12,
  });

  it('resets progress when moved to plan to watch', () => {
    expect(transitionStatus(entry, 'plan_to_watch', 12).watchedEpisodes).toBe(
      0,
    );
  });

  it('preserves valid progress when returning to watching', () => {
    expect(transitionStatus(entry, 'watching', 24).watchedEpisodes).toBe(12);
  });

  it('fills known progress when explicitly completed', () => {
    expect(
      transitionStatus({ ...entry, watchedEpisodes: 3 }, 'completed', 12)
        .watchedEpisodes,
    ).toBe(12);
    expect(transitionStatus(entry, 'completed', null).watchedEpisodes).toBe(12);
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
