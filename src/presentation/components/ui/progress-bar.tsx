import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/presentation/theme/tokens';

export function ProgressBar({
  value,
  accessibilityLabel = 'Episode progress',
}: {
  value: number;
  accessibilityLabel?: string;
}) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(normalized * 100),
      }}
      style={styles.track}
    >
      <View style={[styles.fill, { width: `${normalized * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
});
