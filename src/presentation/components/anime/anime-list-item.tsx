import { ChevronRight, Star } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import type { UnifiedAnime } from '@/domain/models/anime';
import { PosterPlaceholder } from '@/presentation/components/anime/poster-placeholder';
import { AppText } from '@/presentation/components/ui/app-text';
import { Badge } from '@/presentation/components/ui/badge';
import { ProgressBar } from '@/presentation/components/ui/progress-bar';
import { colors, radii, spacing } from '@/presentation/theme/tokens';
import { STATUS_LABELS } from '@/shared/constants/anime-status';

export function AnimeListItem({
  item,
  onPress,
}: {
  item: UnifiedAnime;
  onPress(): void;
}) {
  const entry = item.userEntry;
  const progress = item.anime.totalEpisodes
    ? (entry?.watchedEpisodes ?? 0) / item.anime.totalEpisodes
    : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.anime.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <PosterPlaceholder
        title={item.anime.title}
        seed={item.anime.coverSeed}
        width={78}
        height={112}
      />
      <View style={styles.content}>
        <AppText variant="heading" numberOfLines={2}>
          {item.anime.title}
        </AppText>
        {entry ? (
          <Badge
            label={STATUS_LABELS[entry.status]}
            accent={entry.status === 'watching'}
          />
        ) : null}
        {entry ? (
          <>
            <ProgressBar value={progress} />
            <View style={styles.meta}>
              <AppText variant="caption" muted>
                {entry.watchedEpisodes} / {item.anime.totalEpisodes ?? '?'}{' '}
                episodes
              </AppText>
              {entry.userScore ? (
                <View style={styles.score}>
                  <Star
                    size={13}
                    color={colors.warning}
                    fill={colors.warning}
                  />
                  <AppText variant="caption">{entry.userScore}</AppText>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </View>
      <ChevronRight color={colors.textMuted} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.75 },
  content: { flex: 1, gap: spacing.sm },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  score: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
});
