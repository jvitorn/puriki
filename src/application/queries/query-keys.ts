import type { AnimeListStatus } from '@/domain/models/anime';

export const queryKeys = {
  featured: ['anime', 'featured'] as const,
  popular: ['anime', 'popular'] as const,
  seasonal: ['anime', 'seasonal'] as const,
  recent: ['anime', 'recent'] as const,
  search: (query: string) => ['anime', 'search', query] as const,
  details: (id: number) => ['anime', 'details', id] as const,
  userListRoot: ['user-list'] as const,
  userList: (status?: AnimeListStatus) =>
    ['user-list', status ?? 'all'] as const,
  unifiedListRoot: ['unified-list'] as const,
  unifiedList: (status?: AnimeListStatus) =>
    ['unified-list', status ?? 'all'] as const,
};
