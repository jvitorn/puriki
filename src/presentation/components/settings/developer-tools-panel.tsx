import { Activity, RotateCcw, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

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
import { useAppLanguage } from '@/localization/localization-provider';
import { formatDateTime, formatNumber } from '@/localization/localized-values';
import { Button } from '@/presentation/components/ui/button';
import { Card } from '@/presentation/components/ui/card';
import { Icon } from '@/presentation/components/ui/icon';
import { Separator } from '@/presentation/components/ui/separator';
import { Text } from '@/presentation/components/ui/text';
import {
  useCatalogRuntimeStatus,
  useRepositories,
} from '@/presentation/providers/repository-provider';
import { cn } from '@/shared/rnr/utils';

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
  return t('settings.sourceNone');
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

export function DeveloperToolsPanel({
  appVersion,
  onDisable,
}: {
  appVersion: string;
  onDisable(): void;
}) {
  const { t } = useTranslation();
  const { language } = useAppLanguage();
  const runtimeStatus = useCatalogRuntimeStatus();
  const { clearCatalogCache, resetJikanCircuits, runJikanDiagnostic } =
    useRepositories();
  const diagnosticLock = useRef(false);
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

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text variant="heading">{t('settings.developerTools')}</Text>
        <Text muted>{t('settings.developerDescription')}</Text>
      </View>
      <Card className="gap-5 border-0 p-4 py-4">
        <View className="gap-3">
          <Text className="font-bold">{t('settings.serviceDiagnostics')}</Text>
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
              className="gap-2 rounded-xl bg-background/50 p-3"
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
                    <Text>{t(`settings.operation.${endpoint.operation}`)}</Text>
                    <Text variant="caption" muted>
                      {endpoint.status === null
                        ? '—'
                        : t('settings.endpointResult', {
                            elapsed: formatNumber(endpoint.elapsedMs, language),
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
                    elapsed: formatNumber(malDiagnostic.elapsedMs, language),
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
        </View>

        <Separator />

        <View className="gap-3">
          <Text className="font-bold">{t('settings.catalogDiagnostics')}</Text>
          <View className="gap-2 rounded-xl bg-background/50 p-3">
            <Text>
              {t('settings.jikanHealth', {
                health: readableHealth(runtimeStatus.jikanHealth, t),
              })}
            </Text>
            {runtimeStatus.jikanRateLimitedUntil ? (
              <Text variant="caption" muted>
                {t('settings.rateLimitedUntil', {
                  date: formatDateTime(
                    runtimeStatus.jikanRateLimitedUntil,
                    language,
                  ),
                })}
              </Text>
            ) : null}
            {RUNTIME_OPERATION_FAMILIES.map((family) => {
              const operation = runtimeStatus.operations[family];
              return (
                <View
                  key={family}
                  className="gap-1 border-t border-border/60 pt-2"
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="font-bold">
                      {t(`settings.operation.${family}`)}
                    </Text>
                    <Text variant="caption" muted>
                      {readableSource(operation.lastSuccessfulSource, t)}
                    </Text>
                  </View>
                  <Text variant="caption" muted>
                    {t('settings.operationCircuit', {
                      state: readableCircuitState(operation.circuitState, t),
                    })}
                  </Text>
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
                  {operation.lastSuccessfulSource === 'mal' ? (
                    <Text variant="caption" className="text-warning">
                      {t('settings.usingMalFallback')}
                    </Text>
                  ) : null}
                  {operation.lastSuccessfulSource === 'cache' ? (
                    <Text variant="caption" className="text-warning">
                      {t('settings.usingCache')}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Button variant="outline" onPress={resetJikanCircuits}>
            <Icon as={RotateCcw} className="size-4" />
            <Text>{t('settings.resetJikanCircuits')}</Text>
          </Button>
          <Button variant="outline" onPress={clearCatalogCache}>
            <Icon as={Trash2} className="size-4" />
            <Text>{t('settings.clearCatalogCache')}</Text>
          </Button>
        </View>

        <Separator />

        <View className="gap-2">
          <Text className="font-bold">{t('settings.buildInformation')}</Text>
          <Text>{t('settings.version', { version: appVersion })}</Text>
          <Text muted>
            {t('settings.environment', { environment: Platform.OS })}
          </Text>
        </View>

        <Separator />

        <Button variant="destructive" onPress={onDisable}>
          <Text>{t('settings.disableDeveloperTools')}</Text>
        </Button>
      </Card>
    </View>
  );
}
