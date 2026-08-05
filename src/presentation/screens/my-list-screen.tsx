import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useUnifiedUserList } from '@/application/queries/anime-queries';
import type { AnimeListStatus } from '@/domain/models/anime';
import { AnimeListItem } from '@/presentation/components/anime/anime-list-item';
import { AppText } from '@/presentation/components/ui/app-text';
import { EmptyState, ErrorState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { colors, radii, spacing } from '@/presentation/theme/tokens';
import { ANIME_STATUSES, STATUS_LABELS } from '@/shared/constants/anime-status';

type ListFilter = AnimeListStatus | 'all';

export function MyListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<ListFilter>('all');
  const list = useUnifiedUserList(filter === 'all' ? undefined : filter);
  const filters: ListFilter[] = ['all', ...ANIME_STATUSES];
  const filterLabel = filter === 'all' ? 'All' : STATUS_LABELS[filter];
  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <AppText variant="title">My List</AppText>
        <AppText variant="caption" muted>
          {list.data?.length ?? 0} anime • {filterLabel}
        </AppText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        accessibilityLabel="List filters"
      >
        {filters.map((value) => {
          const selected = value === filter;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${value === 'all' ? 'All' : STATUS_LABELS[value]}`}
              accessibilityState={{ selected }}
              onPress={() => setFilter(value)}
              style={[styles.filter, selected && styles.selected]}
            >
              <AppText variant="caption">
                {value === 'all' ? 'All' : STATUS_LABELS[value]}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
      {list.isLoading ? (
        <View style={styles.loading}>
          <Skeleton height={128} />
          <Skeleton height={128} />
          <Skeleton height={128} />
        </View>
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          testID="my-list"
          data={list.data ?? []}
          keyExtractor={(item) => String(item.anime.id)}
          renderItem={({ item }) => (
            <AnimeListItem
              item={item}
              onPress={() =>
                router.push({
                  pathname: '/anime/[id]',
                  params: { id: String(item.anime.id) },
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title={`No ${filterLabel.toLowerCase()} anime`}
              message="Anime in this category will appear here."
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
    gap: spacing.xs,
  },
  filters: { gap: spacing.sm, padding: spacing.md },
  filter: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  separator: { height: spacing.sm },
  loading: { gap: spacing.sm, padding: spacing.md },
});
