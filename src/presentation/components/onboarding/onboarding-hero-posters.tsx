import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { AnimeCatalogItem } from '@/domain/models/anime';
import { PosterPlaceholder } from '@/presentation/components/anime/poster-placeholder';
import { Skeleton } from '@/presentation/components/ui/skeleton';

const POSTER_LAYOUT = [
  { height: 177, left: 0, rotation: '-9deg', top: 28, width: 118, zIndex: 1 },
  { height: 210, left: 80, rotation: '0deg', top: 0, width: 140, zIndex: 2 },
  { height: 177, left: 182, rotation: '9deg', top: 28, width: 118, zIndex: 1 },
] as const;

export function pickOnboardingPosters(
  items: readonly AnimeCatalogItem[],
  random: () => number = Math.random,
): AnimeCatalogItem[] {
  const candidates = items.filter((item) => Boolean(item.posterImageUrl));
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];
    if (!current || !swap) continue;
    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }
  return shuffled.slice(0, 3);
}

function PosterComposition({
  selection,
  showSkeleton,
}: {
  selection: readonly AnimeCatalogItem[];
  showSkeleton: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View className="relative h-[220px] w-[300px]" testID="hero-posters">
      {POSTER_LAYOUT.map((layout, index) => {
        const anime = selection?.[index];
        const style = {
          height: layout.height,
          left: layout.left,
          top: layout.top,
          width: layout.width,
          zIndex: layout.zIndex,
          transform: [{ rotate: layout.rotation }],
        };
        return (
          <View key={index} className="absolute" style={style}>
            {showSkeleton ? (
              <Skeleton className="h-full w-full rounded-2xl" />
            ) : (
              <PosterPlaceholder
                title={anime?.title ?? t('onboarding.posterFallback')}
                seed={anime?.coverSeed ?? index}
                imageUrl={anime?.posterImageUrl}
                className="rounded-2xl"
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function StablePosterComposition({
  items,
  random,
}: {
  items: readonly AnimeCatalogItem[];
  random: () => number;
}) {
  const [selection] = useState(() => pickOnboardingPosters(items, random));
  return <PosterComposition selection={selection} showSkeleton={false} />;
}

export function OnboardingHeroPosters({
  items,
  isLoading,
  random = Math.random,
}: {
  items?: readonly AnimeCatalogItem[];
  isLoading: boolean;
  random?: () => number;
}) {
  if (isLoading) {
    return <PosterComposition selection={[]} showSkeleton />;
  }
  return <StablePosterComposition items={items ?? []} random={random} />;
}
