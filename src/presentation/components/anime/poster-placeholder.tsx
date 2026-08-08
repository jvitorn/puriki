import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/presentation/components/ui/text';
import { posterPalettes } from '@/presentation/theme/tokens';
import { getTitleInitials } from '@/presentation/utils/title-initials';
import { cn } from '@/shared/rnr/utils';

export function PosterPlaceholder({
  title,
  seed,
  imageUrl,
  width,
  height,
  className,
}: {
  title: string;
  seed: number;
  imageUrl?: string | null;
  width?: number;
  height?: number;
  className?: string;
}) {
  const palette =
    posterPalettes[Math.abs(seed) % posterPalettes.length] ?? posterPalettes[0];
  const source = imageUrl ? { uri: imageUrl } : undefined;
  const dynamicSize =
    width !== undefined || height !== undefined ? { width, height } : undefined;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Poster placeholder for ${title}`}
      className={cn(
        'relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted',
        className,
      )}
      style={dynamicSize}
      testID={`poster-${seed}`}
    >
      <LinearGradient
        colors={palette}
        start={{ x: 0.05, y: 0.05 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View className="absolute -right-8 -top-8 size-24 rounded-full bg-white/10" />
      <View className="absolute -bottom-5 -left-5 size-16 rounded-full bg-black/10" />
      <Text className="m-auto text-2xl font-black tracking-widest text-white/90">
        {getTitleInitials(title)}
      </Text>
      {source ? (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={`Poster for ${title}`}
          className="absolute inset-0 h-full w-full"
          resizeMode="cover"
          source={source}
        />
      ) : null}
    </View>
  );
}
