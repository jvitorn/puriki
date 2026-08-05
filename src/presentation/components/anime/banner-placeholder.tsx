import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/presentation/components/ui/app-text';
import { colors, posterPalettes, radii } from '@/presentation/theme/tokens';
import { getTitleInitials } from '@/presentation/utils/title-initials';

export function BannerPlaceholder({
  title,
  seed,
  height = 280,
}: {
  title: string;
  seed: number;
  height?: number;
}) {
  const palette =
    posterPalettes[Math.abs(seed) % posterPalettes.length] ?? posterPalettes[0];
  return (
    <LinearGradient
      accessibilityRole="image"
      accessibilityLabel={`Banner placeholder for ${title}`}
      colors={[palette[1], palette[0], colors.background]}
      locations={[0, 0.55, 1]}
      style={[styles.container, { height }]}
    >
      <View style={styles.orbit} />
      <AppText style={styles.initials}>{getTitleInitials(title, 2)}</AppText>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: radii.lg,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbit: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 42,
    borderColor: 'rgba(255,255,255,0.08)',
    right: -50,
    top: -70,
    transform: [{ rotate: '18deg' }],
  },
  initials: {
    fontSize: 62,
    lineHeight: 68,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.24)',
    letterSpacing: 8,
  },
});
