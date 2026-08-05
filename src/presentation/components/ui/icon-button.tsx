import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radii, spacing } from '@/presentation/theme/tokens';

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onPress(): void;
  disabled?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  disabled = false,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon color={colors.text} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    margin: spacing.xs,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
});
