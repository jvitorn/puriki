import { Minus, Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import {
  canDecrementProgress,
  canIncrementProgress,
} from '@/domain/rules/anime-progress';
import { AppText } from '@/presentation/components/ui/app-text';
import { IconButton } from '@/presentation/components/ui/icon-button';
import { spacing } from '@/presentation/theme/tokens';

interface EpisodeProgressControlProps {
  current: number;
  total: number | null;
  onChange(next: number): void;
  disabled?: boolean;
}

export function EpisodeProgressControl({
  current,
  total,
  onChange,
  disabled = false,
}: EpisodeProgressControlProps) {
  const canDecrement = !disabled && canDecrementProgress(current);
  const canIncrement = !disabled && canIncrementProgress(current, total);
  return (
    <View style={styles.container}>
      <IconButton
        icon={Minus}
        label="Decrease watched episodes"
        disabled={!canDecrement}
        onPress={() => onChange(current - 1)}
      />
      <View
        accessible
        accessibilityLabel={`Episode progress: ${current} of ${total ?? 'unknown'}`}
        style={styles.value}
      >
        <AppText variant="title">{current}</AppText>
        <AppText variant="caption" muted>
          of {total ?? '?'} episodes
        </AppText>
      </View>
      <IconButton
        icon={Plus}
        label="Increase watched episodes"
        disabled={!canIncrement}
        onPress={() => onChange(current + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  value: { minWidth: 105, alignItems: 'center' },
});
