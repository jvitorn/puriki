import { Check, ListChecks } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';

import AniListIcon from '../../../../assets/providers/anilist.png';
import MyAnimeListIcon from '../../../../assets/providers/myanimelist.png';

import {
  decrementProgress,
  incrementProgress,
} from '@/domain/rules/anime-progress';
import { EpisodeProgressControl } from '@/presentation/components/anime/episode-progress-control';
import { Badge } from '@/presentation/components/ui/badge';
import { Card } from '@/presentation/components/ui/card';
import { Icon } from '@/presentation/components/ui/icon';
import { ProgressBar } from '@/presentation/components/ui/progress-bar';
import { Text } from '@/presentation/components/ui/text';

function ProviderChip({ icon, label }: { icon: number; label: string }) {
  return (
    <View className="min-h-16 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3">
      <Image className="size-8 rounded-lg" source={icon} />
      <Text variant="caption">{label}</Text>
    </View>
  );
}

export function ListsIllustration() {
  const { t } = useTranslation();
  // Illustration slot: keep this 300x300 composition replaceable by final art.
  return (
    <View className="h-[300px] w-[300px] items-center justify-center gap-5">
      <View className="w-full flex-row justify-center gap-3">
        <ProviderChip icon={AniListIcon} label="AniList" />
        <ProviderChip icon={MyAnimeListIcon} label="MAL" />
      </View>
      <View className="h-8 w-px bg-primary-emphasis" />
      <Card className="w-[260px] gap-3 p-4 py-4">
        <View className="flex-row items-center gap-3">
          <View className="size-10 items-center justify-center rounded-full bg-primary">
            <Icon as={ListChecks} className="size-5" />
          </View>
          <View className="flex-1 gap-2">
            <View className="h-2 rounded-full bg-border" />
            <View className="h-2 w-3/4 rounded-full bg-border" />
          </View>
        </View>
        <Text variant="caption" muted>
          {t('onboarding.illustrationUnifiedList')}
        </Text>
      </Card>
    </View>
  );
}

export function ProgressIllustration({
  progress,
  onChange,
}: {
  progress: number;
  onChange(value: number): void;
}) {
  const { t } = useTranslation();
  return (
    <View className="h-[300px] w-[300px] items-center justify-center">
      <Card className="w-[300px] gap-4 p-5 py-5">
        <View className="flex-row items-center gap-3">
          <View className="h-16 w-12 rounded-lg bg-primary/70" />
          <View className="flex-1 gap-2">
            <View className="h-2 rounded-full bg-border" />
            <View className="h-2 w-3/4 rounded-full bg-border" />
            <Badge variant="outline" className="self-start border-primary">
              <Text className="text-primary-emphasis">
                {t('status.watching').toLocaleUpperCase()}
              </Text>
            </Badge>
          </View>
        </View>
        <EpisodeProgressControl
          current={progress}
          total={24}
          onIncrease={() => onChange(incrementProgress(progress, 24))}
          onDecrease={() => onChange(decrementProgress(progress))}
        />
        <View className="gap-2">
          <ProgressBar value={progress / 24} />
          <Text variant="caption" muted>
            {progress} / 24
          </Text>
        </View>
      </Card>
    </View>
  );
}

export function ServicesIllustration() {
  const { t } = useTranslation();
  // Illustration slot: keep this 300x300 composition replaceable by final art.
  return (
    <View className="h-[300px] w-[300px] items-center justify-center gap-4">
      <View className="flex-row gap-3">
        <ProviderChip icon={AniListIcon} label="AniList" />
        <ProviderChip icon={MyAnimeListIcon} label="MAL" />
      </View>
      <View className="h-8 w-px bg-primary-emphasis" />
      <Card className="w-[270px] gap-3 p-4 py-4">
        {[0, 1, 2].map((row) => (
          <View key={row} className="flex-row items-center gap-3">
            <View
              className={
                row === 0
                  ? 'size-8 items-center justify-center rounded-full bg-primary'
                  : 'size-8 rounded-full border border-border bg-popover'
              }
            >
              {row === 0 ? <Icon as={Check} className="size-4" /> : null}
            </View>
            <View
              className={
                row === 2
                  ? 'h-2 w-1/2 rounded-full bg-border'
                  : 'h-2 flex-1 rounded-full bg-border'
              }
            />
          </View>
        ))}
        <Text variant="caption" muted>
          {t('onboarding.illustrationOrganizedLists')}
        </Text>
      </Card>
    </View>
  );
}
