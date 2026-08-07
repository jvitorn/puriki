import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  RefreshCcw,
  RotateCcw,
  ServerCog,
  Trash2,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useResetSessionData } from '@/application/mutations/anime-mutations';
import { runJikanConnectivityDiagnostic } from '@/infrastructure/api/jikan/jikan-diagnostics';
import type { JikanConnectivityResult } from '@/infrastructure/api/jikan/jikan-diagnostics';
import { runMalConnectivityDiagnostic } from '@/infrastructure/api/mal/mal-diagnostics';
import type { MalConnectivityResult } from '@/infrastructure/api/mal/mal-diagnostics';
import { AppText } from '@/presentation/components/ui/app-text';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Screen } from '@/presentation/components/ui/screen';
import {
  type DataSourceMode,
  useRepositories,
} from '@/presentation/providers/repository-provider';
import { colors, radii, spacing } from '@/presentation/theme/tokens';

const DATA_SOURCE_OPTIONS: readonly {
  mode: DataSourceMode;
  label: string;
  description: string;
}[] = [
  {
    mode: 'automatic',
    label: 'Automatic',
    description: 'Uses Jikan first and falls back to MyAnimeList.',
  },
  {
    mode: 'jikan',
    label: 'Jikan only',
    description: 'Uses Jikan without the MyAnimeList fallback.',
  },
  {
    mode: 'mal',
    label: 'MyAnimeList only',
    description: 'Uses the public MyAnimeList catalog directly.',
  },
  {
    mode: 'mock',
    label: 'Mock',
    description: 'Uses deterministic local development data.',
  },
];

function readableSource(source: string | null): string {
  if (source === 'mal') return 'MyAnimeList';
  if (source === 'jikan') return 'Jikan';
  if (source === 'cache') return 'Previous valid cache';
  if (source === 'mock') return 'Mock';
  return 'No successful request yet';
}

function readableMode(mode: DataSourceMode): string {
  return (
    DATA_SOURCE_OPTIONS.find((option) => option.mode === mode)?.label ?? mode
  );
}

export function SettingsScreen() {
  const queryClient = useQueryClient();
  const {
    behavior,
    catalogRuntimeStatus,
    clearAllCatalogCaches,
    clearCatalogCache,
    malConfigured,
    mode,
    refreshCurrentSample,
    selectDataSourceMode,
    setDelayMode,
    setForceErrors,
  } = useRepositories();
  const reset = useResetSessionData();
  const refresh = useMutation({ mutationFn: refreshCurrentSample });
  const diagnosticLock = useRef(false);
  const [pendingDiagnostic, setPendingDiagnostic] = useState<
    'mal' | 'jikan' | null
  >(null);
  const [malDiagnostic, setMalDiagnostic] =
    useState<MalConnectivityResult | null>(null);
  const [jikanDiagnostic, setJikanDiagnostic] =
    useState<JikanConnectivityResult | null>(null);
  const diagnosticPending = pendingDiagnostic !== null;
  const testMal = async () => {
    if (diagnosticLock.current) return;
    diagnosticLock.current = true;
    setPendingDiagnostic('mal');
    setMalDiagnostic(null);
    try {
      setMalDiagnostic(await runMalConnectivityDiagnostic());
    } catch {
      setMalDiagnostic({
        ok: false,
        platform: 'unknown',
        status: null,
        elapsedMs: 0,
        errorKind: 'http',
        message: 'The MyAnimeList API request failed.',
        sampleAnimeTitle: null,
      });
    } finally {
      diagnosticLock.current = false;
      setPendingDiagnostic(null);
    }
  };
  const testJikan = async () => {
    if (diagnosticLock.current) return;
    diagnosticLock.current = true;
    setPendingDiagnostic('jikan');
    setJikanDiagnostic(null);
    try {
      setJikanDiagnostic(await runJikanConnectivityDiagnostic());
    } catch {
      setJikanDiagnostic({
        ok: false,
        platform: 'unknown',
        status: null,
        elapsedMs: 0,
        errorKind: 'http',
        message: 'The Jikan connectivity request failed.',
      });
    } finally {
      diagnosticLock.current = false;
      setPendingDiagnostic(null);
    }
  };
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
        <Badge label="PUBLIC CATALOG" accent />
      </View>
      <View style={styles.card}>
        <AppText variant="heading">About Purikuki</AppText>
        <AppText muted>
          Purikuki combines a read-only public anime catalog with a session-only
          simulated personal list.
        </AppText>
        <AppText variant="caption" muted>
          Version 1.0.0 • Jikan primary • MyAnimeList fallback
        </AppText>
      </View>
      <View style={styles.section}>
        <AppText variant="heading">Data source</AppText>
        <AppText muted>
          Changing the source clears screen data and creates a compatible
          catalog session so provider IDs are never mixed.
        </AppText>
        {DATA_SOURCE_OPTIONS.map((option) => {
          const selected = mode === option.mode;
          const disabled = option.mode === 'mal' && !malConfigured;
          return (
            <Pressable
              key={option.mode}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={option.description}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => selectDataSourceMode(option.mode)}
              style={({ pressed }) => [
                styles.sourceOption,
                selected && styles.sourceOptionSelected,
                disabled && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.copy}>
                <AppText style={selected ? styles.selectedLabel : undefined}>
                  {option.label}
                </AppText>
                <AppText variant="caption" muted>
                  {option.description}
                </AppText>
                {option.mode === 'mal' && !malConfigured ? (
                  <AppText variant="caption" style={styles.danger}>
                    MyAnimeList Client ID is not configured.
                  </AppText>
                ) : null}
              </View>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.radio, selected && styles.radioSelected]}
              />
            </Pressable>
          );
        })}
        {!malConfigured ? (
          <AppText variant="caption" style={styles.warning}>
            Automatic mode remains available, but its MyAnimeList fallback is
            unavailable until the application Client ID is configured.
          </AppText>
        ) : null}
      </View>
      <View style={styles.section}>
        <AppText variant="heading">Runtime catalog status</AppText>
        <View style={styles.card}>
          <AppText>Mode: {readableMode(catalogRuntimeStatus.mode)}</AppText>
          <AppText>
            Last successful source:{' '}
            {readableSource(catalogRuntimeStatus.lastSuccessfulSource)}
          </AppText>
          {catalogRuntimeStatus.jikanCircuitState ? (
            <AppText>
              Jikan circuit:{' '}
              {catalogRuntimeStatus.jikanCircuitState.replace('_', ' ')}
            </AppText>
          ) : null}
          {catalogRuntimeStatus.lastFallbackAt ? (
            <AppText variant="caption" muted>
              Last fallback: {catalogRuntimeStatus.lastFallbackAt}
            </AppText>
          ) : null}
          {catalogRuntimeStatus.mode === 'automatic' &&
          catalogRuntimeStatus.lastSuccessfulSource === 'mal' ? (
            <AppText variant="caption" style={styles.warning}>
              Jikan failed, so MyAnimeList data is being used.
            </AppText>
          ) : null}
          {catalogRuntimeStatus.mode === 'automatic' &&
          catalogRuntimeStatus.lastSuccessfulSource === 'cache' ? (
            <AppText variant="caption" style={styles.warning}>
              Both catalog providers are currently unavailable. Previously
              loaded data is still available.
            </AppText>
          ) : null}
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
          Personal-list changes and catalog caches remain in memory and reset
          when the application process restarts.
        </AppText>
        <Button
          label="Reset current list"
          variant="secondary"
          loading={reset.isPending}
          onPress={() => reset.mutate()}
          icon={<RotateCcw size={18} color={colors.text} />}
        />
        <Button
          label="Refresh active catalog"
          variant="secondary"
          loading={refresh.isPending}
          onPress={() => refresh.mutate()}
          icon={<RefreshCcw size={18} color={colors.text} />}
        />
        <Button
          label="Clear active catalog cache"
          variant="secondary"
          onPress={clearCatalogCache}
          icon={<Trash2 size={18} color={colors.text} />}
        />
        <Button
          label="Clear all catalog caches"
          variant="secondary"
          onPress={clearAllCatalogCaches}
          icon={<ServerCog size={18} color={colors.text} />}
        />
        {reset.isSuccess || refresh.isSuccess ? (
          <AppText accessibilityRole="alert" style={styles.success}>
            Session data refreshed.
          </AppText>
        ) : null}
        {reset.isError || refresh.isError ? (
          <AppText accessibilityRole="alert" style={styles.danger}>
            {refresh.isError
              ? 'The active catalog could not be refreshed. Previously loaded data is still available.'
              : 'Refresh failed. Check the active data source and try again.'}
          </AppText>
        ) : null}
      </View>
      <View style={styles.section}>
        <AppText variant="heading">Service diagnostics</AppText>
        <AppText muted>
          Test each public provider independently. Diagnostic requests bypass
          catalog caches and the automatic fallback.
        </AppText>
        <Button
          label={
            pendingDiagnostic === 'mal'
              ? 'Testing MyAnimeList API…'
              : 'Test MyAnimeList API'
          }
          accessibilityLabel={
            pendingDiagnostic === 'mal'
              ? 'Testing MyAnimeList API…'
              : 'Test MyAnimeList API'
          }
          variant="secondary"
          disabled={diagnosticPending}
          onPress={() => void testMal()}
          icon={<Activity size={18} color={colors.text} />}
        />
        <AppText variant="caption" muted>
          Calls the public MyAnimeList API directly using the application Client
          ID. Jikan and the automatic fallback are bypassed. No user account or
          OAuth token is used.
        </AppText>
        {malDiagnostic ? (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.diagnosticResult}
          >
            <AppText style={malDiagnostic.ok ? styles.success : styles.danger}>
              {malDiagnostic.message}
            </AppText>
            {malDiagnostic.status !== null ? (
              <AppText variant="caption" muted>
                HTTP {malDiagnostic.status} • {malDiagnostic.elapsedMs} ms
              </AppText>
            ) : null}
            {malDiagnostic.sampleAnimeTitle ? (
              <AppText variant="caption" muted>
                Sample result: {malDiagnostic.sampleAnimeTitle}
              </AppText>
            ) : null}
          </View>
        ) : null}
        <Button
          label={
            pendingDiagnostic === 'jikan'
              ? 'Testing Jikan API…'
              : 'Test Jikan API'
          }
          accessibilityLabel={
            pendingDiagnostic === 'jikan'
              ? 'Testing Jikan API…'
              : 'Test Jikan API'
          }
          variant="secondary"
          disabled={diagnosticPending}
          onPress={() => void testJikan()}
          icon={<Activity size={18} color={colors.text} />}
        />
        {jikanDiagnostic ? (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.diagnosticResult}
          >
            <AppText
              style={jikanDiagnostic.ok ? styles.success : styles.danger}
            >
              {jikanDiagnostic.message}
            </AppText>
            {jikanDiagnostic.status !== null ? (
              <AppText variant="caption" muted>
                HTTP {jikanDiagnostic.status} • {jikanDiagnostic.elapsedMs} ms
              </AppText>
            ) : null}
          </View>
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
  sourceOption: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceElevated,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioSelected: {
    borderWidth: 6,
    borderColor: colors.primary,
  },
  selectedLabel: { color: colors.primary, fontWeight: '800' },
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
  diagnosticResult: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.78 },
  success: { color: colors.success },
  warning: { color: colors.warning },
  danger: { color: colors.danger },
});
