import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/presentation/components/ui/button';
import { EmptyState } from '@/presentation/components/ui/feedback';
import { Screen } from '@/presentation/components/ui/screen';
import { Text } from '@/presentation/components/ui/text';

export default function NotFoundScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <Screen>
      <EmptyState title={t('notFound.title')} message={t('notFound.message')} />
      <Button onPress={() => router.replace('/')}>
        <Text>{t('notFound.returnHome')}</Text>
      </Button>
    </Screen>
  );
}
