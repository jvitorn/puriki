import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/presentation/theme/tokens';

export function Skeleton({
  height = 20,
  width = '100%',
}: {
  height?: number;
  width?: number | `${number}%`;
}) {
  return (
    <View
      accessibilityLabel="Loading content"
      style={[styles.base, { height, width }]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    opacity: 0.72,
  },
});
