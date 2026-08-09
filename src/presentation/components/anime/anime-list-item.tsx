import { ChevronRight, Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { UnifiedAnime } from '@/domain/models/anime';
import { localizedStatus } from '@/localization/localized-values';
import { PosterPlaceholder } from '@/presentation/components/anime/poster-placeholder';
import { Badge } from '@/presentation/components/ui/badge';
import { Icon } from '@/presentation/components/ui/icon';
import { ProgressBar } from '@/presentation/components/ui/progress-bar';
import { Text } from '@/presentation/components/ui/text';

export function AnimeListItem({
  item,
  onPress,
}: {
  item: UnifiedAnime;
  onPress(): void;
}) {
  const { t } = useTranslation();
  const entry = item.userEntry;
  const progress = item.anime.totalEpisodes
    ? (entry?.watchedEpisodes ?? 0) / item.anime.totalEpisodes
    : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.openAnime', { title: item.anime.title })}
      className="flex-row items-center gap-3 rounded-xl bg-card p-2 active:opacity-75 web:hover:bg-muted/60"
      onPress={onPress}
    >
      <PosterPlaceholder
        className="shrink-0"
        title={item.anime.title}
        seed={item.anime.coverSeed}
        imageUrl={item.anime.posterImageUrl}
        width={72}
        height={104}
      />
      <View className="flex-1 gap-2">
        <Text variant="heading" numberOfLines={2}>
          {item.anime.title}
        </Text>
        {entry ? (
          <Badge
            className="self-start"
            variant={entry.status === 'watching' ? 'default' : 'outline'}
          >
            <Text>{localizedStatus(entry.status, t)}</Text>
          </Badge>
        ) : null}
        {entry ? (
          <>
            <ProgressBar value={progress} />
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="caption" muted>
                {t('common.episodeFraction', {
                  count: item.anime.totalEpisodes ?? 2,
                  watched: entry.watchedEpisodes,
                  total: item.anime.totalEpisodes ?? '?',
                })}
              </Text>
              {entry.userScore ? (
                <View className="flex-row items-center gap-1">
                  <Icon
                    as={Star}
                    className="size-3.5 text-warning"
                    fill="currentColor"
                  />
                  <Text variant="caption">{entry.userScore}</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </View>
      <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
    </Pressable>
  );
}
