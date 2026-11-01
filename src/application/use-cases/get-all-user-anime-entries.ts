import type { UserAnimeEntry } from '@/domain/models/anime';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';

const USER_LIST_PAGE_SIZE = 100;

export async function getAllUserAnimeEntries(
  repository: Pick<UserAnimeListRepository, 'getPage'>,
): Promise<UserAnimeEntry[]> {
  const entries: UserAnimeEntry[] = [];
  let page: number | null = 1;

  while (page !== null) {
    const result = await repository.getPage({
      page,
      pageSize: USER_LIST_PAGE_SIZE,
    });
    entries.push(...result.items);
    page = result.nextPage;
  }

  return entries;
}
