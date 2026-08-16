import { useLocalSearchParams } from 'expo-router';

import { AuthCallbackScreen } from '@/presentation/screens/auth-callback-screen';

export default function AuthCallbackRoute() {
  const { provider } = useLocalSearchParams<{ provider: string }>();
  return <AuthCallbackScreen provider={provider} />;
}
