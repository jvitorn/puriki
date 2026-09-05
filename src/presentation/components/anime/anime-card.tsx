import { Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { UnifiedAnime } from '@/domain/models/anime';
import { useAppLanguage } from '@/localization/localization-provider';
import { formatNumber } from '@/localization/localized-values';
import { PosterPlaceholder } from '@/presentation/components/anime/poster-placeholder';
import { Icon } from '@/presentation/components/ui/icon';
import { ProgressBar } from '@/presentation/components/ui/progress-bar';
import { Text } from '@/presentation/components/ui/text';
import { cn } from '@/shared/rnr/utils';

interface AnimeCardProps {
  item: UnifiedAnime;
  onPress(): void;
  className?: string;
}

export function AnimeCard({ item, onPress, className }: AnimeCardProps) {
  const { t } = useTranslation();
  const { language } = useAppLanguage();
  const { anime, userEntry } = item;
  const episodeLimit = anime.totalEpisodes ?? anime.releasedEpisodes ?? null;
  const progress = episodeLimit
    ? (userEntry?.watchedEpisodes ?? 0) / episodeLimit
    : 0;
  const year = anime.year
    ? formatNumber(anime.year, language, { useGrouping: false })
    : t('common.yearTbd');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.openAnime', { title: anime.title })}
      className={cn(
        'group w-36 max-w-[180px] gap-2 active:scale-[0.98] active:opacity-80 web:hover:opacity-90',
        className,
      )}
      onPress={onPress}
    >
      <PosterPlaceholder
        title={anime.title}
        seed={anime.coverSeed}
        imageUrl={anime.posterImageUrl}
      />
      <View className="gap-1">
        <Text className="font-bold leading-5" numberOfLines={1}>
          {anime.title}
        </Text>
        <View className="flex-row items-center justify-between gap-2">
          {anime.score !== null ? (
            <View className="flex-row items-center gap-1">
              <Icon
                as={Star}
                className="size-3.5 text-warning"
                fill="currentColor"
              />
              <Text variant="caption">
                {formatNumber(anime.score, language, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <Text variant="caption" muted numberOfLines={1}>
            {year}
          </Text>
        </View>
        {userEntry ? (
          <View className="mt-1 gap-1">
            <ProgressBar value={progress} />
            <Text variant="caption" muted>
              {userEntry.watchedEpisodes} / {episodeLimit ?? '?'}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
