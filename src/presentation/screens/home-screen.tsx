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
import { AnimeRail } from '@/presentation/components/anime/anime-rail';
import { FeaturedAnime } from '@/presentation/components/home/featured-anime';
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
  const isLoading = queries.some((query) => query.isLoading);
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

  if (featured.isError || !featured.data) {
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
        anime={featured.data}
        onOpen={() => open(featured.data.id)}
      />
      <AnimeRail
        title="Continue Watching"
        items={watching.data ?? []}
        onPressItem={(item) => open(item.anime.id)}
        emptyMessage={
          watching.isError
            ? 'This collection is temporarily unavailable.'
            : 'Start an anime to see it here.'
        }
      />
      <AnimeRail
        title="Popular Now"
        items={asUnified(popular.data)}
        onPressItem={(item) => open(item.anime.id)}
        emptyMessage={
          popular.isError
            ? 'This collection is temporarily unavailable.'
            : undefined
        }
      />
      <AnimeRail
        title="This Season"
        items={asUnified(seasonal.data)}
        onPressItem={(item) => open(item.anime.id)}
        emptyMessage={
          seasonal.isError
            ? 'This collection is temporarily unavailable.'
            : undefined
        }
      />
      <AnimeRail
        title="Upcoming"
        items={asUnified(upcoming.data)}
        onPressItem={(item) => open(item.anime.id)}
        emptyMessage={
          upcoming.isError
            ? 'This collection is temporarily unavailable.'
            : undefined
        }
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
