import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  useContinueWatching,
  useFeaturedAnime,
  usePopularAnime,
  useUpcomingAnime,
  useSeasonalAnime,
} from '@/application/queries/anime-queries';
import { getUserSafeErrorMessage } from '@/domain/errors/domain-error';
import type { AnimeCatalogItem, UnifiedAnime } from '@/domain/models/anime';
import { FeaturedAnime } from '@/presentation/components/home/featured-anime';
import { HomeAnimeRail } from '@/presentation/components/home/home-anime-rail';
import { AppText } from '@/presentation/components/ui/app-text';
import { ErrorState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { colors, spacing } from '@/presentation/theme/tokens';

function asUnified(items: AnimeCatalogItem[] | undefined): UnifiedAnime[] {
  return items?.map((anime) => ({ anime })) ?? [];
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

  if (isLoading) {
    return (
      <Screen scroll>
        <View style={styles.brand}>
          <AppText variant="title">PURIKUKI</AppText>
          <AppText variant="caption" muted>
            Your anime, your pace.
          </AppText>
        </View>
        <Skeleton height={390} />
        <View style={styles.skeletons}>
          <Skeleton height={24} width="45%" />
          <Skeleton height={204} />
          <Skeleton height={24} width="38%" />
          <Skeleton height={204} />
        </View>
      </Screen>
    );
  }

  if (!displayedFeatured) {
    return (
      <Screen>
        <View style={styles.brand}>
          <AppText variant="title">PURIKUKI</AppText>
        </View>
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
      <View style={styles.brand}>
        <View>
          <AppText variant="title">PURIKUKI</AppText>
          <AppText variant="caption" muted>
            Your anime, your pace.
          </AppText>
        </View>
        <View style={styles.phase}>
          <AppText variant="caption">PHASE 2A</AppText>
        </View>
      </View>
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

const styles = StyleSheet.create({
  brand: {
    minHeight: 70,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  phase: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
  },
  skeletons: { gap: spacing.md, marginTop: spacing.lg },
});
