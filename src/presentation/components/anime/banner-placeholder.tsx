import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/presentation/components/ui/text';
import { posterPalettes } from '@/presentation/theme/tokens';
import { getTitleInitials } from '@/presentation/utils/title-initials';
import { cn } from '@/shared/rnr/utils';

export function BannerPlaceholder({
  title,
  seed,
  imageUrl,
  height,
  className,
}: {
  title: string;
  seed: number;
  imageUrl?: string | null;
  height: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const palette =
    posterPalettes[Math.abs(seed) % posterPalettes.length] ?? posterPalettes[0];
  const source = imageUrl ? { uri: imageUrl } : undefined;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t('common.bannerPlaceholder', { title })}
      className={cn('relative w-full overflow-hidden bg-muted', className)}
      style={{ height }}
      testID={`banner-${seed}`}
    >
      <LinearGradient
        colors={palette}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View className="absolute -right-10 -top-16 size-48 rounded-full bg-white/10" />
      <Text className="m-auto text-5xl font-black tracking-[10px] text-white/80">
        {getTitleInitials(title, 2)}
      </Text>
      {source ? (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={t('common.banner', { title })}
          className="absolute inset-0 h-full w-full"
          resizeMode="cover"
          source={source}
        />
      ) : null}
    </View>
  );
}
