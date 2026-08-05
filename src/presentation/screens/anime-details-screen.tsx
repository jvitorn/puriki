import { useRouter } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import {
  useUpdateProgress,
  useUpdateScore,
  useUpdateStatus,
} from '@/application/mutations/anime-mutations';
import { useAnimeDetails } from '@/application/queries/anime-queries';
import { AnimeScoreSelector } from '@/presentation/components/anime/anime-score-selector';
import { AnimeStatusSelector } from '@/presentation/components/anime/anime-status-selector';
import { BannerPlaceholder } from '@/presentation/components/anime/banner-placeholder';
import { EpisodeProgressControl } from '@/presentation/components/anime/episode-progress-control';
import { PosterPlaceholder } from '@/presentation/components/anime/poster-placeholder';
import { AppText } from '@/presentation/components/ui/app-text';
import { Badge } from '@/presentation/components/ui/badge';
import { EmptyState, ErrorState } from '@/presentation/components/ui/feedback';
import { IconButton } from '@/presentation/components/ui/icon-button';
import { Screen } from '@/presentation/components/ui/screen';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { colors, radii, spacing } from '@/presentation/theme/tokens';

export function AnimeDetailsScreen({ animeId }: { animeId: number }) {
  const router = useRouter();
  const details = useAnimeDetails(animeId);
  const progress = useUpdateProgress();
  const status = useUpdateStatus();
  const score = useUpdateScore();
  const mutationError = progress.error ?? status.error ?? score.error;

  if (details.isLoading)
    return (
      <Screen scroll>
        <View style={styles.back}>
          <IconButton
            icon={ArrowLeft}
            label="Go back"
            onPress={() => router.back()}
          />
        </View>
        <Skeleton height={300} />
        <View style={styles.loading}>
          <Skeleton height={32} width="70%" />
          <Skeleton height={110} />
          <Skeleton height={70} />
        </View>
      </Screen>
    );
  if (details.isError)
    return (
      <Screen>
        <View style={styles.back}>
          <IconButton
            icon={ArrowLeft}
            label="Go back"
            onPress={() => router.back()}
          />
        </View>
        <ErrorState onRetry={() => void details.refetch()} />
      </Screen>
    );
  if (!details.data)
    return (
      <Screen>
        <View style={styles.back}>
          <IconButton
            icon={ArrowLeft}
            label="Go back"
            onPress={() => router.back()}
          />
        </View>
        <EmptyState
          title="Anime not found"
          message="This title is not available in the local catalog."
        />
      </Screen>
    );

  const { anime, userEntry } = details.data;
  const currentEntry = userEntry ?? {
    animeId,
    status: 'plan_to_watch' as const,
    watchedEpisodes: 0,
    userScore: null,
    updatedAt: '',
  };
  const busy = progress.isPending || status.isPending || score.isPending;
  return (
    <Screen scroll padded={false}>
      <View style={styles.hero}>
        <BannerPlaceholder
          title={anime.title}
          seed={anime.bannerSeed}
          height={300}
        />
        <View style={styles.backFloating}>
          <IconButton
            icon={ArrowLeft}
            label="Go back"
            onPress={() => router.back()}
          />
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.identity}>
          <PosterPlaceholder
            title={anime.title}
            seed={anime.coverSeed}
            width={104}
            height={150}
          />
          <View style={styles.identityCopy}>
            <AppText variant="title">{anime.title}</AppText>
            <AppText variant="caption" muted>
              {anime.alternativeTitles.join(' • ')}
            </AppText>
            <View style={styles.badges}>
              <Badge label={anime.airingStatus} accent />
              <Badge label={`${anime.totalEpisodes ?? '?'} episodes`} />
            </View>
          </View>
        </View>
        <View style={styles.metadata}>
          <AppText>
            {anime.season ?? 'Season TBD'} {anime.year ?? ''}
          </AppText>
          <AppText>{anime.studios.join(', ')}</AppText>
          <View style={styles.scoreLine}>
            <Star size={17} color={colors.warning} fill={colors.warning} />
            <AppText>{anime.score ?? 'Not scored'}</AppText>
          </View>
        </View>
        <View style={styles.genres}>
          {anime.genres.map((genre) => (
            <Badge key={genre} label={genre} />
          ))}
        </View>
        <View style={styles.section}>
          <AppText variant="heading">Synopsis</AppText>
          <AppText muted>{anime.synopsis}</AppText>
        </View>
        <View style={styles.panel}>
          <AppText variant="heading">Episode progress</AppText>
          <EpisodeProgressControl
            current={currentEntry.watchedEpisodes}
            total={anime.totalEpisodes}
            disabled={busy}
            onChange={(episodes) => progress.mutate({ animeId, episodes })}
          />
        </View>
        <View style={styles.panel}>
          <AppText variant="heading">List status</AppText>
          <AnimeStatusSelector
            value={currentEntry.status}
            disabled={busy}
            onChange={(nextStatus) =>
              status.mutate({ animeId, status: nextStatus })
            }
          />
        </View>
        <View style={styles.panel}>
          <AppText variant="heading">Your score</AppText>
          <AnimeScoreSelector
            value={currentEntry.userScore}
            disabled={busy}
            onChange={(nextScore) =>
              score.mutate({ animeId, score: nextScore })
            }
          />
        </View>
        {mutationError ? (
          <View accessible accessibilityRole="alert" style={styles.error}>
            <AppText style={styles.errorText}>
              Update failed. Your previous values were restored.
            </AppText>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { position: 'relative' },
  back: { alignSelf: 'flex-start' },
  backFloating: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  loading: { gap: spacing.md, marginTop: spacing.lg },
  body: { padding: spacing.md, gap: spacing.lg },
  identity: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    marginTop: -72,
  },
  identityCopy: { flex: 1, gap: spacing.sm, paddingBottom: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metadata: { gap: spacing.xs },
  scoreLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { gap: spacing.sm },
  panel: {
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: { color: colors.danger },
});
