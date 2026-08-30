import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import type { OnboardingStore } from '@/application/runtime/application-runtime';
import { useAuthSession } from '@/presentation/providers/auth-session-provider';
import { useOptionalApplicationRuntime } from '@/presentation/providers/runtime-provider';
import { colors } from '@/presentation/theme/tokens';

type OnboardingStatus = 'unknown' | 'completed' | 'notCompleted';

interface OnboardingContextValue {
  completeOnboarding(): Promise<void>;
  onboardingCompleted: boolean;
}

interface SplashController {
  hideAsync(): Promise<void>;
}

interface OnboardingNavigatorProps {
  storage?: OnboardingStore;
  splash?: SplashController;
}

interface OnboardingGateProps extends OnboardingNavigatorProps {
  children(status: Exclude<OnboardingStatus, 'unknown'>): ReactNode;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingGate({
  children,
  storage: storageOverride,
  splash = SplashScreen,
}: OnboardingGateProps) {
  const runtime = useOptionalApplicationRuntime();
  const storage = storageOverride ?? runtime?.onboardingStore;
  if (!storage) {
    throw new Error(
      'OnboardingGate requires a storage override or an ApplicationRuntime.',
    );
  }
  const [status, setStatus] = useState<OnboardingStatus>('unknown');
  const { snapshot: authSession } = useAuthSession();

  useEffect(() => {
    let active = true;
    void storage
      .hasCompleted()
      .then((completed) => {
        if (active) setStatus(completed ? 'completed' : 'notCompleted');
      })
      .catch(() => {
        if (active) setStatus('notCompleted');
      });
    return () => {
      active = false;
    };
  }, [storage]);

  useEffect(() => {
    if (status !== 'unknown' && authSession.phase === 'ready') {
      void splash.hideAsync().catch(() => undefined);
    }
  }, [authSession.phase, splash, status]);

  const completeOnboarding = useCallback(async () => {
    try {
      await storage.markCompleted();
    } catch {
      // Do not trap the user in onboarding when local persistence is unavailable.
    } finally {
      setStatus('completed');
    }
  }, [storage]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      completeOnboarding,
      onboardingCompleted: status === 'completed',
    }),
    [completeOnboarding, status],
  );

  if (status === 'unknown' || authSession.phase !== 'ready') return null;

  return (
    <OnboardingContext.Provider value={value}>
      {children(status)}
    </OnboardingContext.Provider>
  );
}

export function OnboardingNavigator(props: OnboardingNavigatorProps = {}) {
  return (
    <OnboardingGate {...props}>
      {(status) => (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen
            name="auth/[provider]"
            options={{ animation: 'none' }}
          />
          <Stack.Protected guard={status === 'notCompleted'}>
            <Stack.Screen name="onboarding/index" />
          </Stack.Protected>
          <Stack.Protected guard={status === 'completed'}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="anime/[id]"
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen name="+not-found" />
          </Stack.Protected>
        </Stack>
      )}
    </OnboardingGate>
  );
}

export function useOnboardingCompletion(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error(
      'useOnboardingCompletion must be used inside OnboardingNavigator.',
    );
  }
  return context;
}
