import type { AnimeListStatus } from '@/domain/models/anime';

export const queryKeys = {
  detailsRoot: ['anime', 'details'] as const,
  featured: ['anime', 'featured'] as const,
  popular: ['anime', 'popular'] as const,
  seasonal: ['anime', 'seasonal'] as const,
  upcoming: ['anime', 'upcoming'] as const,
  search: (query: string) => ['anime', 'search', query] as const,
  details: (id: number) => ['anime', 'details', id] as const,
  userListRoot: ['user-list'] as const,
  infiniteUserList: (status?: AnimeListStatus) =>
    ['user-list', 'infinite', status ?? 'all'] as const,
  continueWatching: ['user-list', 'continue-watching'] as const,
};
