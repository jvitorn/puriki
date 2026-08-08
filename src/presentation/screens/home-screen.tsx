import { useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  useContinueWatching,
  useFeaturedAnime,
  usePopularAnime,
  useSeasonalAnime,
  useUpcomingAnime,
} from '@/application/queries/anime-queries';
import { getUserSafeErrorMessage } from '@/domain/errors/domain-error';
import type { AnimeCatalogItem, UnifiedAnime } from '@/domain/models/anime';
import { FeaturedAnime } from '@/presentation/components/home/featured-anime';
import { HomeAnimeRail } from '@/presentation/components/home/home-anime-rail';
import { ErrorState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { Text } from '@/presentation/components/ui/text';

function asUnified(items: AnimeCatalogItem[] | undefined): UnifiedAnime[] {
  return items?.map((anime) => ({ anime })) ?? [];
}

function HomeBrand() {
  return (
    <View className="min-h-20 justify-center py-3">
      <Text variant="title" className="tracking-[3px] text-primary">
        PURIKUKI
      </Text>
      <Text variant="caption" muted>
        Your anime, your pace.
      </Text>
    </View>
  );
}

function HomeSkeleton() {
  return (
    <Screen scroll>
      <HomeBrand />
      <Skeleton className="h-[390px] w-full rounded-2xl md:h-[460px]" />
      <View className="mt-7 gap-4">
        <Skeleton className="h-6 w-2/5" />
        <View className="flex-row gap-4 overflow-hidden">
          {Array.from({ length: 3 }, (_, index) => (
            <View key={index} className="w-36 gap-2">
              <Skeleton className="aspect-[2/3] w-full rounded-xl" />
              <Skeleton className="h-4 w-4/5" />
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const featured = useFeaturedAnime();
  const watching = useContinueWatching();
  const popular = usePopularAnime();
  const seasonal = useSeasonalAnime();
  const upcoming = useUpcomingAnime();
  const queries = [featured, watching, popular, seasonal, upcoming];
  const displayedFeatured =
    featured.data ??
    popular.data?.[0] ??
    seasonal.data?.[0] ??
    upcoming.data?.[0] ??
    watching.data?.[0]?.anime;
  const catalogQueries = [featured, popular, seasonal, upcoming];
  const isLoading =
    !displayedFeatured && catalogQueries.some((query) => query.isLoading);
  const open = (id: number) =>
    router.push({ pathname: '/anime/[id]', params: { id: String(id) } });

  if (isLoading) return <HomeSkeleton />;

  if (!displayedFeatured) {
    return (
      <Screen>
        <HomeBrand />
        <ErrorState
          message={getUserSafeErrorMessage(
            queries.find((query) => query.isError)?.error,
          )}
          onRetry={() =>
            void Promise.all(queries.map((query) => query.refetch()))
          }
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <HomeBrand />
      <FeaturedAnime
        anime={displayedFeatured}
        onOpen={() => open(displayedFeatured.id)}
      />
      <HomeAnimeRail
        title="Continue Watching"
        items={watching.data}
        isLoading={watching.isLoading}
        isError={watching.isError}
        error={watching.error}
        onPressItem={(item) => open(item.anime.id)}
        onRetry={() => void watching.refetch()}
        emptyMessage="Start an anime to see it here."
      />
      <HomeAnimeRail
        title="Popular Now"
        items={asUnified(popular.data)}
        isLoading={popular.isLoading}
        isError={popular.isError}
        error={popular.error}
        onPressItem={(item) => open(item.anime.id)}
        onRetry={() => void popular.refetch()}
      />
      <HomeAnimeRail
        title="This Season"
        items={asUnified(seasonal.data)}
        isLoading={seasonal.isLoading}
        isError={seasonal.isError}
        error={seasonal.error}
        onPressItem={(item) => open(item.anime.id)}
        onRetry={() => void seasonal.refetch()}
      />
      <HomeAnimeRail
        title="Upcoming"
        items={asUnified(upcoming.data)}
        isLoading={upcoming.isLoading}
        isError={upcoming.isError}
        error={upcoming.error}
        onPressItem={(item) => open(item.anime.id)}
        onRetry={() => void upcoming.refetch()}
      />
    </Screen>
  );
}
