import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Star,
  Trash2,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, useWindowDimensions, View } from 'react-native';

import {
  useAddToList,
  useRemoveFromList,
  useUpdateProgress,
  useUpdateScore,
  useUpdateStatus,
} from '@/application/mutations/anime-mutations';
import { useAnimeDetails } from '@/application/queries/anime-queries';
import { useAppLanguage } from '@/localization/localization-provider';
import {
  formatNumber,
  localizedAiringStatus,
  localizedError,
  localizedStatus,
} from '@/localization/localized-values';
import { AnimeContinuitySection } from '@/presentation/components/anime/anime-continuity-section';
import { AnimeScoreSelector } from '@/presentation/components/anime/anime-score-selector';
import { AnimeStatusSelector } from '@/presentation/components/anime/anime-status-selector';
import { AnimeSynopsisSection } from '@/presentation/components/anime/anime-synopsis-section';
import { BannerPlaceholder } from '@/presentation/components/anime/banner-placeholder';
import { EpisodeProgressControl } from '@/presentation/components/anime/episode-progress-control';
import { PosterPlaceholder } from '@/presentation/components/anime/poster-placeholder';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Card } from '@/presentation/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/presentation/components/ui/collapsible';
import { EmptyState, ErrorState } from '@/presentation/components/ui/feedback';
import { Icon } from '@/presentation/components/ui/icon';
import { IconButton } from '@/presentation/components/ui/icon-button';
import { Screen } from '@/presentation/components/ui/screen';
import { Separator } from '@/presentation/components/ui/separator';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { Text } from '@/presentation/components/ui/text';

function DetailsBackButton({ onPress }: { onPress(): void }) {
  const { t } = useTranslation();
  return (
    <IconButton
      className="bg-background/80"
      icon={ArrowLeft}
      label={t('details.goBack')}
      onPress={onPress}
    />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-4 py-3">
      <Text muted>{label}</Text>
      <Text className="max-w-[65%] text-right">{value}</Text>
    </View>
  );
}

export function AnimeDetailsScreen({ animeId }: { animeId: number }) {
  const { t } = useTranslation();
  const { language } = useAppLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [alternativeTitlesOpen, setAlternativeTitlesOpen] = useState(false);
  const details = useAnimeDetails(animeId);
  const progress = useUpdateProgress();
  const status = useUpdateStatus();
  const score = useUpdateScore();
  const addToList = useAddToList();
  const removeFromList = useRemoveFromList();
  const mutationError = progress.error ?? status.error ?? score.error;
  const heroHeight = Math.max(260, Math.min(width * 0.62, 410));

  if (details.isLoading) {
    return (
      <Screen scroll padded={false}>
        <View className="absolute left-4 top-3 z-10">
          <DetailsBackButton onPress={() => router.back()} />
        </View>
        <Skeleton className="h-72 w-full md:h-96" />
        <View className="gap-4 px-4 pt-5 md:px-6">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-52 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </View>
      </Screen>
    );
  }

  if (details.isError) {
    return (
      <Screen>
        <View className="self-start py-2">
          <DetailsBackButton onPress={() => router.back()} />
        </View>
        <ErrorState
          message={localizedError(details.error, t)}
          onRetry={() => void details.refetch()}
        />
      </Screen>
    );
  }

  if (!details.data) {
    return (
      <Screen>
        <View className="self-start py-2">
          <DetailsBackButton onPress={() => router.back()} />
        </View>
        <EmptyState
          title={t('details.notFound')}
          message={t('details.notAvailable')}
        />
      </Screen>
    );
  }

  const { anime, userEntry } = details.data;
  const busy = addToList.isPending || removeFromList.isPending;

  const confirmRemoval = () => {
    Alert.alert(
      t('details.removeConfirmTitle'),
      t('details.removeConfirmDescription', { title: anime.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('details.removeFromList'),
          style: 'destructive',
          onPress: () => removeFromList.mutate({ animeId }),
        },
      ],
    );
  };

  return (
    <Screen scroll padded={false}>
      <View className="relative">
        <BannerPlaceholder
          title={anime.title}
          seed={anime.bannerSeed}
          imageUrl={anime.heroImageUrl}
          height={heroHeight}
        />
        <View className="absolute inset-0 bg-background/30" />
        <View className="absolute left-4 top-3">
          <DetailsBackButton onPress={() => router.back()} />
        </View>
      </View>

      <View className="gap-7 px-4 pb-8 md:px-6">
        <View className="-mt-20 flex-row items-end gap-4">
          <PosterPlaceholder
            className="shrink-0 border-2 border-background"
            title={anime.title}
            seed={anime.coverSeed}
            imageUrl={anime.largePosterImageUrl}
            width={112}
            height={164}
          />
          <View className="flex-1 gap-2 pb-2">
            <Text variant="title" numberOfLines={3}>
              {anime.title}
            </Text>
            <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2">
              {anime.score !== null ? (
                <View className="flex-row items-center gap-1">
                  <Icon as={Star} className="size-4 text-warning" />
                  <Text variant="caption">
                    {formatNumber(anime.score, language, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </Text>
                </View>
              ) : null}
              <Text variant="caption" muted>
                {anime.year ?? t('common.yearTbd')}
              </Text>
              <Text variant="caption" muted>
                {anime.totalEpisodes
                  ? t('common.episodesShort', { count: anime.totalEpisodes })
                  : t('common.episodesTbd')}
              </Text>
            </View>
            <Badge className="self-start">
              <Text>{localizedAiringStatus(anime.airingStatus, t)}</Text>
            </Badge>
          </View>
        </View>

        {userEntry ? (
          <Card className="gap-5 border-0 p-4 py-4">
            <View className="flex-row items-center justify-between gap-3">
              <View>
                <Text variant="heading">{t('details.myList')}</Text>
                <Text variant="caption" muted>
                  {t('details.entrySummary', {
                    count: anime.totalEpisodes ?? 2,
                    status: localizedStatus(userEntry.status, t),
                    watched: userEntry.watchedEpisodes,
                    total: anime.totalEpisodes ?? '?',
                  })}
                </Text>
              </View>
              {userEntry.userScore !== null ? (
                <Badge variant="secondary">
                  <Text>
                    {t('common.score', { score: userEntry.userScore })}
                  </Text>
                </Badge>
              ) : null}
            </View>
            <View className="gap-3">
              <Text variant="caption" muted>
                {t('details.episodeProgress')}
              </Text>
              <EpisodeProgressControl
                current={userEntry.watchedEpisodes}
                total={anime.totalEpisodes}
                disabled={busy}
                onChange={(episodes) => progress.mutate({ animeId, episodes })}
              />
            </View>
            <Separator />
            <View className="gap-3">
              <Text variant="caption" muted>
                {t('details.listStatus')}
              </Text>
              <AnimeStatusSelector
                value={userEntry.status}
                disabled={busy}
                onChange={(nextStatus) =>
                  status.mutate({ animeId, status: nextStatus })
                }
              />
            </View>
            <Separator />
            <View className="gap-3">
              <Text variant="caption" muted>
                {t('details.yourScore')}
              </Text>
              {userEntry.status === 'completed' &&
              userEntry.userScore === null ? (
                <Text className="text-primary">
                  {t('details.completedScorePrompt')}
                </Text>
              ) : null}
              <AnimeScoreSelector
                value={userEntry.userScore}
                disabled={busy}
                onChange={(nextScore) =>
                  score.mutate({ animeId, score: nextScore })
                }
              />
            </View>
            <Separator />
            {addToList.isPending ? (
              <Button disabled accessibilityLabel={t('details.adding')}>
                <Icon as={Plus} className="size-4 text-primary-foreground" />
                <Text>{t('details.adding')}</Text>
              </Button>
            ) : (
              <Button
                variant="ghost"
                disabled={busy}
                accessibilityLabel={t('details.removeA11y', {
                  title: anime.title,
                })}
                onPress={confirmRemoval}
              >
                <Icon as={Trash2} className="size-4 text-destructive" />
                <Text className="text-destructive">
                  {t('details.removeFromList')}
                </Text>
              </Button>
            )}
          </Card>
        ) : (
          <Button
            size="lg"
            disabled={busy}
            accessibilityLabel={
              removeFromList.isPending
                ? t('details.removing')
                : t('details.addA11y', { title: anime.title })
            }
            onPress={() => addToList.mutate({ animeId })}
          >
            <Icon
              as={removeFromList.isPending ? Trash2 : Plus}
              className="size-5 text-primary-foreground"
            />
            <Text>
              {removeFromList.isPending
                ? t('details.removing')
                : t('details.addToList')}
            </Text>
          </Button>
        )}

        {mutationError ? (
          <View
            accessible
            accessibilityRole="alert"
            className="rounded-xl border border-destructive bg-destructive/10 p-4"
          >
            <Text className="text-destructive">
              {t('details.updateFailed')}
            </Text>
          </View>
        ) : null}

        {addToList.error ? (
          <View
            accessible
            accessibilityRole="alert"
            className="rounded-xl border border-destructive bg-destructive/10 p-4"
          >
            <Text className="text-destructive">{t('details.addFailed')}</Text>
          </View>
        ) : null}

        {removeFromList.error ? (
          <View
            accessible
            accessibilityRole="alert"
            className="rounded-xl border border-destructive bg-destructive/10 p-4"
          >
            <Text className="text-destructive">
              {t('details.removeFailed')}
            </Text>
          </View>
        ) : null}

        {anime.synopsis ? (
          <AnimeSynopsisSection
            animeId={anime.id}
            synopsis={anime.synopsis}
            appLanguage={language}
          />
        ) : null}

        <View className="gap-1">
          <Text variant="heading" className="mb-2">
            {t('details.information')}
          </Text>
          <InfoRow
            label={t('details.season')}
            value={anime.season ?? t('common.unknown')}
          />
          <Separator />
          <InfoRow
            label={t('details.year')}
            value={
              anime.year
                ? formatNumber(anime.year, language)
                : t('common.unknown')
            }
          />
          <Separator />
          <InfoRow
            label={t('details.studio')}
            value={anime.studios.join(', ') || t('common.unknown')}
          />
          <Separator />
          <InfoRow
            label={t('details.genres')}
            value={anime.genres.join(', ') || t('common.unknown')}
          />
          <Separator />
          <InfoRow
            label={t('details.episodes')}
            value={
              anime.totalEpisodes
                ? formatNumber(anime.totalEpisodes, language)
                : t('common.unknown')
            }
          />
        </View>

        <AnimeContinuitySection
          relations={anime.continuity}
          onSelect={(relatedAnimeId) =>
            router.push({
              pathname: '/anime/[id]',
              params: { id: String(relatedAnimeId) },
            })
          }
        />

        {anime.alternativeTitles.length > 0 ? (
          <Collapsible
            open={alternativeTitlesOpen}
            onOpenChange={setAlternativeTitlesOpen}
          >
            <CollapsibleTrigger
              accessibilityLabel={t('details.alternativeTitles')}
              accessibilityState={{ expanded: alternativeTitlesOpen }}
              className="min-h-12 w-full flex-row items-center justify-between active:opacity-75"
            >
              <Text variant="heading">{t('details.alternativeTitles')}</Text>
              <Icon
                as={alternativeTitlesOpen ? ChevronUp : ChevronDown}
                className="size-5 text-muted-foreground"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Text muted>{anime.alternativeTitles.join(' • ')}</Text>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </View>
    </Screen>
  );
}
