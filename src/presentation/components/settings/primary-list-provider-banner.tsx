import { ListChecks } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { AuthProviderId } from '@/domain/models/auth';
import { Button } from '@/presentation/components/ui/button';
import { Icon } from '@/presentation/components/ui/icon';
import { Text } from '@/presentation/components/ui/text';

export interface PrimaryListProviderBannerProps {
  onSelect(provider: AuthProviderId): void | Promise<void>;
}

export function PrimaryListProviderBanner({
  onSelect,
}: PrimaryListProviderBannerProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<AuthProviderId | null>(null);

  const choose = async (provider: AuthProviderId) => {
    if (pending) return;
    setPending(provider);
    try {
      await onSelect(provider);
    } finally {
      setPending(null);
    }
  };

  return (
    <View
      accessible
      accessibilityRole="alert"
      className="min-h-48 items-center justify-center gap-3 px-6 py-8"
    >
      <View className="mb-1 size-12 items-center justify-center rounded-full bg-primary/15">
        <Icon as={ListChecks} className="size-6 text-primary-emphasis" />
      </View>
      <Text variant="heading" className="text-center">
        {t('myList.primaryProviderBannerTitle')}
      </Text>
      <Text muted className="max-w-md text-center">
        {t('myList.primaryProviderBannerMessage')}
      </Text>
      <View className="mt-2 flex-row flex-wrap justify-center gap-2">
        <Button
          accessibilityLabel={t('myList.primaryProviderUseAniList')}
          disabled={pending !== null}
          onPress={() => void choose('anilist')}
        >
          <Text>{t('myList.primaryProviderUseAniList')}</Text>
        </Button>
        <Button
          accessibilityLabel={t('myList.primaryProviderUseMal')}
          disabled={pending !== null}
          variant="outline"
          onPress={() => void choose('mal')}
        >
          <Text>{t('myList.primaryProviderUseMal')}</Text>
        </Button>
      </View>
    </View>
  );
}
