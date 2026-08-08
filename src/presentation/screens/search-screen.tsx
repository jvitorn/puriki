import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';

import { useAnimeSearch } from '@/application/queries/anime-queries';
import { getUserSafeErrorMessage } from '@/domain/errors/domain-error';
import { AnimeCard } from '@/presentation/components/anime/anime-card';
import { SearchInput } from '@/presentation/components/anime/search-input';
import { EmptyState, ErrorState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { Text } from '@/presentation/components/ui/text';
import { useDebouncedValue } from '@/presentation/hooks/use-debounced-value';
import { getSearchColumnCount } from '@/presentation/utils/responsive-grid';
import { normalizeSearchText } from '@/shared/utils/search';

function SearchGridSkeleton({ columns }: { columns: number }) {
  return (
    <View className="flex-row flex-wrap px-2 pt-2">
      {Array.from({ length: columns * 2 }, (_, index) => (
        <View
          key={index}
          className="mb-6 items-center px-2"
          style={{ flexBasis: `${100 / columns}%` }}
        >
          <View className="w-full max-w-[180px] gap-2">
            <Skeleton className="aspect-[2/3] w-full rounded-xl" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function SearchScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = getSearchColumnCount(width);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);
  const normalizedQuery = normalizeSearchText(query);
  const results = useAnimeSearch(debouncedQuery);
  const isSearching = normalizedQuery.length >= 2;
  const resultCount = results.data?.length ?? 0;
  const label = isSearching
    ? `${resultCount} ${resultCount === 1 ? 'result' : 'results'}`
    : normalizedQuery.length === 1
      ? 'Type at least 2 characters to search'
      : 'Popular anime to get you started';

  return (
    <Screen padded={false}>
      <View className="gap-3 px-4 pb-4 pt-2 md:px-6">
        <Text variant="title">Search</Text>
        <SearchInput value={query} onChangeText={setQuery} />
        <Text variant="caption" muted>
          {label}
        </Text>
      </View>

      {normalizedQuery.length === 1 ? (
        <EmptyState
          title="Keep typing"
          message="Enter at least two characters to search the anime catalog."
        />
      ) : results.isLoading ? (
        <SearchGridSkeleton columns={columns} />
      ) : results.isError ? (
        <ErrorState
          message={getUserSafeErrorMessage(results.error)}
          onRetry={() => void results.refetch()}
        />
      ) : (
        <FlatList
          key={`search-grid-${columns}`}
          testID="search-results"
          data={results.data ?? []}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => String(item.id)}
          numColumns={columns}
          renderItem={({ item }) => (
            <View className="mb-6 flex-1 items-center px-2">
              <AnimeCard
                className="w-full"
                item={{ anime: item }}
                onPress={() =>
                  router.push({
                    pathname: '/anime/[id]',
                    params: { id: String(item.id) },
                  })
                }
              />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title={isSearching ? 'No anime found' : 'Nothing to discover'}
              message={
                isSearching
                  ? `No anime matched “${normalizedQuery}”. Try another title.`
                  : 'Popular anime are unavailable right now.'
              }
            />
          }
          ListFooterComponent={<View className="h-24" />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
