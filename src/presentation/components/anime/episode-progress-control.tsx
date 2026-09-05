import { Minus, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/presentation/components/ui/button';
import { IconButton } from '@/presentation/components/ui/icon-button';
import { ProgressBar } from '@/presentation/components/ui/progress-bar';
import { Text } from '@/presentation/components/ui/text';
import { cn } from '@/shared/rnr/utils';

export function EpisodeProgressControl({
  current,
  total,
  onIncrease,
  onDecrease,
  disabled = false,
  saveState = 'idle',
  onRetry,
}: {
  current: number;
  total: number | null;
  onIncrease(): void;
  onDecrease(): void;
  disabled?: boolean;
  saveState?: 'idle' | 'saving' | 'saved' | 'error';
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const canDecrease = !disabled && current > 0;
  const canIncrease = !disabled && (total === null || current < total);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <IconButton
          disabled={!canDecrease}
          icon={Minus}
          label={t('details.decreaseEpisodes')}
          onPress={() => onDecrease()}
        />
        <View className="min-w-20 flex-1 items-center">
          <Text className="text-2xl font-black">{current}</Text>
          <Text variant="caption" muted>
            {t('details.ofEpisodes', {
              count: total ?? 2,
              total: total ?? '?',
            })}
          </Text>
        </View>
        <IconButton
          disabled={!canIncrease}
          icon={Plus}
          label={t('details.increaseEpisodes')}
          onPress={() => onIncrease()}
        />
      </View>
      {total !== null && total > 0 ? (
        <ProgressBar pending={saveState === 'saving'} value={current / total} />
      ) : null}
      {saveState !== 'idle' ? (
        <View className="min-h-6 flex-row items-center justify-between gap-2">
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole={saveState === 'error' ? 'alert' : undefined}
            className={cn(
              'text-xs',
              saveState === 'error'
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {saveState === 'saving'
              ? t('details.progressSaving')
              : saveState === 'saved'
                ? t('details.progressSaved')
                : t('details.progressSaveFailed')}
          </Text>
          {saveState === 'error' && onRetry ? (
            <Button
              accessibilityLabel={t('details.progressRetry')}
              className="h-8 px-0"
              variant="link"
              onPress={onRetry}
            >
              <Text>{t('details.progressRetry')}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
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
