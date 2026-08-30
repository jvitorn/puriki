import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, useWindowDimensions, View } from 'react-native';

import { localizedError } from '@/localization/localized-values';
import { AnimeCard } from '@/presentation/components/anime/anime-card';
import { SearchInput } from '@/presentation/components/anime/search-input';
import { EmptyState, ErrorState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { Text } from '@/presentation/components/ui/text';
import { useDebouncedValue } from '@/presentation/hooks/use-debounced-value';
import { useAnimeSearch } from '@/presentation/queries/anime-queries';
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
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = getSearchColumnCount(width);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);
  const normalizedQuery = normalizeSearchText(query);
  const normalizedDebouncedQuery = normalizeSearchText(debouncedQuery);
  const results = useAnimeSearch(debouncedQuery);
  const isSearching = normalizedQuery.length >= 2;
  const isNewRemoteSearchLoading =
    isSearching &&
    normalizedQuery === normalizedDebouncedQuery &&
    (results.isLoading || (results.isFetching && results.isPlaceholderData));
  const showSkeleton = results.isLoading || isNewRemoteSearchLoading;
  const resultCount = results.data?.length ?? 0;
  const label = isNewRemoteSearchLoading
    ? t('search.searching')
    : isSearching
      ? t('search.results', { count: resultCount })
      : normalizedQuery.length === 1
        ? t('search.typeMinimum')
        : t('search.popularStarter');

  return (
    <Screen padded={false}>
      <View className="gap-3 px-4 pb-4 pt-2 md:px-6">
        <Text variant="title">{t('search.title')}</Text>
        <SearchInput value={query} onChangeText={setQuery} />
        <Text variant="caption" muted>
          {label}
        </Text>
      </View>

      {normalizedQuery.length === 1 ? (
        <EmptyState
          title={t('search.keepTyping')}
          message={t('search.minimumMessage')}
        />
      ) : showSkeleton ? (
        <SearchGridSkeleton columns={columns} />
      ) : results.isError ? (
        <ErrorState
          message={localizedError(results.error, t)}
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
              title={isSearching ? t('search.noAnime') : t('search.nothing')}
              message={
                isSearching
                  ? t('search.noMatch', { query: normalizedQuery })
                  : t('search.unavailable')
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
