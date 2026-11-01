import { getAllUserAnimeEntries } from '@/application/use-cases/get-all-user-anime-entries';
import type { UnifiedAnime } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { selectPersonalizedPopularAnime } from '@/domain/rules/anime-discovery';

interface PersonalizedPopularDependencies {
  catalogRepository: Pick<AnimeCatalogRepository, 'getPopular'>;
  userListRepository: Pick<UserAnimeListRepository, 'getPage'>;
}

export async function getPersonalizedPopularAnime({
  catalogRepository,
  userListRepository,
}: PersonalizedPopularDependencies): Promise<UnifiedAnime[]> {
  const [popular, userEntries] = await Promise.all([
    catalogRepository.getPopular(),
    getAllUserAnimeEntries(userListRepository),
  ]);
  return selectPersonalizedPopularAnime(popular, userEntries);
}
