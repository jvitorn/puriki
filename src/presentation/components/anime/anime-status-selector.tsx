import { Check, LockKeyhole } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';

import type { AnimeListStatus } from '@/domain/models/anime';
import type {
  StatusTransitionBlockedReason,
  StatusTransitionResult,
} from '@/domain/rules/anime-status';
import { localizedStatus } from '@/localization/localized-values';
import { Icon } from '@/presentation/components/ui/icon';
import { MotionPressable } from '@/presentation/components/ui/motion-pressable';
import { Text } from '@/presentation/components/ui/text';
import { ANIME_STATUSES } from '@/shared/constants/anime-status';
import { cn } from '@/shared/rnr/utils';

export function AnimeStatusSelector({
  value,
  transitions,
  onChange,
  onBlocked,
  disabled = false,
  saving = false,
}: {
  value: AnimeListStatus;
  transitions: Record<AnimeListStatus, StatusTransitionResult>;
  onChange(value: AnimeListStatus): void;
  onBlocked(reason: StatusTransitionBlockedReason): void;
  disabled?: boolean;
  saving?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessible={false}
      accessibilityLabel={t('details.statusSelector')}
      className="flex-row flex-wrap justify-start gap-2"
    >
      {ANIME_STATUSES.map((status) => {
        const selected = value === status;
        const transition = transitions[status];
        const blocked = !selected && !transition.allowed;
        const unavailable = disabled && !blocked;
        const label = localizedStatus(status, t);
        return (
          <MotionPressable
            key={status}
            accessibilityLabel={label}
            accessibilityHint={
              blocked
                ? transition.reason === 'already_started'
                  ? t('details.statusBlockedAlreadyStarted')
                  : t('details.statusBlockedAiringInProgress')
                : undefined
            }
            accessibilityRole="radio"
            accessibilityState={{
              selected,
              disabled: unavailable,
              busy: selected && saving,
            }}
            className={cn(
              'min-h-11 flex-row items-center gap-2 rounded-lg border border-border bg-card px-3',
              selected && 'border-primary-emphasis bg-primary/20',
              blocked && 'border-border/60 bg-background opacity-60',
              unavailable && 'opacity-50',
            )}
            disabled={unavailable}
            onPress={() => {
              if (selected) return;
              if (!transition.allowed) onBlocked(transition.reason);
              else onChange(status);
            }}
          >
            {blocked ? (
              <Icon
                as={LockKeyhole}
                className="size-3.5 text-muted-foreground"
              />
            ) : null}
            {selected ? (
              <Animated.View
                entering={ZoomIn.duration(160).reduceMotion(
                  ReduceMotion.System,
                )}
              >
                <Icon as={Check} className="size-3.5 text-primary-emphasis" />
              </Animated.View>
            ) : null}
            <Text
              className={cn(
                'font-semibold',
                selected && 'text-primary-emphasis',
              )}
            >
              {label}
            </Text>
          </MotionPressable>
        );
      })}
    </View>
  );
}
