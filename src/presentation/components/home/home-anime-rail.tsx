import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { UnifiedAnime } from '@/domain/models/anime';
import { localizedError } from '@/localization/localized-values';
import { AnimeRail } from '@/presentation/components/anime/anime-rail';
import { SectionErrorState } from '@/presentation/components/ui/feedback';
import { SectionHeader } from '@/presentation/components/ui/section-header';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { Text } from '@/presentation/components/ui/text';

interface HomeAnimeRailProps {
  title: string;
  items?: UnifiedAnime[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  emptyMessage?: string;
  onPressItem(item: UnifiedAnime): void;
  onRetry(): void;
}

export function HomeAnimeRail({
  title,
  items = [],
  isLoading,
  isError,
  error,
  emptyMessage,
  onPressItem,
  onRetry,
}: HomeAnimeRailProps) {
  const { t } = useTranslation();
  if (items.length > 0) {
    return (
      <AnimeRail
        title={title}
        items={items}
        onPressItem={onPressItem}
        emptyMessage={emptyMessage}
      />
    );
  }

  return (
    <View className="mt-7">
      <SectionHeader title={title} />
      {isLoading ? (
        <View className="flex-row gap-4 overflow-hidden">
          {Array.from({ length: 3 }, (_, index) => (
            <View key={index} className="w-36 gap-2">
              <Skeleton className="aspect-[2/3] w-full rounded-xl" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </View>
          ))}
        </View>
      ) : isError ? (
        <SectionErrorState
          message={localizedError(error, t)}
          onRetry={onRetry}
          retryLabel={t('home.retrySection', { section: title })}
        />
      ) : (
        <View className="rounded-xl bg-card p-4">
          <Text muted>{emptyMessage ?? t('common.nothingToShow')}</Text>
        </View>
      )}
    </View>
  );
}
