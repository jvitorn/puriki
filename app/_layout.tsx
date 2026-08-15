import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { ThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@/presentation/providers/app-providers';
import { OnboardingNavigator } from '@/presentation/providers/onboarding-provider';
import { NAV_THEME } from '@/shared/rnr/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <ThemeProvider value={NAV_THEME.dark}>
      <AppProviders>
        <StatusBar style="light" />
        <OnboardingNavigator />
        <PortalHost />
      </AppProviders>
    </ThemeProvider>
  );
}
