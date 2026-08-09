import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import type { UnifiedAnime } from '@/domain/models/anime';
import { AnimeCard } from '@/presentation/components/anime/anime-card';
import { SectionHeader } from '@/presentation/components/ui/section-header';
import { Text } from '@/presentation/components/ui/text';

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
  emptyMessage,
}: AnimeRailProps) {
  const { t } = useTranslation();
  return (
    <View className="mt-7">
      <SectionHeader title={title} />
      {items.length === 0 ? (
        <View className="rounded-xl bg-card p-4">
          <Text muted>{emptyMessage ?? t('common.nothingToShow')}</Text>
        </View>
      ) : (
        <FlatList
          horizontal
          contentContainerClassName="gap-4 pr-8"
          data={items}
          decelerationRate="fast"
          keyExtractor={(item) => String(item.anime.id)}
          renderItem={({ item }) => (
            <AnimeCard item={item} onPress={() => onPressItem(item)} />
          )}
          showsHorizontalScrollIndicator={false}
          snapToInterval={160}
        />
      )}
    </View>
  );
}
