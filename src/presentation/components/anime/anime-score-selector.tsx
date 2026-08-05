import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { AppText } from '@/presentation/components/ui/app-text';
import { colors, radii, spacing } from '@/presentation/theme/tokens';

const scores = Array.from({ length: 10 }, (_, index) => index + 1);

export function AnimeScoreSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange(score: number | null): void;
  disabled?: boolean;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel="Your score"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Clear score"
        accessibilityState={{ selected: value === null, disabled }}
        disabled={disabled}
        onPress={() => onChange(null)}
        style={[styles.option, value === null && styles.selected]}
      >
        <AppText variant="caption">None</AppText>
      </Pressable>
      {scores.map((score) => (
        <Pressable
          key={score}
          accessibilityRole="button"
          accessibilityLabel={`Score ${score}`}
          accessibilityState={{ selected: value === score, disabled }}
          disabled={disabled}
          onPress={() => onChange(score)}
          style={[styles.option, value === score && styles.selected]}
        >
          <AppText variant="caption">{score}</AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  option: {
    minWidth: 42,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
});
