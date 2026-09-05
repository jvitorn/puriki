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

// Two fixed-column rows (3 + 2) instead of a single flex-wrap row: every
// pill occupies an equal-width flex-1 slot, and a hidden spacer fills row 2's
// trailing slot so its columns line up with row 1's. This keeps the grid
// geometry stable across all five states — unlike flex-wrap, it never
// reflows when the selected pill's content (e.g. the check icon) changes
// width.
const STATUS_ROW_COLUMNS = 3;
const STATUS_ROWS: readonly (readonly AnimeListStatus[])[] = [
  ANIME_STATUSES.slice(0, STATUS_ROW_COLUMNS),
  ANIME_STATUSES.slice(STATUS_ROW_COLUMNS),
];

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
      className="gap-2"
    >
      {STATUS_ROWS.map((row, rowIndex) => (
        <View className="flex-row gap-2" key={rowIndex}>
          {row.map((status) => {
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
                  'min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-border bg-card px-2',
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
                <View className="size-3.5 items-center justify-center">
                  {blocked ? (
                    <Icon
                      as={LockKeyhole}
                      className="size-3.5 text-muted-foreground"
                    />
                  ) : selected ? (
                    <Animated.View
                      entering={ZoomIn.duration(160).reduceMotion(
                        ReduceMotion.System,
                      )}
                    >
                      <Icon
                        as={Check}
                        className="size-3.5 text-primary-emphasis"
                      />
                    </Animated.View>
                  ) : null}
                </View>
                <Text
                  className={cn(
                    'shrink font-semibold',
                    selected && 'text-primary-emphasis',
                  )}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </MotionPressable>
            );
          })}
          {row.length < STATUS_ROW_COLUMNS
            ? Array.from({ length: STATUS_ROW_COLUMNS - row.length }).map(
                (_, index) => (
                  <View className="flex-1" key={`spacer-${index}`} />
                ),
              )
            : null}
        </View>
      ))}
    </View>
  );
}
