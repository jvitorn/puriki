import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCcw, RotateCcw, Trash2 } from 'lucide-react-native';
import { StyleSheet, Switch, View } from 'react-native';

import { useResetSessionData } from '@/application/mutations/anime-mutations';
import { AppText } from '@/presentation/components/ui/app-text';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Screen } from '@/presentation/components/ui/screen';
import { useRepositories } from '@/presentation/providers/repository-provider';
import { colors, radii, spacing } from '@/presentation/theme/tokens';

export function SettingsScreen() {
  const queryClient = useQueryClient();
  const {
    behavior,
    clearCatalogCache,
    mode,
    refreshCurrentSample,
    selectDataSourceMode,
    setDelayMode,
    setForceErrors,
  } = useRepositories();
  const reset = useResetSessionData();
  const refresh = useMutation({ mutationFn: refreshCurrentSample });
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
        <Badge label="PHASE 2A" accent />
      </View>
      <View style={styles.card}>
        <AppText variant="heading">About Purikuki</AppText>
        <AppText muted>
          Purikuki combines a read-only real anime catalog with a session-only
          simulated personal list.
        </AppText>
        <AppText variant="caption" muted>
          Version 1.0.0 • Jikan integration
        </AppText>
      </View>
      <View style={styles.section}>
        <AppText variant="heading">Data source</AppText>
        <AppText muted>
          Jikan is active by default. Switching sources clears cached screen
          data so catalog IDs are never mixed.
        </AppText>
        <View style={styles.setting}>
          <View style={styles.copy}>
            <AppText>Use Jikan data source</AppText>
            <AppText variant="caption" muted>
              {mode === 'jikan'
                ? 'Real read-only anime metadata'
                : 'Deterministic local development catalog'}
            </AppText>
          </View>
          <Switch
            accessibilityLabel="Use Jikan data source"
            value={mode === 'jikan'}
            onValueChange={(enabled) =>
              selectDataSourceMode(enabled ? 'jikan' : 'mock')
            }
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
      </View>
      {mode === 'mock' ? (
        <View style={styles.section}>
          <AppText variant="heading">Mock environment</AppText>
          <AppText muted>
            These controls affect the current mock session only.
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
      ) : null}
      <View style={styles.section}>
        <AppText variant="heading">Session data</AppText>
        <AppText muted>
          Personal-list changes and Jikan catalog caches remain in memory and
          reset when the application process restarts.
        </AppText>
        <Button
          label="Reset current list"
          variant="secondary"
          loading={reset.isPending}
          onPress={() => reset.mutate()}
          icon={<RotateCcw size={18} color={colors.text} />}
        />
        <Button
          label="Clear catalog cache"
          variant="secondary"
          onPress={clearCatalogCache}
          icon={<Trash2 size={18} color={colors.text} />}
        />
        {mode === 'jikan' ? (
          <Button
            label="Refresh Jikan sample"
            variant="secondary"
            loading={refresh.isPending}
            onPress={() => refresh.mutate()}
            icon={<RefreshCcw size={18} color={colors.text} />}
          />
        ) : null}
        {reset.isSuccess || refresh.isSuccess ? (
          <AppText accessibilityRole="alert" style={styles.success}>
            Session data refreshed.
          </AppText>
        ) : null}
        {reset.isError || refresh.isError ? (
          <AppText accessibilityRole="alert" style={styles.danger}>
            {refresh.isError && mode === 'jikan'
              ? 'The catalog could not be refreshed. Previously loaded data is still available.'
              : 'Refresh failed. Check the active data source and try again.'}
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
