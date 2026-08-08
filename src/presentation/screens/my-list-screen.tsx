import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';

import { useUnifiedUserList } from '@/application/queries/anime-queries';
import { getUserSafeErrorMessage } from '@/domain/errors/domain-error';
import type { AnimeListStatus } from '@/domain/models/anime';
import { AnimeListItem } from '@/presentation/components/anime/anime-list-item';
import { EmptyState, ErrorState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { Text } from '@/presentation/components/ui/text';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/presentation/components/ui/toggle-group';
import { ANIME_STATUSES, STATUS_LABELS } from '@/shared/constants/anime-status';
import { cn } from '@/shared/rnr/utils';

type ListFilter = AnimeListStatus | 'all';

export function MyListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<ListFilter>('all');
  const list = useUnifiedUserList(filter === 'all' ? undefined : filter);
  const filters: ListFilter[] = ['all', ...ANIME_STATUSES];
  const filterLabel = filter === 'all' ? 'All' : STATUS_LABELS[filter];

  return (
    <Screen padded={false}>
      <View className="gap-1 px-4 pt-2 md:px-6">
        <Text variant="title">My List</Text>
        <Text variant="caption" muted>
          {list.data?.length ?? 0} anime • {filterLabel}
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
          {Array.from({ length: 3 }, (_, index) => (
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
      ) : list.isError ? (
        <ErrorState
          message={getUserSafeErrorMessage(list.error)}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <FlatList
          testID="my-list"
          data={list.data ?? []}
          keyExtractor={(item) => String(item.anime.id)}
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
          ListFooterComponent={<View className="h-24" />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
