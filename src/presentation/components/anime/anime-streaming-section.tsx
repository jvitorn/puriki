import { Tv } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';

import type { AnimeStreamingService } from '@/domain/models/anime';
import { Card } from '@/presentation/components/ui/card';
import { Icon } from '@/presentation/components/ui/icon';
import { Text } from '@/presentation/components/ui/text';

export function AnimeStreamingSection({
  services,
}: {
  services: readonly AnimeStreamingService[];
}) {
  const { t } = useTranslation();
  if (services.length === 0) return null;

  return (
    <View className="gap-3">
      <Text variant="heading">{t('details.whereToWatch')}</Text>
      <View className="gap-3">
        {services.map((service, index) => (
          <Card
            key={`${service.name}:${index}`}
            accessible
            accessibilityLabel={t('details.streamingServiceA11y', {
              name: service.name,
            })}
            className="min-h-16 flex-row items-center gap-3 p-3 py-3"
          >
            {service.iconUrl ? (
              <Image
                accessible={false}
                accessibilityIgnoresInvertColors
                className="size-10 rounded-lg"
                resizeMode="contain"
                source={{ uri: service.iconUrl }}
                testID={`streaming-service-icon-${index}`}
              />
            ) : (
              <View
                accessible={false}
                className="size-10 items-center justify-center rounded-lg bg-muted"
                testID={`streaming-service-fallback-${index}`}
              >
                <Icon as={Tv} className="size-5 text-muted-foreground" />
              </View>
            )}
            <Text className="flex-1 font-semibold" numberOfLines={2}>
              {service.name}
            </Text>
          </Card>
        ))}
      </View>
    </View>
  );
}
