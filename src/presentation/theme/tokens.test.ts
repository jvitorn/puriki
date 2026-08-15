import { colors } from '@/presentation/theme/tokens';
import { THEME } from '@/shared/rnr/theme';

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => channel(Number.parseInt(value, 16)));
  if (!channels || channels.length !== 3)
    throw new Error('Invalid test color.');
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  );
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe('Puriki theme', () => {
  it('uses the official brand colors without replacing the secondary', () => {
    expect(colors).toMatchObject({
      background: '#090C11',
      foreground: '#F8FAFC',
      primary: '#970C10',
      secondary: '#9B7BFF',
    });
    expect(THEME.dark.primary).toBe('hsl(358.27 85.28% 31.96%)');
    expect(THEME.dark.primaryForeground).toBe('hsl(210 40% 98%)');
  });

  it('keeps action text and small brand highlights legible', () => {
    expect(contrast(colors.foreground, colors.primary)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(colors.primaryEmphasis, colors.background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(THEME.dark.ring).toBe(THEME.dark.primaryEmphasis);
  });
});
