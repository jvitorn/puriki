import { useRouter } from 'expo-router';

import { Button } from '@/presentation/components/ui/button';
import { EmptyState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';
import { Text } from '@/presentation/components/ui/text';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        title="Screen not found"
        message="The requested screen does not exist."
      />
      <Button onPress={() => router.replace('/')}>
        <Text>Return home</Text>
      </Button>
    </Screen>
  );
}
