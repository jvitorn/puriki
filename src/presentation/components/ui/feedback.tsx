import { AlertCircle, Inbox } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/presentation/components/ui/app-text';
import { Button } from '@/presentation/components/ui/button';
import { colors, spacing } from '@/presentation/theme/tokens';

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View accessible style={styles.container} accessibilityRole="summary">
      <Inbox size={36} color={colors.textMuted} />
      <AppText variant="heading">{title}</AppText>
      <AppText muted style={styles.center}>
        {message}
      </AppText>
    </View>
  );
}

export function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View accessible style={styles.container} accessibilityRole="alert">
      <AlertCircle size={36} color={colors.danger} />
      <AppText variant="heading">Unable to load</AppText>
      <AppText muted style={styles.center}>
        {message}
      </AppText>
      {onRetry ? <Button label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  center: { textAlign: 'center' },
});
