import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react-native';
import { StyleSheet, Switch, View } from 'react-native';

import { useResetMockData } from '@/application/mutations/anime-mutations';
import { AppText } from '@/presentation/components/ui/app-text';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Screen } from '@/presentation/components/ui/screen';
import { useRepositories } from '@/presentation/providers/repository-provider';
import { colors, radii, spacing } from '@/presentation/theme/tokens';

export function SettingsScreen() {
  const queryClient = useQueryClient();
  const { behavior, setDelayMode, setForceErrors } = useRepositories();
  const reset = useResetMockData();
  const toggleDelay = (enabled: boolean) => {
    setDelayMode(enabled ? 'normal' : 'none');
    void queryClient.invalidateQueries();
  };
  const toggleErrors = (enabled: boolean) => {
    setForceErrors(enabled);
    void queryClient.invalidateQueries();
  };
  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="title">Settings</AppText>
        <Badge label="PHASE 1" accent />
      </View>
      <View style={styles.card}>
        <AppText variant="heading">About Purikuki</AppText>
        <AppText muted>
          Purikuki is a focused anime list manager with a streaming-inspired
          browsing experience.
        </AppText>
        <AppText variant="caption" muted>
          Version 1.0.0 • Local prototype
        </AppText>
      </View>
      <View style={styles.section}>
        <AppText variant="heading">Mock environment</AppText>
        <AppText muted>
          These controls affect the current app session only.
        </AppText>
        <View style={styles.setting}>
          <View style={styles.copy}>
            <AppText>Simulated request delay</AppText>
            <AppText variant="caption" muted>
              Add a short delay to repository operations.
            </AppText>
          </View>
          <Switch
            accessibilityLabel="Simulated request delay"
            value={behavior.delayMode !== 'none'}
            onValueChange={toggleDelay}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
        <View style={styles.setting}>
          <View style={styles.copy}>
            <AppText>Force repository errors</AppText>
            <AppText variant="caption" muted>
              Exercise loading recovery and error states.
            </AppText>
          </View>
          <Switch
            accessibilityLabel="Force repository errors"
            value={behavior.forceErrors}
            onValueChange={toggleErrors}
            trackColor={{ false: colors.border, true: colors.danger }}
          />
        </View>
      </View>
      <View style={styles.section}>
        <AppText variant="heading">Local data</AppText>
        <AppText muted>
          This phase uses reproducible mock data. It never sends anime data or
          user credentials to a server.
        </AppText>
        <Button
          label="Reset mock data"
          variant="secondary"
          loading={reset.isPending}
          onPress={() => reset.mutate()}
          icon={<RotateCcw size={18} color={colors.text} />}
        />
        {reset.isSuccess ? (
          <AppText accessibilityRole="alert" style={styles.success}>
            Mock data restored.
          </AppText>
        ) : null}
        {reset.isError ? (
          <AppText accessibilityRole="alert" style={styles.danger}>
            Reset failed. Turn off forced errors and try again.
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 70,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  section: { marginTop: spacing.lg, gap: spacing.md },
  setting: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copy: { flex: 1, gap: spacing.xs },
  success: { color: colors.success },
  danger: { color: colors.danger },
});
