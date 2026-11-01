import { useRouter } from 'expo-router';
import { ArrowLeft, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, useWindowDimensions, View } from 'react-native';

import type { AnimeCatalogItem, UnifiedAnime } from '@/domain/models/anime';
import {
  localizedError,
  localizedGenre,
} from '@/localization/localized-values';
import { AnimeCard } from '@/presentation/components/anime/anime-card';
import { SearchInput } from '@/presentation/components/anime/search-input';
import { HomeAnimeRail } from '@/presentation/components/home/home-anime-rail';
import {
  GenreTopicCard,
  getGenreTopics,
} from '@/presentation/components/search/genre-topic-card';
import { EmptyState, ErrorState } from '@/presentation/components/ui/feedback';
import { IconButton } from '@/presentation/components/ui/icon-button';
import { Screen } from '@/presentation/components/ui/screen';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { Text } from '@/presentation/components/ui/text';
import { useDebouncedValue } from '@/presentation/hooks/use-debounced-value';
import {
  useAnimeSearch,
  useGenreDiscovery,
} from '@/presentation/queries/anime-queries';
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

function GenreTopicSkeleton({ columns }: { columns: number }) {
  return (
    <View className="flex-row flex-wrap px-3 pt-2">
      {Array.from({ length: columns * 3 }, (_, index) => (
        <View
          key={index}
          className="mb-2 px-1"
          style={{ flexBasis: `${100 / columns}%` }}
        >
          <Skeleton className="aspect-[3/2] min-h-28 w-full rounded-2xl" />
        </View>
      ))}
    </View>
  );
}

function asUnified(items: AnimeCatalogItem[] | undefined): UnifiedAnime[] {
  return items?.map((anime) => ({ anime })) ?? [];
}

export function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = getSearchColumnCount(width);
  const topicColumns = Math.min(columns, 4);
  const [query, setQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [isGenreSearchOpen, setIsGenreSearchOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 250);
  const normalizedQuery = normalizeSearchText(query);
  const normalizedDebouncedQuery = normalizeSearchText(debouncedQuery);
  const results = useAnimeSearch(debouncedQuery);
  const genreDiscovery = useGenreDiscovery(selectedGenre);
  const isSearching = normalizedQuery.length >= 2;
  const isTopicDiscovery = normalizedQuery.length === 0 && !selectedGenre;
  const isNewRemoteSearchLoading =
    isSearching &&
    normalizedQuery === normalizedDebouncedQuery &&
    (results.isLoading || (results.isFetching && results.isPlaceholderData));
  const topics = useMemo(
    () => getGenreTopics(results.data ?? []),
    [results.data],
  );
  const selectedGenreLabel = selectedGenre
    ? localizedGenre(selectedGenre, t)
    : null;
  const resultCount = results.data?.length ?? 0;
  const label = isNewRemoteSearchLoading
    ? t('search.searching')
    : isSearching
      ? t('search.results', { count: resultCount })
      : normalizedQuery.length === 1
        ? t('search.typeMinimum')
        : t('search.browseTopics');

  const openAnime = (id: number) =>
    router.push({ pathname: '/anime/[id]', params: { id: String(id) } });

  const handleQueryChange = (value: string) => {
    setQuery(value);
  };

  const openGenre = (genre: string) => {
    setSelectedGenre(genre);
    setIsGenreSearchOpen(false);
  };

  const showAllGenres = () => {
    setSelectedGenre(null);
    setIsGenreSearchOpen(false);
  };

  const closeGenreSearch = () => {
    setQuery('');
    setIsGenreSearchOpen(false);
  };

  return (
    <Screen padded={false}>
      <View className="px-4 pb-4 pt-2 md:px-6">
        {selectedGenre && selectedGenreLabel && !isGenreSearchOpen ? (
          <View className="min-h-12 flex-row items-center gap-3">
            <IconButton
              className="h-12 w-12 rounded-full border-transparent bg-transparent shadow-none"
              icon={ArrowLeft}
              label={t('search.showAllGenres')}
              onPress={showAllGenres}
            />
            <Text className="flex-1 text-center" variant="title">
              {selectedGenreLabel}
            </Text>
            <IconButton
              className="h-12 w-12 rounded-full border-transparent bg-transparent shadow-none"
              icon={Search}
              label={t('search.openSearch')}
              onPress={() => setIsGenreSearchOpen(true)}
            />
          </View>
        ) : (
          <View className="gap-3">
            {!isGenreSearchOpen ? (
              <Text variant="title">{t('search.title')}</Text>
            ) : null}
            <SearchInput
              autoFocus={isGenreSearchOpen}
              value={query}
              onChangeText={handleQueryChange}
              onClose={isGenreSearchOpen ? closeGenreSearch : undefined}
            />
            {!isGenreSearchOpen ? (
              <Text variant="caption" muted>
                {label}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {normalizedQuery.length === 1 ? (
        <EmptyState
          title={t('search.keepTyping')}
          message={t('search.minimumMessage')}
        />
      ) : isTopicDiscovery && results.isLoading ? (
        <GenreTopicSkeleton columns={topicColumns} />
      ) : isNewRemoteSearchLoading ? (
        <SearchGridSkeleton columns={columns} />
      ) : isTopicDiscovery && results.isError ? (
        <ErrorState
          message={localizedError(results.error, t)}
          onRetry={() => void results.refetch()}
        />
      ) : isTopicDiscovery ? (
        <FlatList
          key={`genre-topics-${topicColumns}`}
          testID="search-topics"
          contentContainerStyle={{ paddingHorizontal: 12 }}
          data={topics}
          keyExtractor={(item) => item.genre}
          numColumns={topicColumns}
          renderItem={({ item }) => (
            <View
              className="mb-2 px-1"
              style={{ flexBasis: `${100 / topicColumns}%` }}
            >
              <GenreTopicCard
                topic={item}
                onPress={() => openGenre(item.genre)}
              />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title={t('search.nothing')}
              message={t('search.topicsUnavailable')}
            />
          }
          ListFooterComponent={<View className="h-24" />}
          showsVerticalScrollIndicator={false}
        />
      ) : normalizedQuery.length === 0 &&
        selectedGenre &&
        genreDiscovery.isError ? (
        <ErrorState
          message={localizedError(genreDiscovery.error, t)}
          onRetry={() => void genreDiscovery.refetch()}
        />
      ) : normalizedQuery.length === 0 &&
        selectedGenre &&
        selectedGenreLabel ? (
        <ScrollView
          contentContainerClassName="px-4 pb-24 md:px-6"
          showsVerticalScrollIndicator={false}
          testID="genre-discovery-results"
        >
          <HomeAnimeRail
            title={t('search.new')}
            items={asUnified(genreDiscovery.data?.newReleases)}
            isLoading={genreDiscovery.isLoading}
            isError={false}
            error={null}
            emptyMessage={t('search.noNewInGenre')}
            onPressItem={(item) => openAnime(item.anime.id)}
            onRetry={() => void genreDiscovery.refetch()}
          />
          <HomeAnimeRail
            title={t('search.popular')}
            items={asUnified(genreDiscovery.data?.popular)}
            isLoading={genreDiscovery.isLoading}
            isError={false}
            error={null}
            emptyMessage={t('search.noPopularInGenre')}
            onPressItem={(item) => openAnime(item.anime.id)}
            onRetry={() => void genreDiscovery.refetch()}
          />
        </ScrollView>
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
                onPress={() => openAnime(item.id)}
              />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title={t('search.noAnime')}
              message={t('search.noMatch', { query: normalizedQuery })}
            />
          }
          ListFooterComponent={<View className="h-24" />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
