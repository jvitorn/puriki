import { getAllUserAnimeEntries } from '@/application/use-cases/get-all-user-anime-entries';
import { CatalogUnavailableError } from '@/domain/errors/catalog-error';
import type { AnimeCatalogItem, UnifiedAnime } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import {
  buildRecommendationSeeds,
  selectRecommendationSeedEntries,
} from '@/domain/rules/anime-recommendations';

export interface FeaturedAnimeSelection extends UnifiedAnime {
  personalized: boolean;
}

interface RecommendedFeaturedDependencies {
  catalogRepository: Pick<
    AnimeCatalogRepository,
    'getFeatured' | 'getManyByIds' | 'getRecommendations'
  >;
  userListRepository: Pick<UserAnimeListRepository, 'getPage'>;
}

function unifySeeds(
  catalog: readonly AnimeCatalogItem[],
  entries: ReturnType<typeof selectRecommendationSeedEntries>,
): UnifiedAnime[] {
  const animeById = new Map(catalog.map((anime) => [anime.id, anime]));
  return entries.flatMap((userEntry) => {
    const anime = animeById.get(userEntry.animeId);
    return anime ? [{ anime, userEntry }] : [];
  });
}

export async function getRecommendedFeaturedAnime({
  catalogRepository,
  userListRepository,
}: RecommendedFeaturedDependencies): Promise<FeaturedAnimeSelection> {
  const userEntries = await getAllUserAnimeEntries(userListRepository);
  const seedEntries = selectRecommendationSeedEntries(userEntries);
  if (seedEntries.length === 0) {
    return {
      anime: await catalogRepository.getFeatured(),
      personalized: false,
    };
  }

  try {
    const seedCatalog = await catalogRepository.getManyByIds(
      seedEntries.map((entry) => entry.animeId),
    );
    const seeds = buildRecommendationSeeds(
      unifySeeds(seedCatalog, seedEntries),
    );
    if (seeds.length === 0) {
      return {
        anime: await catalogRepository.getFeatured(),
        personalized: false,
      };
    }
    const recommendations = await catalogRepository.getRecommendations(
      seeds,
      20,
    );
    const existingIds = new Set(userEntries.map((entry) => entry.animeId));
    const anime = recommendations.find(
      (candidate) => !existingIds.has(candidate.id),
    );
    if (anime) return { anime, personalized: true };
  } catch (error: unknown) {
    if (!(error instanceof CatalogUnavailableError)) throw error;
  }

  return {
    anime: await catalogRepository.getFeatured(),
    personalized: false,
  };
}
