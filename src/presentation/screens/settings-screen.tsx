import { ChevronDown, ChevronUp, Languages, Moon } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
} from 'react-native-reanimated';

import AniListIcon from '../../../assets/providers/anilist.png';
import MyAnimeListIcon from '../../../assets/providers/myanimelist.png';

import { getAppVersion } from '@/application/config/app-version';
import type { DeveloperSettingsStore } from '@/application/runtime/application-runtime';
import type { AuthProviderId } from '@/domain/models/auth';
import type { LanguagePreference } from '@/localization/languages';
import { useAppLanguage } from '@/localization/localization-provider';
import { DeveloperToolsPanel } from '@/presentation/components/settings/developer-tools-panel';
import { ProviderAccountBlock } from '@/presentation/components/settings/provider-account-block';
import { Badge } from '@/presentation/components/ui/badge';
import { Card } from '@/presentation/components/ui/card';
import { Icon } from '@/presentation/components/ui/icon';
import { MotionPressable } from '@/presentation/components/ui/motion-pressable';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/presentation/components/ui/radio-group';
import { Screen } from '@/presentation/components/ui/screen';
import { Text } from '@/presentation/components/ui/text';
import { useAuthSession } from '@/presentation/providers/auth-session-provider';
import { usePrimaryListProvider } from '@/presentation/providers/primary-list-provider-provider';
import { useApplicationRuntime } from '@/presentation/providers/runtime-provider';
import { cn } from '@/shared/rnr/utils';

const LANGUAGE_OPTIONS: readonly {
  value: LanguagePreference;
  labelKey: string;
}[] = [
  { value: 'system', labelKey: 'settings.languageSystem' },
  { value: 'en', labelKey: 'settings.languageEnglish' },
  { value: 'pt-BR', labelKey: 'settings.languagePortuguese' },
  { value: 'es', labelKey: 'settings.languageSpanish' },
];

const UNLOCK_TAP_WINDOW_MS = 3_000;

type UnlockFeedback = 'twoAway' | 'oneAway' | 'enabled' | null;

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
        <Text className="text-xs font-black uppercase tracking-[1.5px] text-muted-foreground">
          {title}
        </Text>
        {description ? <Text muted>{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function AccountSettings() {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <ProviderAccountBlock
        provider="anilist"
        providerImage={AniListIcon}
        providerName={t('auth.anilist')}
      />
      <ProviderAccountBlock
        provider="mal"
        providerImage={MyAnimeListIcon}
        providerName={t('auth.mal')}
        suffixAccessibilityLabels
      />
      <PrimaryListProviderSection />
    </View>
  );
}

const PRIMARY_LIST_PROVIDER_OPTIONS: readonly {
  value: AuthProviderId;
  labelKey: string;
}[] = [
  { value: 'anilist', labelKey: 'auth.anilist' },
  { value: 'mal', labelKey: 'auth.mal' },
];

function PrimaryListProviderSection() {
  const { t } = useTranslation();
  const { snapshot: authSnapshot } = useAuthSession();
  const { snapshot: primarySnapshot, select } = usePrimaryListProvider();
  const bothConnected =
    authSnapshot.connections.anilist.state === 'connected' &&
    authSnapshot.connections.mal.state === 'connected';

  if (!bothConnected) return null;

  const disabled = primarySnapshot.phase === 'loading';

  return (
    <Card className="gap-3 border-0 p-4 py-4">
      <View className="gap-1">
        <Text className="font-bold">{t('settings.primaryList')}</Text>
        <Text variant="caption" muted>
          {t('settings.primaryListDescription')}
        </Text>
      </View>
      <RadioGroup
        value={primarySnapshot.selected ?? undefined}
        onValueChange={(value) => void select(value as AuthProviderId)}
      >
        {PRIMARY_LIST_PROVIDER_OPTIONS.map((option) => {
          const label = t(option.labelKey);
          const selected = primarySnapshot.selected === option.value;
          return (
            <MotionPressable
              key={option.value}
              accessibilityLabel={label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              className={cn(
                'min-h-12 flex-row items-center gap-3 rounded-lg px-3',
                selected && 'bg-primary/10',
                disabled && 'opacity-60',
              )}
              disabled={disabled}
              onPress={() => void select(option.value)}
            >
              <Text
                className={cn(
                  'flex-1 font-semibold',
                  selected && 'text-primary-emphasis',
                )}
              >
                {label}
              </Text>
              <RadioGroupItem
                accessible={false}
                pointerEvents="none"
                value={option.value}
              />
            </MotionPressable>
          );
        })}
      </RadioGroup>
    </Card>
  );
}

export interface SettingsScreenProps {
  developerStorage?: DeveloperSettingsStore;
  versionReader?: () => string;
}

export function SettingsScreen({
  developerStorage: developerStorageOverride,
  versionReader = getAppVersion,
}: SettingsScreenProps = {}) {
  const { developerSettingsStore } = useApplicationRuntime();
  const developerStorage = developerStorageOverride ?? developerSettingsStore;
  const { t } = useTranslation();
  const { isChangingLanguage, preference, setPreference } = useAppLanguage();
  const appVersion = useMemo(() => versionReader(), [versionReader]);
  const [developerToolsEnabled, setDeveloperToolsEnabled] = useState(false);
  const [languageExpanded, setLanguageExpanded] = useState(false);
  const [unlockFeedback, setUnlockFeedback] = useState<UnlockFeedback>(null);
  const tapCount = useRef(0);
  const developerPreferenceChanged = useRef(false);
  const tapResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void developerStorage
      .getDeveloperToolsEnabled()
      .then((enabled) => {
        if (active && !developerPreferenceChanged.current)
          setDeveloperToolsEnabled(enabled);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [developerStorage]);

  useEffect(
    () => () => {
      if (tapResetTimer.current) clearTimeout(tapResetTimer.current);
    },
    [],
  );

  const resetTapSequence = () => {
    tapCount.current = 0;
    tapResetTimer.current = null;
    setUnlockFeedback(null);
  };

  const handleAboutTap = () => {
    if (developerToolsEnabled) return;
    if (tapResetTimer.current) clearTimeout(tapResetTimer.current);
    tapCount.current += 1;
    if (tapCount.current === 3) setUnlockFeedback('twoAway');
    if (tapCount.current === 4) setUnlockFeedback('oneAway');
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      tapResetTimer.current = null;
      setUnlockFeedback('enabled');
      developerPreferenceChanged.current = true;
      setDeveloperToolsEnabled(true);
      void developerStorage
        .setDeveloperToolsEnabled(true)
        .catch(() => undefined);
      return;
    }
    tapResetTimer.current = setTimeout(resetTapSequence, UNLOCK_TAP_WINDOW_MS);
  };

  const disableDeveloperTools = () => {
    developerPreferenceChanged.current = true;
    setDeveloperToolsEnabled(false);
    setUnlockFeedback(null);
    void developerStorage
      .setDeveloperToolsEnabled(false)
      .catch(() => undefined);
  };

  const feedbackText =
    unlockFeedback === 'twoAway'
      ? t('settings.developerTwoTapsAway')
      : unlockFeedback === 'oneAway'
        ? t('settings.developerOneTapAway')
        : unlockFeedback === 'enabled'
          ? t('settings.developerEnabled')
          : null;
  const selectedLanguage = LANGUAGE_OPTIONS.find(
    (option) => option.value === preference,
  );

  const applyLanguage = async (next: LanguagePreference) => {
    if (isChangingLanguage) return;
    await setPreference(next);
    setLanguageExpanded(false);
  };

  return (
    <Screen scroll contentClassName="gap-8 pt-2">
      <View className="min-h-16 justify-center">
        <Text variant="title">{t('settings.title')}</Text>
      </View>

      <SettingsSection title={t('settings.account')}>
        <AccountSettings />
      </SettingsSection>

      <SettingsSection title={t('settings.preferences')}>
        <Card className="gap-0 overflow-hidden border-0 p-0 py-0">
          <MotionPressable
            accessibilityLabel={t('settings.language')}
            accessibilityRole="button"
            accessibilityState={{ expanded: languageExpanded }}
            className="min-h-16 flex-row items-center gap-3 px-4"
            onPress={() => setLanguageExpanded((current) => !current)}
          >
            <Icon as={Languages} className="size-5 text-muted-foreground" />
            <View className="flex-1">
              <Text className="font-bold">{t('settings.language')}</Text>
              <Text variant="caption" muted>
                {selectedLanguage
                  ? t(selectedLanguage.labelKey)
                  : t('settings.languageSystem')}
              </Text>
            </View>
            <Icon
              as={languageExpanded ? ChevronUp : ChevronDown}
              className="size-5 text-muted-foreground"
            />
          </MotionPressable>

          {languageExpanded ? (
            <Animated.View
              entering={FadeIn.duration(260).reduceMotion(ReduceMotion.System)}
              exiting={FadeOut.duration(260).reduceMotion(ReduceMotion.System)}
              className="border-t border-border px-3 py-2"
            >
              <RadioGroup
                value={preference}
                onValueChange={(value) =>
                  void applyLanguage(value as LanguagePreference)
                }
              >
                {LANGUAGE_OPTIONS.map((option) => {
                  const label = t(option.labelKey);
                  const selected = preference === option.value;
                  return (
                    <MotionPressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityLabel={label}
                      accessibilityState={{
                        checked: selected,
                        disabled: isChangingLanguage,
                      }}
                      className={cn(
                        'min-h-12 flex-row items-center gap-3 rounded-lg px-3',
                        selected && 'bg-primary/10',
                        isChangingLanguage && 'opacity-60',
                      )}
                      disabled={isChangingLanguage}
                      onPress={() => void applyLanguage(option.value)}
                    >
                      <Text
                        className={cn(
                          'flex-1 font-semibold',
                          selected && 'text-primary-emphasis',
                        )}
                      >
                        {label}
                      </Text>
                      <RadioGroupItem
                        accessible={false}
                        pointerEvents="none"
                        value={option.value}
                      />
                    </MotionPressable>
                  );
                })}
              </RadioGroup>
            </Animated.View>
          ) : null}

          <View className="mx-4 h-px bg-border" />
          <View
            accessible
            accessibilityLabel={`${t('settings.theme')}, ${t('settings.themeDark')}`}
            className="min-h-16 flex-row items-center gap-3 px-4"
          >
            <Icon as={Moon} className="size-5 text-muted-foreground" />
            <Text className="flex-1 font-bold">{t('settings.theme')}</Text>
            <Text muted>{t('settings.themeDark')}</Text>
          </View>
        </Card>
        {isChangingLanguage ? (
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            variant="caption"
            muted
          >
            {t('settings.applyingLanguage')}
          </Text>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('settings.about')}>
        <Card className="gap-3 border-0 p-4 py-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-bold">Puriki</Text>
            <Badge variant="outline">
              <Text>{t('settings.version', { version: appVersion })}</Text>
            </Badge>
          </View>
          <Pressable accessible={false} onPress={handleAboutTap}>
            <Text muted>{t('settings.aboutDescription')}</Text>
          </Pressable>
          {feedbackText ? (
            <Text
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              variant="caption"
              className="text-primary-emphasis"
            >
              {feedbackText}
            </Text>
          ) : null}
        </Card>
      </SettingsSection>

      {developerToolsEnabled ? (
        <DeveloperToolsPanel
          appVersion={appVersion}
          onDisable={disableDeveloperTools}
        />
      ) : null}
    </Screen>
  );
}
