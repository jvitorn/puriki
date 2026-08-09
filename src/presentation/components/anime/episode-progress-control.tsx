import { Minus, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { IconButton } from '@/presentation/components/ui/icon-button';
import { Text } from '@/presentation/components/ui/text';

export function EpisodeProgressControl({
  current,
  total,
  onChange,
  disabled = false,
}: {
  current: number;
  total: number | null;
  onChange(value: number): void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const canDecrease = !disabled && current > 0;
  const canIncrease = !disabled && (total === null || current < total);

  return (
    <View className="flex-row items-center gap-3">
      <IconButton
        disabled={!canDecrease}
        icon={Minus}
        label={t('details.decreaseEpisodes')}
        onPress={() => onChange(current - 1)}
      />
      <View className="min-w-20 flex-1 items-center">
        <Text className="text-xl font-black">{current}</Text>
        <Text variant="caption" muted>
          {t('details.ofEpisodes', { count: total ?? 2, total: total ?? '?' })}
        </Text>
      </View>
      <IconButton
        disabled={!canIncrease}
        icon={Plus}
        label={t('details.increaseEpisodes')}
        onPress={() => onChange(current + 1)}
      />
      <View
        accessible
        accessibilityLabel={t('details.progressA11y', {
          current,
          total: total ?? t('common.unknown').toLocaleLowerCase(),
        })}
        className="absolute"
      />
    </View>
  );
}
