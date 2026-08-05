import { StyleSheet, View } from 'react-native';

import { AppText } from '@/presentation/components/ui/app-text';
import { colors, radii, spacing } from '@/presentation/theme/tokens';

export function Badge({
  label,
  accent = false,
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.badge, accent && styles.accent]}>
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accent: { backgroundColor: colors.primary, borderColor: colors.primary },
});
