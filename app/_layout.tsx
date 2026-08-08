import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@/presentation/providers/app-providers';
import { colors } from '@/presentation/theme/tokens';
import { NAV_THEME } from '@/shared/rnr/theme';

export default function RootLayout() {
  return (
    <ThemeProvider value={NAV_THEME.dark}>
      <AppProviders>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="anime/[id]"
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <PortalHost />
      </AppProviders>
    </ThemeProvider>
  );
}
