import { Tv } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';

import type { AnimeStreamingService } from '@/domain/models/anime';
import { Card } from '@/presentation/components/ui/card';
import { Icon } from '@/presentation/components/ui/icon';
import { Text } from '@/presentation/components/ui/text';
import { cn } from '@/shared/rnr/utils';

const STREAMING_GRID_COLUMNS = 2;

// Rows of at most two services. A single service keeps a full-width card
// instead of being squeezed into a half-width column.
function streamingRows(
  services: readonly AnimeStreamingService[],
): (readonly AnimeStreamingService[])[] {
  if (services.length <= 1) return [services];
  const rows: AnimeStreamingService[][] = [];
  for (
    let index = 0;
    index < services.length;
    index += STREAMING_GRID_COLUMNS
  ) {
    rows.push(services.slice(index, index + STREAMING_GRID_COLUMNS));
  }
  return rows;
}

function StreamingServiceCard({
  service,
  index,
  columnar,
}: {
  service: AnimeStreamingService;
  index: number;
  columnar: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card
      accessible
      accessibilityLabel={t('details.streamingServiceA11y', {
        name: service.name,
      })}
      className={cn(
        'min-h-16 flex-row items-center gap-2 p-3 py-3',
        columnar && 'flex-1',
      )}
    >
      {service.iconUrl ? (
        <Image
          accessible={false}
          accessibilityIgnoresInvertColors
          className="size-8 rounded-lg"
          resizeMode="contain"
          source={{ uri: service.iconUrl }}
          testID={`streaming-service-icon-${index}`}
        />
      ) : (
        <View
          accessible={false}
          className="size-8 items-center justify-center rounded-lg bg-muted"
          testID={`streaming-service-fallback-${index}`}
        >
          <Icon as={Tv} className="size-4 text-muted-foreground" />
        </View>
      )}
      <Text className="flex-1 text-sm font-semibold" numberOfLines={2}>
        {service.name}
      </Text>
    </Card>
  );
}

export function AnimeStreamingSection({
  services,
}: {
  services: readonly AnimeStreamingService[];
}) {
  const { t } = useTranslation();
  if (services.length === 0) return null;

  const columnar = services.length > 1;
  const rows = streamingRows(services);

  return (
    <View className="gap-3">
      <Text variant="heading">{t('details.whereToWatch')}</Text>
      <View className="gap-3">
        {rows.map((row, rowIndex) => (
          <View
            className={columnar ? 'flex-row gap-3' : undefined}
            key={rowIndex}
          >
            {row.map((service, columnIndex) => (
              <StreamingServiceCard
                columnar={columnar}
                index={rowIndex * STREAMING_GRID_COLUMNS + columnIndex}
                key={`${service.name}:${rowIndex * STREAMING_GRID_COLUMNS + columnIndex}`}
                service={service}
              />
            ))}
            {columnar && row.length > 1 && row.length < STREAMING_GRID_COLUMNS ? (
              <View className="flex-1" />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
