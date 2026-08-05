import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/presentation/components/ui/app-text';
import { colors, posterPalettes, radii } from '@/presentation/theme/tokens';
import { getTitleInitials } from '@/presentation/utils/title-initials';

interface PosterPlaceholderProps {
  title: string;
  seed: number;
  width?: number;
  height?: number;
}

export function PosterPlaceholder({
  title,
  seed,
  width = 142,
  height = 204,
}: PosterPlaceholderProps) {
  const palette =
    posterPalettes[Math.abs(seed) % posterPalettes.length] ?? posterPalettes[0];
  return (
    <LinearGradient
      accessibilityRole="image"
      accessibilityLabel={`Poster placeholder for ${title}`}
      testID={`poster-${seed}`}
      colors={[palette[0], palette[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { width, height }]}
    >
      <View style={styles.circleLarge} />
      <View style={styles.circleSmall} />
      <AppText style={styles.initials}>{getTitleInitials(title)}</AppText>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleLarge: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 24,
    borderColor: 'rgba(255,255,255,0.10)',
    top: -40,
    right: -50,
  },
  circleSmall: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(8,10,15,0.16)',
    bottom: -22,
    left: -18,
  },
  initials: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 30,
    letterSpacing: 2,
  },
});
