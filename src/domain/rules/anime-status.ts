import type {
  AnimeListStatus,
  AnimeTrackingContext,
  UserAnimeEntry,
} from '@/domain/models/anime';
import { canMarkAnimeCompleted } from '@/domain/rules/anime-airing-status';
import { normalizeProgress } from '@/domain/rules/anime-progress';

export type StatusTransitionBlockedReason =
  'already_started' | 'airing_in_progress';

export type StatusTransitionResult =
  | { allowed: true; entry: UserAnimeEntry; reason: null }
  | {
      allowed: false;
      entry: UserAnimeEntry;
      reason: StatusTransitionBlockedReason;
    };

export function transitionStatus(
  entry: UserAnimeEntry,
  status: AnimeListStatus,
  context: AnimeTrackingContext,
): StatusTransitionResult {
  if (status === entry.status) {
    return { allowed: true, entry: { ...entry }, reason: null };
  }
  if (status === 'plan_to_watch' && entry.watchedEpisodes > 0) {
    return { allowed: false, entry: { ...entry }, reason: 'already_started' };
  }
  if (status === 'completed' && !canMarkAnimeCompleted(context.airingStatus)) {
    return {
      allowed: false,
      entry: { ...entry },
      reason: 'airing_in_progress',
    };
  }

  const watchedEpisodes = normalizeProgress(
    entry.watchedEpisodes,
    context.totalEpisodes,
  );
  if (status === 'completed' && context.totalEpisodes !== null) {
    return {
      allowed: true,
      entry: { ...entry, status, watchedEpisodes: context.totalEpisodes },
      reason: null,
    };
  }

  return {
    allowed: true,
    entry: { ...entry, status, watchedEpisodes },
    reason: null,
  };
}

export function getAllowedStatusTransitions(
  entry: UserAnimeEntry,
  context: AnimeTrackingContext,
): Record<AnimeListStatus, StatusTransitionResult> {
  return {
    watching: transitionStatus(entry, 'watching', context),
    completed: transitionStatus(entry, 'completed', context),
    on_hold: transitionStatus(entry, 'on_hold', context),
    dropped: transitionStatus(entry, 'dropped', context),
    plan_to_watch: transitionStatus(entry, 'plan_to_watch', context),
  };
}
