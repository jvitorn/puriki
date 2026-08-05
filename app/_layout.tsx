import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@/presentation/providers/app-providers';
import { colors } from '@/presentation/theme/tokens';

export default function RootLayout() {
  return (
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
    </AppProviders>
  );
}
