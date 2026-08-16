import type { AnimeListStatus } from '@/domain/models/anime';

export const queryKeys = {
  catalogRoot: ['anime'] as const,
  detailsRoot: ['anime', 'details'] as const,
  featured: ['anime', 'featured'] as const,
  popular: ['anime', 'popular'] as const,
  seasonal: ['anime', 'seasonal'] as const,
  upcoming: ['anime', 'upcoming'] as const,
  search: (query: string) => ['anime', 'search', query] as const,
  details: (scope: string, id: number) =>
    ['anime', 'details', scope, id] as const,
  userListRoot: ['user-list'] as const,
  userListScope: (scope: string) => ['user-list', scope] as const,
  infiniteUserList: (scope: string, status?: AnimeListStatus) =>
    ['user-list', scope, 'infinite', status ?? 'all'] as const,
  continueWatching: (scope: string) =>
    ['user-list', scope, 'continue-watching'] as const,
};
