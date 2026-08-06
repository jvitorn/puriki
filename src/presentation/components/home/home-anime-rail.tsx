import { StyleSheet, View } from 'react-native';

import { getUserSafeErrorMessage } from '@/domain/errors/domain-error';
import type { UnifiedAnime } from '@/domain/models/anime';
import { AnimeRail } from '@/presentation/components/anime/anime-rail';
import { SectionErrorState } from '@/presentation/components/ui/feedback';
import { SectionHeader } from '@/presentation/components/ui/section-header';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { spacing } from '@/presentation/theme/tokens';

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
  if (items.length > 0 || (!isLoading && !isError)) {
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
    <View style={styles.section}>
      <SectionHeader title={title} />
      {isLoading ? (
        <Skeleton height={204} />
      ) : (
        <SectionErrorState
          message={getUserSafeErrorMessage(error)}
          retryLabel={`Retry ${title}`}
          onRetry={onRetry}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg, gap: spacing.sm },
});
