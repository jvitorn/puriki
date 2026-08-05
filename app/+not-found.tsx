import { useRouter } from 'expo-router';

import { Button } from '@/presentation/components/ui/button';
import { EmptyState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        title="Screen not found"
        message="The requested screen does not exist."
      />
      <Button label="Return home" onPress={() => router.replace('/')} />
    </Screen>
  );
}
