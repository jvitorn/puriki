import { StyleSheet, View } from 'react-native';

import { AppText } from '@/presentation/components/ui/app-text';
import { spacing } from '@/presentation/theme/tokens';

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.container}>
      <AppText variant="heading">{title}</AppText>
      {subtitle ? (
        <AppText variant="caption" muted>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs, marginBottom: spacing.md },
});
