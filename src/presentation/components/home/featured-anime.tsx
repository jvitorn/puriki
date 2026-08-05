import { Play } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { AnimeCatalogItem } from '@/domain/models/anime';
import { BannerPlaceholder } from '@/presentation/components/anime/banner-placeholder';
import { AppText } from '@/presentation/components/ui/app-text';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { colors, radii, spacing } from '@/presentation/theme/tokens';

export function FeaturedAnime({
  anime,
  onOpen,
}: {
  anime: AnimeCatalogItem;
  onOpen(): void;
}) {
  return (
    <View style={styles.container}>
      <BannerPlaceholder
        title={anime.title}
        seed={anime.bannerSeed}
        height={390}
      />
      <View style={styles.overlay}>
        <Badge label="FEATURED" accent />
        <AppText variant="display" numberOfLines={2}>
          {anime.title}
        </AppText>
        <AppText muted numberOfLines={3}>
          {anime.synopsis}
        </AppText>
        <View style={styles.metadata}>
          <AppText variant="caption">{anime.year ?? 'TBD'}</AppText>
          <AppText variant="caption">
            {anime.totalEpisodes ?? '?'} episodes
          </AppText>
          <AppText variant="caption">★ {anime.score ?? '—'}</AppText>
        </View>
        <View style={styles.action}>
          <Button
            label="View details"
            onPress={onOpen}
            icon={<Play color={colors.text} size={18} fill={colors.text} />}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.overlay,
  },
  metadata: { flexDirection: 'row', gap: spacing.md },
  action: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
