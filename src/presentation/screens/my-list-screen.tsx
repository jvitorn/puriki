import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';

import { useInfiniteUnifiedUserList } from '@/application/queries/anime-queries';
import { flattenUniqueAnimePages } from '@/application/use-cases/infinite-user-list';
import { getUserSafeErrorMessage } from '@/domain/errors/domain-error';
import type { AnimeListStatus } from '@/domain/models/anime';
import { AnimeListItem } from '@/presentation/components/anime/anime-list-item';
import { Button } from '@/presentation/components/ui/button';
import { EmptyState, ErrorState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { Text } from '@/presentation/components/ui/text';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/presentation/components/ui/toggle-group';
import { formatUserListCount } from '@/presentation/utils/user-list-count';
import { ANIME_STATUSES, STATUS_LABELS } from '@/shared/constants/anime-status';
import { cn } from '@/shared/rnr/utils';

type ListFilter = AnimeListStatus | 'all';

function AnimeListSkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <View className="gap-2">
      {Array.from({ length: count }, (_, index) => (
        <View key={index} className="flex-row gap-3 rounded-xl bg-card p-2">
          <Skeleton className="h-[104px] w-[72px] rounded-xl" />
          <View className="flex-1 gap-3 py-2">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-2/5 rounded-full" />
            <Skeleton className="h-2 w-full" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function MyListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<ListFilter>('all');
  const list = useInfiniteUnifiedUserList(
    filter === 'all' ? undefined : filter,
  );
  const filters: ListFilter[] = ['all', ...ANIME_STATUSES];
  const filterLabel = filter === 'all' ? 'All' : STATUS_LABELS[filter];
  const items = flattenUniqueAnimePages(list.data?.pages);
  const totalCount = list.data?.pages[0]?.totalCount;
  const countLabel = formatUserListCount({
    filterLabel,
    hasNextPage: list.hasNextPage,
    loadedCount: items.length,
    totalCount,
  });
  const loadNextPage = () => {
    if (!list.hasNextPage || list.isFetching) return;
    void list.fetchNextPage({ cancelRefetch: false });
  };

  const listFooter = list.isFetchingNextPage ? (
    <View className="gap-2 px-4 pb-24 pt-2 md:px-6">
      <AnimeListSkeletonRows count={2} />
    </View>
  ) : list.isFetchNextPageError ? (
    <View
      accessibilityRole="alert"
      className="mx-4 mb-24 mt-2 items-center gap-3 rounded-xl bg-card p-4 md:mx-6"
    >
      <Text muted>Couldn&apos;t load more anime.</Text>
      <Button
        accessibilityLabel="Retry loading more anime"
        size="sm"
        variant="outline"
        onPress={loadNextPage}
      >
        <Text>Retry</Text>
      </Button>
    </View>
  ) : (
    <View className="h-24" />
  );

  return (
    <Screen padded={false}>
      <View className="gap-1 px-4 pt-2 md:px-6">
        <Text variant="title">My List</Text>
        <Text variant="caption" muted>
          {countLabel}
        </Text>
      </View>

      <ScrollView
        horizontal
        accessibilityLabel="List filters"
        contentContainerClassName="px-4 py-4 md:px-6"
        showsHorizontalScrollIndicator={false}
      >
        <ToggleGroup
          className="gap-2"
          type="single"
          value={filter}
          variant="outline"
          onValueChange={(next) => {
            if (next) setFilter(next as ListFilter);
          }}
        >
          {filters.map((value) => {
            const selected = value === filter;
            const label = value === 'all' ? 'All' : STATUS_LABELS[value];
            return (
              <ToggleGroupItem
                key={value}
                accessibilityLabel={`Filter by ${label}`}
                accessibilityState={{ selected }}
                className={cn(
                  'min-h-11 rounded-full border px-4',
                  selected && 'border-primary bg-primary',
                )}
                value={value}
              >
                <Text>{label}</Text>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </ScrollView>

      {list.isLoading ? (
        <View className="gap-2 px-4 md:px-6">
          <AnimeListSkeletonRows />
        </View>
      ) : list.isError && !list.data ? (
        <ErrorState
          message={getUserSafeErrorMessage(list.error)}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <FlatList
          testID="my-list"
          data={items}
          initialNumToRender={8}
          keyExtractor={(item) => String(item.anime.id)}
          maxToRenderPerBatch={8}
          renderItem={({ item }) => (
            <View className="px-4 md:px-6">
              <AnimeListItem
                item={item}
                onPress={() =>
                  router.push({
                    pathname: '/anime/[id]',
                    params: { id: String(item.anime.id) },
                  })
                }
              />
            </View>
          )}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListEmptyComponent={
            <EmptyState
              title={`No ${filterLabel.toLowerCase()} anime`}
              message="Anime in this category will appear here."
            />
          }
          ListFooterComponent={listFooter}
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.5}
          onRefresh={() => void list.refreshFromStart()}
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          showsVerticalScrollIndicator={false}
          windowSize={9}
        />
      )}
    </Screen>
  );
}
