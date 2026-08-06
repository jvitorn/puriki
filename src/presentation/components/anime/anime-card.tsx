import { Pressable, StyleSheet, View } from 'react-native';

import type { UnifiedAnime } from '@/domain/models/anime';
import { PosterPlaceholder } from '@/presentation/components/anime/poster-placeholder';
import { AppText } from '@/presentation/components/ui/app-text';
import { ProgressBar } from '@/presentation/components/ui/progress-bar';
import { spacing } from '@/presentation/theme/tokens';

interface AnimeCardProps {
  item: UnifiedAnime;
  onPress(): void;
}

export function AnimeCard({ item, onPress }: AnimeCardProps) {
  const { anime, userEntry } = item;
  const progress = anime.totalEpisodes
    ? (userEntry?.watchedEpisodes ?? 0) / anime.totalEpisodes
    : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${anime.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <PosterPlaceholder
        title={anime.title}
        seed={anime.coverSeed}
        imageUrl={anime.posterImageUrl}
      />
      <View style={styles.copy}>
        <AppText numberOfLines={2} style={styles.title}>
          {anime.title}
        </AppText>
        <AppText variant="caption" muted>
          {anime.year ?? 'Year TBD'} • {anime.totalEpisodes ?? '?'} eps
        </AppText>
        {userEntry ? (
          <View style={styles.progress}>
            <ProgressBar value={progress} />
            <AppText variant="caption" muted>
              {userEntry.watchedEpisodes} / {anime.totalEpisodes ?? '?'}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { width: 142, gap: spacing.sm },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  copy: { gap: spacing.xs },
  title: { fontWeight: '700', lineHeight: 20, minHeight: 40 },
  progress: { gap: spacing.xs },
});
