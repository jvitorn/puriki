import { Activity, RotateCcw, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import type {
  AniListDiagnosticReport,
  CatalogOperationFamily,
  MalConnectivityReport,
  PrimaryCatalogHealth,
} from '@/application/runtime/application-runtime';
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

const RUNTIME_OPERATION_FAMILIES = [
  'popular',
  'seasonal',
  'upcoming',
  'search',
  'details',
] as const satisfies readonly CatalogOperationFamily[];

function readableSource(
  source: string | null,
  t: (key: string) => string,
): string {
  if (source === 'anilist') return 'AniList';
  if (source === 'mal') return 'MyAnimeList';
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
  health: PrimaryCatalogHealth,
  t: (key: string) => string,
): string {
  if (health === 'healthy') return t('settings.healthHealthy');
  if (health === 'degraded') return t('settings.healthDegraded');
  if (health === 'rate_limited') return t('settings.healthRateLimited');
  return t('settings.healthUnavailable');
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
  const {
    clearCatalogCache,
    resetPrimaryCircuits,
    runAniListDiagnostic,
    runMalDiagnostic,
  } = useRepositories();
  const diagnosticLock = useRef(false);
  const [pendingDiagnostic, setPendingDiagnostic] = useState<
    'mal' | 'anilist' | null
  >(null);
  const [anilistDiagnostic, setAniListDiagnostic] = useState<
    AniListDiagnosticReport | 'failed' | null
  >(null);
  const [malDiagnostic, setMalDiagnostic] =
    useState<MalConnectivityReport | null>(null);
  const diagnosticPending = pendingDiagnostic !== null;

  const runExclusive = async <T,>(
    source: 'mal' | 'anilist',
    operation: () => Promise<T>,
  ): Promise<T | undefined> => {
    if (diagnosticLock.current) return;
    diagnosticLock.current = true;
    setPendingDiagnostic(source);
    try {
      return await operation();
    } finally {
      diagnosticLock.current = false;
      setPendingDiagnostic(null);
    }
  };

  const testAniList = async () => {
    setAniListDiagnostic(null);
    try {
      const result = await runExclusive('anilist', runAniListDiagnostic);
      if (result) setAniListDiagnostic(result);
    } catch {
      setAniListDiagnostic('failed');
    }
  };

  const testMal = async () => {
    setMalDiagnostic(null);
    try {
      const result = await runExclusive('mal', runMalDiagnostic);
      if (result) setMalDiagnostic(result);
    } catch {
      setMalDiagnostic(null);
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
              pendingDiagnostic === 'anilist'
                ? t('settings.testingAniList')
                : t('settings.testAniList')
            }
            disabled={diagnosticPending}
            variant="outline"
            onPress={() => void testAniList()}
          >
            <Icon as={Activity} className="size-4" />
            <Text>
              {pendingDiagnostic === 'anilist'
                ? t('settings.testingAniList')
                : t('settings.testAniList')}
            </Text>
          </Button>
          {anilistDiagnostic === 'failed' ? (
            <Text accessibilityRole="alert" className="text-destructive">
              {t('settings.diagnosticFailed')}
            </Text>
          ) : anilistDiagnostic ? (
            <View
              accessible
              accessibilityLiveRegion="polite"
              className="gap-2 rounded-xl bg-background/50 p-3"
            >
              <Text
                className={
                  anilistDiagnostic.summary.passed ===
                  anilistDiagnostic.summary.total
                    ? 'text-success'
                    : 'text-warning'
                }
              >
                {t('settings.anilistDiagnosticResult', {
                  passed: anilistDiagnostic.summary.passed,
                  total: anilistDiagnostic.summary.total,
                })}
              </Text>
              {anilistDiagnostic.results.map((result) => (
                <Text key={result.testName} variant="caption" muted>
                  {t(`settings.operation.${result.testName}`)}:{' '}
                  {result.status ?? '—'} •{' '}
                  {formatNumber(result.elapsedMs, language)} ms •{' '}
                  {result.rateLimit.remaining ?? '—'}
                </Text>
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
          {malDiagnostic ? (
            <View accessible accessibilityRole="alert" className="gap-1">
              <Text
                className={
                  malDiagnostic.ok ? 'text-success' : 'text-destructive'
                }
              >
                {malDiagnostic.ok
                  ? t('settings.malSuccess')
                  : malDiagnostic.message}
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
              {t('settings.anilistHealth', {
                health: readableHealth(runtimeStatus.primaryHealth, t),
              })}
            </Text>
            {runtimeStatus.primaryRateLimitedUntil ? (
              <Text variant="caption" muted>
                {t('settings.rateLimitedUntil', {
                  date: formatDateTime(
                    runtimeStatus.primaryRateLimitedUntil,
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
          <Button variant="outline" onPress={resetPrimaryCircuits}>
            <Icon as={RotateCcw} className="size-4" />
            <Text>{t('settings.resetPrimaryCircuits')}</Text>
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
