import { LinearGradient } from 'expo-linear-gradient';
import {
  Bot,
  Brain,
  Circle,
  Coffee,
  Compass,
  Drama,
  Fingerprint,
  Flame,
  Ghost,
  Heart,
  Music2,
  Rocket,
  ScanEye,
  Smile,
  Sparkles,
  Swords,
  Trophy,
  WandSparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import type { AnimeCatalogItem } from '@/domain/models/anime';
import { localizedGenre } from '@/localization/localized-values';
import { Icon } from '@/presentation/components/ui/icon';
import { MotionPressable } from '@/presentation/components/ui/motion-pressable';
import { Text } from '@/presentation/components/ui/text';
import { colors, posterPalettes } from '@/presentation/theme/tokens';

export interface GenreTopic {
  anime: AnimeCatalogItem;
  genre: string;
}

const GENRE_ICONS: Record<string, LucideIcon> = {
  Action: Swords,
  Adventure: Compass,
  Comedy: Smile,
  Drama,
  Ecchi: Flame,
  Fantasy: Sparkles,
  Horror: Ghost,
  'Mahou Shoujo': WandSparkles,
  Mecha: Bot,
  Music: Music2,
  Mystery: ScanEye,
  Psychological: Brain,
  Romance: Heart,
  'Sci-Fi': Rocket,
  'Slice of Life': Coffee,
  Sports: Trophy,
  Supernatural: Zap,
  Thriller: Fingerprint,
};

export function getGenreIcon(genre: string): LucideIcon {
  return GENRE_ICONS[genre] ?? Circle;
}

export function getGenreTopics(items: AnimeCatalogItem[]): GenreTopic[] {
  const genres: string[] = [];
  const candidatesByGenre = new Map<string, AnimeCatalogItem[]>();

  items.forEach((anime) => {
    anime.genres.forEach((genre) => {
      const normalizedGenre = genre.trim();
      if (!normalizedGenre) return;
      const candidates = candidatesByGenre.get(normalizedGenre);
      if (candidates) candidates.push(anime);
      else {
        genres.push(normalizedGenre);
        candidatesByGenre.set(normalizedGenre, [anime]);
      }
    });
  });

  const assignedGenreByAnime = new Map<number, string>();
  const assignedAnimeByGenre = new Map<string, AnimeCatalogItem>();
  const assignUniqueAnime = (
    genre: string,
    visitedAnime: Set<number>,
  ): boolean => {
    for (const anime of candidatesByGenre.get(genre) ?? []) {
      if (visitedAnime.has(anime.id)) continue;
      visitedAnime.add(anime.id);
      const assignedGenre = assignedGenreByAnime.get(anime.id);
      if (!assignedGenre || assignUniqueAnime(assignedGenre, visitedAnime)) {
        assignedGenreByAnime.set(anime.id, genre);
        assignedAnimeByGenre.set(genre, anime);
        return true;
      }
    }
    return false;
  };

  genres.forEach((genre) => assignUniqueAnime(genre, new Set()));
  return genres.flatMap((genre) => {
    const anime = assignedAnimeByGenre.get(genre);
    return anime ? [{ anime, genre }] : [];
  });
}

export function GenreTopicCard({
  topic,
  onPress,
}: {
  topic: GenreTopic;
  onPress(): void;
}) {
  const { t } = useTranslation();
  const { anime, genre } = topic;
  const genreLabel = localizedGenre(genre, t);
  const GenreIcon = getGenreIcon(genre);
  const imageUrl =
    anime.heroImageUrl ?? anime.largePosterImageUrl ?? anime.posterImageUrl;
  const palette =
    posterPalettes[Math.abs(anime.bannerSeed) % posterPalettes.length] ??
    posterPalettes[0];

  return (
    <MotionPressable
      accessibilityLabel={t('search.openGenre', { genre: genreLabel })}
      accessibilityRole="button"
      className="relative min-h-28 w-full overflow-hidden rounded-2xl border border-border bg-card"
      onPress={onPress}
      pressedScale={0.98}
      style={{ aspectRatio: 1.5 }}
      testID={`genre-topic-${genre}`}
    >
      <LinearGradient
        colors={palette}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {imageUrl ? (
        <Image
          accessible={false}
          accessibilityIgnoresInvertColors
          importantForAccessibility="no"
          resizeMode="cover"
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          testID={`genre-topic-${genre}-image`}
        />
      ) : null}
      <LinearGradient
        colors={[`${colors.background}66`, `${colors.background}F2`]}
        style={StyleSheet.absoluteFill}
      />

      <View
        accessibilityElementsHidden
        className="flex-1 items-center justify-center gap-2 px-3"
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <View className="size-10 items-center justify-center rounded-full border border-border bg-background/80">
          <Icon as={GenreIcon} className="size-5 text-foreground" />
        </View>
        <Text
          className="text-center text-base font-extrabold text-foreground"
          numberOfLines={2}
        >
          {genreLabel}
        </Text>
      </View>
    </MotionPressable>
  );
}
