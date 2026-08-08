import { View } from 'react-native';

import { Text } from '@/presentation/components/ui/text';

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="mb-4 gap-1">
      <Text variant="heading">{title}</Text>
      {subtitle ? (
        <Text variant="caption" muted>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
