import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/presentation/theme/tokens';

export function ProgressBar({
  value,
  accessibilityLabel,
  pending = false,
}: {
  value: number;
  accessibilityLabel?: string;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const normalized = Math.max(0, Math.min(1, value));
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(normalized);
  const pendingValue = useSharedValue(pending ? 1 : 0);
  useEffect(() => {
    const config = {
      duration: reduceMotion ? 0 : 300,
      easing: Easing.out(Easing.quad),
    };
    progress.value = withTiming(normalized, config);
    pendingValue.value = withTiming(pending ? 1 : 0, config);
  }, [normalized, pending, pendingValue, progress, reduceMotion]);
  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor:
      pendingValue.value >= 0.5 ? colors.textMuted : colors.primary,
    transform: [{ scaleX: progress.value }],
  }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? t('details.episodeProgress')}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(normalized * 100),
      }}
      className="h-1 overflow-hidden rounded-full bg-border"
    >
      <Animated.View
        className="h-full w-full origin-left rounded-full"
        style={fillStyle}
      />
    </View>
  );
}
