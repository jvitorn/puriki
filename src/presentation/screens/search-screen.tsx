import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { useAnimeSearch } from '@/application/queries/anime-queries';
import { AnimeCard } from '@/presentation/components/anime/anime-card';
import { SearchInput } from '@/presentation/components/anime/search-input';
import { AppText } from '@/presentation/components/ui/app-text';
import { EmptyState, ErrorState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { useDebouncedValue } from '@/presentation/hooks/use-debounced-value';
import { spacing } from '@/presentation/theme/tokens';

export function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);
  const results = useAnimeSearch(debouncedQuery);
  const label = debouncedQuery
    ? `${results.data?.length ?? 0} results`
    : 'Discover something new';

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <AppText variant="title">Search</AppText>
        <SearchInput value={query} onChangeText={setQuery} />
        <AppText variant="caption" muted>
          {label}
        </AppText>
      </View>
      {results.isLoading ? (
        <View style={styles.loading}>
          <Skeleton height={204} />
          <Skeleton height={204} />
        </View>
      ) : results.isError ? (
        <ErrorState onRetry={() => void results.refetch()} />
      ) : (
        <FlatList
          testID="search-results"
          data={results.data ?? []}
          numColumns={2}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <AnimeCard
              item={{ anime: item }}
              onPress={() =>
                router.push({
                  pathname: '/anime/[id]',
                  params: { id: String(item.id) },
                })
              }
            />
          )}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title="No matches"
              message={`No anime matched “${debouncedQuery}”. Try another title.`}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  row: { justifyContent: 'space-around', gap: spacing.md },
  loading: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
});
