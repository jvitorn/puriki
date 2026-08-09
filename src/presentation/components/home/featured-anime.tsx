import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { AnimeCatalogItem } from '@/domain/models/anime';
import { useAppLanguage } from '@/localization/localization-provider';
import { formatNumber } from '@/localization/localized-values';
import { BannerPlaceholder } from '@/presentation/components/anime/banner-placeholder';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Icon } from '@/presentation/components/ui/icon';
import { Text } from '@/presentation/components/ui/text';

export function FeaturedAnime({
  anime,
  onOpen,
}: {
  anime: AnimeCatalogItem;
  onOpen(): void;
}) {
  const { t } = useTranslation();
  const { language } = useAppLanguage();
  const { width } = useWindowDimensions();
  const heroHeight = Math.max(360, Math.min(width * 0.82, 480));

  return (
    <View className="relative overflow-hidden rounded-2xl bg-card">
      <BannerPlaceholder
        title={anime.title}
        seed={anime.bannerSeed}
        imageUrl={anime.heroImageUrl}
        height={heroHeight}
      />
      <LinearGradient
        colors={['transparent', 'rgba(8,10,15,0.28)', 'rgba(8,10,15,0.96)']}
        locations={[0.22, 0.52, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View className="absolute inset-x-0 bottom-0 gap-2 p-5 md:p-7">
        <Badge className="self-start">
          <Text>{t('home.featured')}</Text>
        </Badge>
        <Text variant="display" className="max-w-3xl" numberOfLines={2}>
          {anime.title}
        </Text>
        {anime.synopsis ? (
          <Text className="max-w-3xl text-white/75" numberOfLines={3}>
            {anime.synopsis}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
          <Text variant="caption">
            {anime.year
              ? formatNumber(anime.year, language)
              : t('common.yearTbd')}
          </Text>
          <Text variant="caption">
            {anime.totalEpisodes
              ? t('common.episodes', { count: anime.totalEpisodes })
              : t('common.episodesTbd')}
          </Text>
          {anime.score !== null ? (
            <Text variant="caption">
              ★{' '}
              {formatNumber(anime.score, language, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </Text>
          ) : null}
        </View>
        <Button className="mt-2 min-h-11 self-start" onPress={onOpen}>
          <Icon as={Play} className="size-4" />
          <Text>{t('home.viewDetails')}</Text>
        </Button>
      </View>
    </View>
  );
}
