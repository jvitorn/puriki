import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  ListPlus,
  RefreshCcw,
  RotateCcw,
  ServerCog,
  Trash2,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useResetSessionData } from '@/application/mutations/anime-mutations';
import { queryKeys } from '@/application/queries/query-keys';
import type {
  JikanDiagnosticErrorKind,
  JikanServiceDiagnosticResult,
} from '@/infrastructure/api/jikan/jikan-diagnostics';
import { runMalConnectivityDiagnostic } from '@/infrastructure/api/mal/mal-diagnostics';
import type { MalConnectivityResult } from '@/infrastructure/api/mal/mal-diagnostics';
import type {
  JikanHealth,
  JikanOperationFamily,
} from '@/infrastructure/repositories/resilient/catalog-operation-family';
import type { LanguagePreference } from '@/localization/languages';
import { useAppLanguage } from '@/localization/localization-provider';
import { formatDateTime, formatNumber } from '@/localization/localized-values';
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
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    mode: 'automatic',
    labelKey: 'settings.sourceAutomatic',
    descriptionKey: 'settings.sourceAutomaticDescription',
  },
  {
    mode: 'jikan',
    labelKey: 'settings.sourceJikan',
    descriptionKey: 'settings.sourceJikanDescription',
  },
  {
    mode: 'mal',
    labelKey: 'settings.sourceMal',
    descriptionKey: 'settings.sourceMalDescription',
  },
  {
    mode: 'mock',
    labelKey: 'settings.sourceMock',
    descriptionKey: 'settings.sourceMockDescription',
  },
];

const LANGUAGE_OPTIONS: readonly {
  value: LanguagePreference;
  labelKey: string;
}[] = [
  { value: 'system', labelKey: 'settings.languageSystem' },
  { value: 'en', labelKey: 'settings.languageEnglish' },
  { value: 'pt-BR', labelKey: 'settings.languagePortuguese' },
  { value: 'es', labelKey: 'settings.languageSpanish' },
];

const RUNTIME_OPERATION_FAMILIES = [
  'popular',
  'seasonal',
  'upcoming',
  'search',
  'details',
] as const satisfies readonly JikanOperationFamily[];

function readableSource(
  source: string | null,
  t: (key: string) => string,
): string {
  if (source === 'mal') return 'MyAnimeList';
  if (source === 'jikan') return 'Jikan';
  if (source === 'cache') return t('settings.sourceCache');
  if (source === 'mock') return t('settings.sourceMock');
  return t('settings.sourceNone');
}

function readableMode(
  mode: DataSourceMode,
  t: (key: string) => string,
): string {
  const key = DATA_SOURCE_OPTIONS.find(
    (option) => option.mode === mode,
  )?.labelKey;
  return key ? t(key) : mode;
}

function readableCircuitState(
  state: 'closed' | 'open' | 'half_open',
  t: (key: string) => string,
): string {
  if (state === 'closed') return t('settings.circuitClosed');
  if (state === 'open') return t('settings.circuitOpen');
  return t('settings.circuitHalfOpen');
}

function readableHealth(
  health: JikanHealth,
  t: (key: string) => string,
): string {
  if (health === 'healthy') return t('settings.healthHealthy');
  if (health === 'degraded') return t('settings.healthDegraded');
  if (health === 'rate_limited') return t('settings.healthRateLimited');
  return t('settings.healthUnavailable');
}

function readableOperation(
  family: JikanOperationFamily,
  t: (key: string) => string,
): string {
  return t(`settings.operation.${family}`);
}

function diagnosticMessage(
  result: MalConnectivityResult,
  t: (key: string) => string,
): string {
  if (result.ok) return t('settings.malSuccess');
  if (result.errorKind === 'not_configured')
    return t('settings.diagnosticNotConfigured');
  if (result.errorKind === 'unauthorized')
    return t('settings.diagnosticUnauthorized');
  if (result.errorKind === 'timeout') return t('settings.diagnosticTimeout');
  if (result.errorKind === 'network') return t('settings.diagnosticNetwork');
  if (result.errorKind === 'service_unavailable')
    return t('settings.diagnosticUnavailable');
  return t('settings.diagnosticFailed');
}

function jikanEndpointMessage(
  errorKind: JikanDiagnosticErrorKind,
  t: (key: string) => string,
): string {
  if (errorKind === 'timeout') return t('settings.diagnosticTimeout');
  if (errorKind === 'network') return t('settings.diagnosticNetwork');
  if (errorKind === 'service_unavailable')
    return t('settings.diagnosticUnavailable');
  if (errorKind === 'rate_limit') return t('settings.healthRateLimited');
  if (errorKind === 'format') return t('settings.diagnosticInvalidResponse');
  if (errorKind === 'configuration')
    return t('settings.diagnosticConfiguration');
  return t('settings.diagnosticFailed');
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
  const { t } = useTranslation();
  const { language, preference, setPreference } = useAppLanguage();
  const queryClient = useQueryClient();
  const {
    behavior,
    catalogRuntimeStatus,
    clearAllCatalogCaches,
    clearCatalogCache,
    malConfigured,
    mode,
    refreshCurrentSample,
    resetJikanCircuits,
    runJikanDiagnostic,
    mockDevelopmentControls,
    selectDataSourceMode,
    setDelayMode,
    setForceErrors,
  } = useRepositories();
  const reset = useResetSessionData();
  const refresh = useMutation({ mutationFn: refreshCurrentSample });
  const generateTestList = useMutation({
    mutationFn: async () => {
      if (!mockDevelopmentControls) return;
      await mockDevelopmentControls.generateTestList();
      await queryClient.resetQueries({ queryKey: queryKeys.userListRoot });
    },
  });
  const resetGeneratedListNotice = generateTestList.reset;
  useEffect(() => {
    if (!generateTestList.isSuccess) return;
    const timeout = setTimeout(() => resetGeneratedListNotice(), 4_000);
    return () => clearTimeout(timeout);
  }, [generateTestList.isSuccess, resetGeneratedListNotice]);
  const diagnosticLock = useRef(false);
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);
  const [pendingDiagnostic, setPendingDiagnostic] = useState<
    'mal' | 'jikan' | null
  >(null);
  const [malDiagnostic, setMalDiagnostic] =
    useState<MalConnectivityResult | null>(null);
  const [jikanDiagnostic, setJikanDiagnostic] =
    useState<JikanServiceDiagnosticResult | null>(null);
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
      setJikanDiagnostic(await runJikanDiagnostic());
    } catch {
      setJikanDiagnostic({
        platform: 'unknown',
        health: 'unavailable',
        endpoints: [],
      });
    } finally {
      diagnosticLock.current = false;
      setPendingDiagnostic(null);
    }
  };

  const toggleDelay = (enabled: boolean) => {
    setDelayMode(enabled ? 'normal' : 'none');
    void queryClient.resetQueries({ type: 'active' });
  };
  const toggleErrors = (enabled: boolean) => {
    setForceErrors(enabled);
    void queryClient.resetQueries({ type: 'active' });
  };

  return (
    <Screen scroll contentClassName="gap-8 pt-2">
      <View className="min-h-16 justify-center">
        <Text variant="title">{t('settings.title')}</Text>
      </View>

      <SettingsSection title={t('settings.general')}>
        <Card className="gap-2 border-0 p-4 py-4">
          <Text className="font-bold">{t('settings.experienceTitle')}</Text>
          <Text muted>{t('settings.experienceDescription')}</Text>
        </Card>
        <View className="gap-2">
          <Text className="font-bold">{t('settings.language')}</Text>
          <Text variant="caption" muted>
            {t('settings.languageDescription')}
          </Text>
        </View>
        <RadioGroup
          value={preference}
          onValueChange={(value) =>
            void setPreference(value as LanguagePreference)
          }
        >
          {LANGUAGE_OPTIONS.map((option) => {
            const label = t(option.labelKey);
            const selected = preference === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ checked: selected }}
                className={cn(
                  'min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 active:opacity-80',
                  selected && 'border-primary bg-primary/10',
                )}
                onPress={() => void setPreference(option.value)}
              >
                <Text
                  className={cn('flex-1 font-bold', selected && 'text-primary')}
                >
                  {label}
                </Text>
                <RadioGroupItem
                  accessible={false}
                  pointerEvents="none"
                  value={option.value}
                />
              </Pressable>
            );
          })}
        </RadioGroup>
      </SettingsSection>

      <SettingsSection
        title={t('settings.dataSource')}
        description={t('settings.dataSourceDescription')}
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
            const label = t(option.labelKey);
            const description = t(option.descriptionKey);
            return (
              <Pressable
                key={option.mode}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityHint={description}
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
                    {label}
                  </Text>
                  <Text variant="caption" muted>
                    {description}
                  </Text>
                  {option.mode === 'mal' && !malConfigured ? (
                    <Text variant="caption" className="text-destructive">
                      {t('settings.malNotConfigured')}
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
            {t('settings.autoFallbackUnavailable')}
          </Text>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title={t('settings.session')}
        description={t('settings.sessionDescription')}
      >
        <View className="gap-3">
          <Button
            accessibilityLabel={
              reset.isPending
                ? t('settings.resettingList')
                : t('settings.resetList')
            }
            disabled={reset.isPending}
            variant="outline"
            onPress={() => reset.mutate()}
          >
            <Icon as={RotateCcw} className="size-4" />
            <Text>
              {reset.isPending
                ? t('settings.resettingList')
                : t('settings.resetList')}
            </Text>
          </Button>
          <Button
            accessibilityLabel={
              refresh.isPending
                ? t('settings.refreshingCatalog')
                : t('settings.refreshCatalog')
            }
            disabled={refresh.isPending}
            variant="outline"
            onPress={() => refresh.mutate()}
          >
            <Icon as={RefreshCcw} className="size-4" />
            <Text>
              {refresh.isPending
                ? t('settings.refreshingCatalog')
                : t('settings.refreshCatalog')}
            </Text>
          </Button>
          <Button variant="outline" onPress={clearCatalogCache}>
            <Icon as={Trash2} className="size-4" />
            <Text>{t('settings.clearCatalogCache')}</Text>
          </Button>
          <Button variant="destructive" onPress={clearAllCatalogCaches}>
            <Icon as={ServerCog} className="size-4" />
            <Text>{t('settings.clearAllCaches')}</Text>
          </Button>
        </View>
        {reset.isSuccess || refresh.isSuccess ? (
          <Text accessibilityRole="alert" className="text-success">
            {t('settings.sessionRefreshed')}
          </Text>
        ) : null}
        {reset.isError || refresh.isError ? (
          <Text accessibilityRole="alert" className="text-destructive">
            {refresh.isError
              ? t('settings.refreshCatalogFailed')
              : t('settings.refreshFailed')}
          </Text>
        ) : null}
      </SettingsSection>

      <Collapsible
        open={developerToolsOpen}
        onOpenChange={setDeveloperToolsOpen}
      >
        <Card className="gap-0 border-0 p-0 py-0">
          <CollapsibleTrigger
            accessibilityLabel={t('settings.developerTools')}
            accessibilityState={{ expanded: developerToolsOpen }}
            className="min-h-20 w-full flex-row items-center justify-between rounded-xl px-4 active:bg-muted/50"
          >
            <View className="flex-1 items-start gap-1">
              <Text variant="heading">{t('settings.developerTools')}</Text>
              <Text variant="caption" muted>
                {t('settings.developerDescription')}
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
              <Text className="font-bold">{t('settings.runtimeStatus')}</Text>
              <View className="gap-2 rounded-xl bg-background/50 p-3">
                <Text>
                  {t('settings.mode', {
                    mode: readableMode(catalogRuntimeStatus.mode, t),
                  })}
                </Text>
                {catalogRuntimeStatus.jikanHealth ? (
                  <Text>
                    {t('settings.jikanHealth', {
                      health: readableHealth(
                        catalogRuntimeStatus.jikanHealth,
                        t,
                      ),
                    })}
                  </Text>
                ) : null}
                {catalogRuntimeStatus.jikanRateLimitedUntil ? (
                  <Text variant="caption" muted>
                    {t('settings.rateLimitedUntil', {
                      date: formatDateTime(
                        catalogRuntimeStatus.jikanRateLimitedUntil,
                        language,
                      ),
                    })}
                  </Text>
                ) : null}
                {catalogRuntimeStatus.mode !== 'mock'
                  ? RUNTIME_OPERATION_FAMILIES.map((family) => {
                      const operation = catalogRuntimeStatus.operations[family];
                      return (
                        <View
                          key={family}
                          className="gap-1 border-t border-border/60 pt-2"
                        >
                          <View className="flex-row items-center justify-between gap-3">
                            <Text className="font-bold">
                              {readableOperation(family, t)}
                            </Text>
                            <Text variant="caption" muted>
                              {readableSource(
                                operation.lastSuccessfulSource,
                                t,
                              )}
                            </Text>
                          </View>
                          {operation.circuitState ? (
                            <Text variant="caption" muted>
                              {t('settings.operationCircuit', {
                                state: readableCircuitState(
                                  operation.circuitState,
                                  t,
                                ),
                              })}
                            </Text>
                          ) : null}
                          {operation.lastFallbackAt ? (
                            <Text variant="caption" muted>
                              {t('settings.lastFallback', {
                                date: formatDateTime(
                                  operation.lastFallbackAt,
                                  language,
                                ),
                              })}
                            </Text>
                          ) : null}
                          {catalogRuntimeStatus.mode === 'automatic' &&
                          operation.lastSuccessfulSource === 'mal' ? (
                            <Text variant="caption" className="text-warning">
                              {t('settings.usingMalFallback')}
                            </Text>
                          ) : null}
                          {catalogRuntimeStatus.mode === 'automatic' &&
                          operation.lastSuccessfulSource === 'cache' ? (
                            <Text variant="caption" className="text-warning">
                              {t('settings.usingCache')}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })
                  : null}
              </View>
              {catalogRuntimeStatus.mode === 'automatic' ? (
                <Button variant="outline" onPress={resetJikanCircuits}>
                  <Icon as={RotateCcw} className="size-4" />
                  <Text>{t('settings.resetJikanCircuits')}</Text>
                </Button>
              ) : null}
            </View>

            {mode === 'mock' ? (
              <View className="gap-3">
                <Text className="font-bold">
                  {t('settings.mockEnvironment')}
                </Text>
                <Button
                  accessibilityLabel={
                    generateTestList.isPending
                      ? t('settings.generatingList')
                      : t('settings.generateList')
                  }
                  disabled={generateTestList.isPending}
                  variant="outline"
                  onPress={() => generateTestList.mutate()}
                >
                  <Icon as={ListPlus} className="size-4" />
                  <Text>
                    {generateTestList.isPending
                      ? t('settings.generatingList')
                      : t('settings.generateList')}
                  </Text>
                </Button>
                <Text variant="caption" muted>
                  {t('settings.generateListDescription')}
                </Text>
                {generateTestList.isSuccess ? (
                  <Text accessibilityRole="alert" className="text-success">
                    {t('settings.listGenerated')}
                  </Text>
                ) : null}
                {generateTestList.isError ? (
                  <Text accessibilityRole="alert" className="text-destructive">
                    {t('settings.generateFailed')}
                  </Text>
                ) : null}
                <View className="min-h-20 flex-row items-center gap-3 rounded-xl bg-background/50 p-3">
                  <View className="flex-1 gap-1">
                    <Text>{t('settings.simulatedDelay')}</Text>
                    <Text variant="caption" muted>
                      {t('settings.simulatedDelayDescription')}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel={t('settings.simulatedDelay')}
                    checked={behavior.delayMode !== 'none'}
                    hitSlop={12}
                    onCheckedChange={toggleDelay}
                  />
                </View>
                <View className="min-h-20 flex-row items-center gap-3 rounded-xl bg-background/50 p-3">
                  <View className="flex-1 gap-1">
                    <Text>{t('settings.forceErrors')}</Text>
                    <Text variant="caption" muted>
                      {t('settings.forceErrorsDescription')}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel={t('settings.forceErrors')}
                    checked={behavior.forceErrors}
                    hitSlop={12}
                    onCheckedChange={toggleErrors}
                  />
                </View>
              </View>
            ) : null}

            <View className="gap-3">
              <Text className="font-bold">{t('settings.diagnostics')}</Text>
              <Text muted>{t('settings.diagnosticsDescription')}</Text>
              <Button
                accessibilityLabel={
                  pendingDiagnostic === 'mal'
                    ? t('settings.testingMal')
                    : t('settings.testMal')
                }
                disabled={diagnosticPending}
                variant="outline"
                onPress={() => void testMal()}
              >
                <Icon as={Activity} className="size-4" />
                <Text>
                  {pendingDiagnostic === 'mal'
                    ? t('settings.testingMal')
                    : t('settings.testMal')}
                </Text>
              </Button>
              <Text variant="caption" muted>
                {t('settings.malDiagnosticDescription')}
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
                    {diagnosticMessage(malDiagnostic, t)}
                  </Text>
                  {malDiagnostic.status !== null ? (
                    <Text variant="caption" muted>
                      {t('settings.httpResult', {
                        status: malDiagnostic.status,
                        elapsed: formatNumber(
                          malDiagnostic.elapsedMs,
                          language,
                        ),
                      })}
                    </Text>
                  ) : null}
                  {malDiagnostic.sampleAnimeTitle ? (
                    <Text variant="caption" muted>
                      {t('settings.sampleResult', {
                        title: malDiagnostic.sampleAnimeTitle,
                      })}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <Button
                accessibilityLabel={
                  pendingDiagnostic === 'jikan'
                    ? t('settings.testingJikan')
                    : t('settings.testJikan')
                }
                disabled={diagnosticPending}
                variant="outline"
                onPress={() => void testJikan()}
              >
                <Icon as={Activity} className="size-4" />
                <Text>
                  {pendingDiagnostic === 'jikan'
                    ? t('settings.testingJikan')
                    : t('settings.testJikan')}
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
                    className={cn(
                      jikanDiagnostic.health === 'healthy' && 'text-success',
                      (jikanDiagnostic.health === 'degraded' ||
                        jikanDiagnostic.health === 'rate_limited') &&
                        'text-warning',
                      jikanDiagnostic.health === 'unavailable' &&
                        'text-destructive',
                    )}
                  >
                    {t('settings.jikanHealth', {
                      health: readableHealth(jikanDiagnostic.health, t),
                    })}
                  </Text>
                  {jikanDiagnostic.endpoints.map((endpoint) => (
                    <View
                      key={endpoint.operation}
                      className="gap-1 border-t border-border/60 pt-2"
                    >
                      <View className="flex-row items-center justify-between gap-3">
                        <Text>{readableOperation(endpoint.operation, t)}</Text>
                        <Text variant="caption" muted>
                          {endpoint.status === null
                            ? '—'
                            : t('settings.endpointResult', {
                                elapsed: formatNumber(
                                  endpoint.elapsedMs,
                                  language,
                                ),
                                status: endpoint.status,
                              })}
                        </Text>
                      </View>
                      {!endpoint.ok ? (
                        <Text variant="caption" className="text-destructive">
                          {jikanEndpointMessage(endpoint.errorKind, t)}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <SettingsSection title={t('settings.about')}>
        <Card className="gap-2 border-0 p-4 py-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-bold">Purikuki</Text>
            <Badge variant="outline">
              <Text>{t('settings.version', { version: '1.0.0' })}</Text>
            </Badge>
          </View>
          <Text muted>{t('settings.aboutDescription')}</Text>
          <Text variant="caption" muted>
            {t('settings.providers')}
          </Text>
        </Card>
      </SettingsSection>
    </Screen>
  );
}
