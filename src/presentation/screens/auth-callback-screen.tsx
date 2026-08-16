import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { AUTH_PROVIDER_IDS } from '@/domain/models/auth';
import type { AuthProviderId } from '@/domain/models/auth';
import { Text } from '@/presentation/components/ui/text';
import { useAuthSession } from '@/presentation/providers/auth-session-provider';
import { useOnboardingCompletion } from '@/presentation/providers/onboarding-provider';

function isAuthProviderId(value: string): value is AuthProviderId {
  return AUTH_PROVIDER_IDS.some((provider) => provider === value);
}

export function AuthCallbackScreen({ provider }: { provider: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { snapshot } = useAuthSession();
  const { onboardingCompleted } = useOnboardingCompletion();
  const navigated = useRef(false);
  const operation = isAuthProviderId(provider)
    ? snapshot.connections[provider].operation
    : 'idle';

  useEffect(() => {
    if (operation !== 'idle' || navigated.current) return;
    navigated.current = true;
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(onboardingCompleted ? '/settings' : '/onboarding');
  }, [onboardingCompleted, operation, router]);

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background">
      <ActivityIndicator accessibilityLabel={t('common.loadingContent')} />
      <Text muted>{t('auth.checking')}</Text>
    </View>
  );
}
