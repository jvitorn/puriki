import { ScrollView, StyleSheet, Pressable } from 'react-native';

import type { AnimeListStatus } from '@/domain/models/anime';
import { AppText } from '@/presentation/components/ui/app-text';
import { colors, radii, spacing } from '@/presentation/theme/tokens';
import { ANIME_STATUSES, STATUS_LABELS } from '@/shared/constants/anime-status';

export function AnimeStatusSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: AnimeListStatus;
  onChange(status: AnimeListStatus): void;
  disabled?: boolean;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel="Anime list status"
    >
      <>
        {ANIME_STATUSES.map((status) => {
          const selected = status === value;
          return (
            <Pressable
              key={status}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(status)}
              style={[styles.option, selected && styles.selected]}
            >
              <AppText
                variant="caption"
                style={selected && styles.selectedText}
              >
                {STATUS_LABELS[status]}
              </AppText>
            </Pressable>
          );
        })}
      </>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  option: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectedText: { color: colors.text },
});
