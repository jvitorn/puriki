import { FlatList, StyleSheet, View } from 'react-native';

import type { UnifiedAnime } from '@/domain/models/anime';
import { AnimeCard } from '@/presentation/components/anime/anime-card';
import { AppText } from '@/presentation/components/ui/app-text';
import { SectionHeader } from '@/presentation/components/ui/section-header';
import { colors, radii, spacing } from '@/presentation/theme/tokens';

interface AnimeRailProps {
  title: string;
  items: UnifiedAnime[];
  onPressItem(item: UnifiedAnime): void;
  emptyMessage?: string;
}

export function AnimeRail({
  title,
  items,
  onPressItem,
  emptyMessage = 'Nothing to show yet.',
}: AnimeRailProps) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <AppText muted>{emptyMessage}</AppText>
        </View>
      ) : (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => String(item.anime.id)}
          renderItem={({ item }) => (
            <AnimeCard item={item} onPress={() => onPressItem(item)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  list: { paddingRight: spacing.md },
  separator: { width: spacing.md },
  empty: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
