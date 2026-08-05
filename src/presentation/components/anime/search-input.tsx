import { Search, X } from 'lucide-react-native';
import { StyleSheet, TextInput, View, Pressable } from 'react-native';

import {
  colors,
  radii,
  spacing,
  typography,
} from '@/presentation/theme/tokens';

export function SearchInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText(value: string): void;
}) {
  return (
    <View style={styles.container}>
      <Search size={20} color={colors.textMuted} />
      <TextInput
        accessibilityLabel="Search anime"
        placeholder="Search titles or alternative titles"
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={styles.input}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          onPress={() => onChangeText('')}
        >
          <X size={20} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: typography.body,
    paddingVertical: spacing.sm,
  },
});
