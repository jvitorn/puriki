import { Star } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { UnifiedAnime } from '@/domain/models/anime';
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
  const { anime, userEntry } = item;
  const progress = anime.totalEpisodes
    ? (userEntry?.watchedEpisodes ?? 0) / anime.totalEpisodes
    : 0;
  const yearAndEpisodes = [
    anime.year ?? 'Year TBD',
    anime.totalEpisodes ? `${anime.totalEpisodes} eps` : 'Episodes TBD',
  ].join(' • ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${anime.title}`}
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
        <Text className="min-h-10 font-bold leading-5" numberOfLines={2}>
          {anime.title}
        </Text>
        <Text variant="caption" muted numberOfLines={1}>
          {yearAndEpisodes}
        </Text>
        {anime.score !== null ? (
          <View className="flex-row items-center gap-1">
            <Icon
              as={Star}
              className="size-3.5 text-warning"
              fill="currentColor"
            />
            <Text variant="caption">{anime.score.toFixed(1)}</Text>
          </View>
        ) : null}
        {userEntry ? (
          <View className="mt-1 gap-1">
            <ProgressBar value={progress} />
            <Text variant="caption" muted>
              {userEntry.watchedEpisodes} / {anime.totalEpisodes ?? '?'}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
