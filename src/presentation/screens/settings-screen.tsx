import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  RotateCcw,
  ServerCog,
  Trash2,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useResetSessionData } from '@/application/mutations/anime-mutations';
import { runJikanConnectivityDiagnostic } from '@/infrastructure/api/jikan/jikan-diagnostics';
import type { JikanConnectivityResult } from '@/infrastructure/api/jikan/jikan-diagnostics';
import { runMalConnectivityDiagnostic } from '@/infrastructure/api/mal/mal-diagnostics';
import type { MalConnectivityResult } from '@/infrastructure/api/mal/mal-diagnostics';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Card } from '@/presentation/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/presentation/components/ui/collapsible';
import { Icon } from '@/presentation/components/ui/icon';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/presentation/components/ui/radio-group';
import { Screen } from '@/presentation/components/ui/screen';
import { Separator } from '@/presentation/components/ui/separator';
import { Switch } from '@/presentation/components/ui/switch';
import { Text } from '@/presentation/components/ui/text';
import {
  type DataSourceMode,
  useRepositories,
} from '@/presentation/providers/repository-provider';
import { cn } from '@/shared/rnr/utils';

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

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text variant="heading">{title}</Text>
        {description ? <Text muted>{description}</Text> : null}
      </View>
      {children}
    </View>
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
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);
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
    <Screen scroll contentClassName="gap-8 pt-2">
      <View className="min-h-16 justify-center">
        <Text variant="title">Settings</Text>
      </View>

      <SettingsSection title="General">
        <Card className="gap-2 border-0 p-4 py-4">
          <Text className="font-bold">Purikuki experience</Text>
          <Text muted>
            A dark, artwork-first interface designed for quick daily anime
            tracking.
          </Text>
        </Card>
      </SettingsSection>

      <SettingsSection
        title="Data source"
        description="Choose where Purikuki reads public catalog information."
      >
        <RadioGroup
          value={mode}
          onValueChange={(value) =>
            selectDataSourceMode(value as DataSourceMode)
          }
        >
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
                className={cn(
                  'min-h-20 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4 active:opacity-80',
                  selected && 'border-primary bg-primary/10',
                  disabled && 'opacity-40',
                )}
                disabled={disabled}
                onPress={() => selectDataSourceMode(option.mode)}
              >
                <View className="flex-1 gap-1">
                  <Text className={cn('font-bold', selected && 'text-primary')}>
                    {option.label}
                  </Text>
                  <Text variant="caption" muted>
                    {option.description}
                  </Text>
                  {option.mode === 'mal' && !malConfigured ? (
                    <Text variant="caption" className="text-destructive">
                      MyAnimeList Client ID is not configured.
                    </Text>
                  ) : null}
                </View>
                <RadioGroupItem
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  value={option.mode}
                />
              </Pressable>
            );
          })}
        </RadioGroup>
        {!malConfigured ? (
          <Text variant="caption" className="text-warning">
            Automatic mode remains available, but its MyAnimeList fallback is
            unavailable until the application Client ID is configured.
          </Text>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Session / Storage"
        description="Personal-list changes and catalog caches remain in memory until the app process restarts."
      >
        <View className="gap-3">
          <Button
            accessibilityLabel={
              reset.isPending ? 'Resetting current list…' : 'Reset current list'
            }
            disabled={reset.isPending}
            variant="outline"
            onPress={() => reset.mutate()}
          >
            <Icon as={RotateCcw} className="size-4" />
            <Text>
              {reset.isPending
                ? 'Resetting current list…'
                : 'Reset current list'}
            </Text>
          </Button>
          <Button
            accessibilityLabel={
              refresh.isPending
                ? 'Refreshing active catalog…'
                : 'Refresh active catalog'
            }
            disabled={refresh.isPending}
            variant="outline"
            onPress={() => refresh.mutate()}
          >
            <Icon as={RefreshCcw} className="size-4" />
            <Text>
              {refresh.isPending
                ? 'Refreshing active catalog…'
                : 'Refresh active catalog'}
            </Text>
          </Button>
          <Button variant="outline" onPress={clearCatalogCache}>
            <Icon as={Trash2} className="size-4" />
            <Text>Clear active catalog cache</Text>
          </Button>
          <Button variant="destructive" onPress={clearAllCatalogCaches}>
            <Icon as={ServerCog} className="size-4" />
            <Text>Clear all catalog caches</Text>
          </Button>
        </View>
        {reset.isSuccess || refresh.isSuccess ? (
          <Text accessibilityRole="alert" className="text-success">
            Session data refreshed.
          </Text>
        ) : null}
        {reset.isError || refresh.isError ? (
          <Text accessibilityRole="alert" className="text-destructive">
            {refresh.isError
              ? 'The active catalog could not be refreshed. Previously loaded data is still available.'
              : 'Refresh failed. Check the active data source and try again.'}
          </Text>
        ) : null}
      </SettingsSection>

      <Collapsible
        open={developerToolsOpen}
        onOpenChange={setDeveloperToolsOpen}
      >
        <Card className="gap-0 border-0 p-0 py-0">
          <CollapsibleTrigger
            accessibilityLabel="Developer tools"
            accessibilityState={{ expanded: developerToolsOpen }}
            className="min-h-20 w-full flex-row items-center justify-between rounded-xl px-4 active:bg-muted/50"
          >
            <View className="flex-1 items-start gap-1">
              <Text variant="heading">Developer tools</Text>
              <Text variant="caption" muted>
                Diagnostics, runtime status, and mock controls
              </Text>
            </View>
            <Icon
              as={developerToolsOpen ? ChevronUp : ChevronDown}
              className="size-5 text-muted-foreground"
            />
          </CollapsibleTrigger>

          <CollapsibleContent className="gap-5 px-4 pb-4">
            <Separator />
            <View className="gap-3">
              <Text className="font-bold">Runtime catalog status</Text>
              <View className="gap-2 rounded-xl bg-background/50 p-3">
                <Text>Mode: {readableMode(catalogRuntimeStatus.mode)}</Text>
                <Text>
                  Last successful source:{' '}
                  {readableSource(catalogRuntimeStatus.lastSuccessfulSource)}
                </Text>
                {catalogRuntimeStatus.jikanCircuitState ? (
                  <Text>
                    Jikan circuit:{' '}
                    {catalogRuntimeStatus.jikanCircuitState.replace('_', ' ')}
                  </Text>
                ) : null}
                {catalogRuntimeStatus.lastFallbackAt ? (
                  <Text variant="caption" muted>
                    Last fallback: {catalogRuntimeStatus.lastFallbackAt}
                  </Text>
                ) : null}
                {catalogRuntimeStatus.mode === 'automatic' &&
                catalogRuntimeStatus.lastSuccessfulSource === 'mal' ? (
                  <Text variant="caption" className="text-warning">
                    Jikan failed, so MyAnimeList data is being used.
                  </Text>
                ) : null}
                {catalogRuntimeStatus.mode === 'automatic' &&
                catalogRuntimeStatus.lastSuccessfulSource === 'cache' ? (
                  <Text variant="caption" className="text-warning">
                    Both catalog providers are currently unavailable. Previously
                    loaded data is still available.
                  </Text>
                ) : null}
              </View>
            </View>

            {mode === 'mock' ? (
              <View className="gap-3">
                <Text className="font-bold">Mock environment</Text>
                <View className="min-h-20 flex-row items-center gap-3 rounded-xl bg-background/50 p-3">
                  <View className="flex-1 gap-1">
                    <Text>Simulated request delay</Text>
                    <Text variant="caption" muted>
                      Add a short delay to repository operations.
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Simulated request delay"
                    checked={behavior.delayMode !== 'none'}
                    hitSlop={12}
                    onCheckedChange={toggleDelay}
                  />
                </View>
                <View className="min-h-20 flex-row items-center gap-3 rounded-xl bg-background/50 p-3">
                  <View className="flex-1 gap-1">
                    <Text>Force repository errors</Text>
                    <Text variant="caption" muted>
                      Exercise loading recovery and error states.
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Force repository errors"
                    checked={behavior.forceErrors}
                    hitSlop={12}
                    onCheckedChange={toggleErrors}
                  />
                </View>
              </View>
            ) : null}

            <View className="gap-3">
              <Text className="font-bold">Service diagnostics</Text>
              <Text muted>
                Test each provider directly. These requests bypass catalog
                caches and automatic fallback behavior.
              </Text>
              <Button
                accessibilityLabel={
                  pendingDiagnostic === 'mal'
                    ? 'Testing MyAnimeList API…'
                    : 'Test MyAnimeList API'
                }
                disabled={diagnosticPending}
                variant="outline"
                onPress={() => void testMal()}
              >
                <Icon as={Activity} className="size-4" />
                <Text>
                  {pendingDiagnostic === 'mal'
                    ? 'Testing MyAnimeList API…'
                    : 'Test MyAnimeList API'}
                </Text>
              </Button>
              <Text variant="caption" muted>
                Calls MyAnimeList using the application Client ID. No user
                account or OAuth token is used.
              </Text>
              {malDiagnostic ? (
                <View
                  accessible
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  className="gap-1 rounded-xl bg-background/50 p-3"
                >
                  <Text
                    className={
                      malDiagnostic.ok ? 'text-success' : 'text-destructive'
                    }
                  >
                    {malDiagnostic.message}
                  </Text>
                  {malDiagnostic.status !== null ? (
                    <Text variant="caption" muted>
                      HTTP {malDiagnostic.status} • {malDiagnostic.elapsedMs} ms
                    </Text>
                  ) : null}
                  {malDiagnostic.sampleAnimeTitle ? (
                    <Text variant="caption" muted>
                      Sample result: {malDiagnostic.sampleAnimeTitle}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <Button
                accessibilityLabel={
                  pendingDiagnostic === 'jikan'
                    ? 'Testing Jikan API…'
                    : 'Test Jikan API'
                }
                disabled={diagnosticPending}
                variant="outline"
                onPress={() => void testJikan()}
              >
                <Icon as={Activity} className="size-4" />
                <Text>
                  {pendingDiagnostic === 'jikan'
                    ? 'Testing Jikan API…'
                    : 'Test Jikan API'}
                </Text>
              </Button>
              {jikanDiagnostic ? (
                <View
                  accessible
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  className="gap-1 rounded-xl bg-background/50 p-3"
                >
                  <Text
                    className={
                      jikanDiagnostic.ok ? 'text-success' : 'text-destructive'
                    }
                  >
                    {jikanDiagnostic.message}
                  </Text>
                  {jikanDiagnostic.status !== null ? (
                    <Text variant="caption" muted>
                      HTTP {jikanDiagnostic.status} •{' '}
                      {jikanDiagnostic.elapsedMs} ms
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <SettingsSection title="About">
        <Card className="gap-2 border-0 p-4 py-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-bold">Purikuki</Text>
            <Badge variant="outline">
              <Text>Version 1.0.0</Text>
            </Badge>
          </View>
          <Text muted>
            A read-only public anime catalog with a session-only simulated
            personal list.
          </Text>
          <Text variant="caption" muted>
            Jikan primary • MyAnimeList fallback
          </Text>
        </Card>
      </SettingsSection>
    </Screen>
  );
}
