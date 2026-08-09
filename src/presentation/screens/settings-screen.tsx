import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { getAppVersion } from '@/application/config/app-version';
import type { DeveloperSettingsStorage } from '@/infrastructure/storage/developer-settings-storage';
import { developerSettingsStorage } from '@/infrastructure/storage/developer-settings-storage';
import type { LanguagePreference } from '@/localization/languages';
import { useAppLanguage } from '@/localization/localization-provider';
import { AccountProfileCard } from '@/presentation/components/settings/account-profile-card';
import { DeveloperToolsPanel } from '@/presentation/components/settings/developer-tools-panel';
import { Badge } from '@/presentation/components/ui/badge';
import { Card } from '@/presentation/components/ui/card';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/presentation/components/ui/radio-group';
import { Screen } from '@/presentation/components/ui/screen';
import { Text } from '@/presentation/components/ui/text';
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
        <Text variant="heading">{title}</Text>
        {description ? <Text muted>{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export interface SettingsScreenProps {
  developerStorage?: DeveloperSettingsStorage;
  versionReader?: () => string;
}

export function SettingsScreen({
  developerStorage = developerSettingsStorage,
  versionReader = getAppVersion,
}: SettingsScreenProps = {}) {
  const { t } = useTranslation();
  const { isChangingLanguage, preference, setPreference } = useAppLanguage();
  const appVersion = useMemo(() => versionReader(), [versionReader]);
  const [developerToolsEnabled, setDeveloperToolsEnabled] = useState(false);
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

  return (
    <Screen scroll contentClassName="gap-8 pt-2">
      <View className="min-h-16 justify-center">
        <Text variant="title">{t('settings.title')}</Text>
      </View>

      <SettingsSection title={t('settings.account')}>
        <AccountProfileCard connectionState="disconnected" />
      </SettingsSection>

      <SettingsSection
        title={t('settings.language')}
        description={t('settings.languageDescription')}
      >
        <RadioGroup
          value={preference}
          onValueChange={(value) => {
            if (!isChangingLanguage)
              void setPreference(value as LanguagePreference);
          }}
        >
          {LANGUAGE_OPTIONS.map((option) => {
            const label = t(option.labelKey);
            const selected = preference === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{
                  checked: selected,
                  disabled: isChangingLanguage,
                }}
                className={cn(
                  'min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 active:opacity-80',
                  selected && 'border-primary bg-primary/10',
                  isChangingLanguage && 'opacity-60',
                )}
                disabled={isChangingLanguage}
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
            <Text className="font-bold">Purikuki</Text>
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
              className="text-primary"
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
