import type { AnimeAiringStatus } from '@/domain/models/anime';

const COMPLETION_BLOCKED_STATUSES: ReadonlySet<AnimeAiringStatus> = new Set([
  'releasing',
  'not_yet_released',
  'hiatus',
]);

export function canMarkAnimeCompleted(status: AnimeAiringStatus): boolean {
  return !COMPLETION_BLOCKED_STATUSES.has(status);
}
