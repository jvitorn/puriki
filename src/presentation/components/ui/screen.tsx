import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/presentation/theme/tokens';

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  padded?: boolean;
  header?: ReactNode;
  testID?: string;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  header,
  testID,
}: ScreenProps) {
  const content = (
    <View style={[styles.content, padded && styles.padded]}>{children}</View>
  );
  return (
    <SafeAreaView
      className="flex-1 bg-ink"
      style={styles.safeArea}
      edges={['top']}
      testID={testID}
    >
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  padded: { paddingHorizontal: spacing.md },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.xxl },
});
