import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, typography } from '@/presentation/theme/tokens';

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'caption';

interface AppTextProps extends ComponentProps<typeof Text> {
  variant?: TextVariant;
  muted?: boolean;
}

export function AppText({
  variant = 'body',
  muted = false,
  style,
  ...props
}: AppTextProps) {
  return (
    <Text
      style={[styles.base, styles[variant], muted && styles.muted, style]}
      allowFontScaling
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  base: { color: colors.text, fontSize: typography.body, lineHeight: 22 },
  muted: { color: colors.textMuted },
  display: { fontSize: typography.display, lineHeight: 39, fontWeight: '800' },
  title: { fontSize: typography.title, lineHeight: 30, fontWeight: '800' },
  heading: { fontSize: typography.heading, lineHeight: 25, fontWeight: '700' },
  body: { fontSize: typography.body, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: typography.caption, lineHeight: 17, fontWeight: '600' },
});
