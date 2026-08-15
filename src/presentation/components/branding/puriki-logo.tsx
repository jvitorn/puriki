import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

import HorizontalDark from '../../../../assets/brand/svg/puriki-horizontal-dark.svg';
import HorizontalLight from '../../../../assets/brand/svg/puriki-horizontal-light.svg';
import MarkDark from '../../../../assets/brand/svg/puriki-mark-dark.svg';
import MarkLight from '../../../../assets/brand/svg/puriki-mark-light.svg';
import StackedDark from '../../../../assets/brand/svg/puriki-stacked-dark.svg';
import StackedLight from '../../../../assets/brand/svg/puriki-stacked-light.svg';

export type PurikiLogoVariant = 'horizontal' | 'mark' | 'stacked';
export type PurikiLogoColorScheme = 'dark' | 'light';

type LogoComponent = ComponentType<SvgProps>;

const LOGOS: Record<
  PurikiLogoVariant,
  Record<PurikiLogoColorScheme, LogoComponent>
> = {
  horizontal: { dark: HorizontalDark, light: HorizontalLight },
  mark: { dark: MarkDark, light: MarkLight },
  stacked: { dark: StackedDark, light: StackedLight },
};

const ASPECT_RATIOS: Record<
  PurikiLogoVariant,
  Record<PurikiLogoColorScheme, number>
> = {
  horizontal: {
    dark: 1362.3991 / 373.14062,
    light: 1362.3914 / 373.30468,
  },
  mark: {
    dark: 1147.3555 / 1146.0937,
    light: 1147.3555 / 1146.0937,
  },
  stacked: {
    dark: 1103.4451 / 991.73488,
    light: 1103.4451 / 985.0313,
  },
};

const DEFAULT_HEIGHTS: Record<PurikiLogoVariant, number> = {
  horizontal: 32,
  mark: 32,
  stacked: 72,
};

export interface PurikiLogoProps extends Omit<SvgProps, 'height' | 'width'> {
  variant?: PurikiLogoVariant;
  colorScheme?: PurikiLogoColorScheme;
  height?: number;
}

export function PurikiLogo({
  accessibilityLabel = 'Puriki',
  colorScheme = 'dark',
  height,
  testID,
  variant = 'horizontal',
  ...props
}: PurikiLogoProps) {
  const Logo = LOGOS[variant][colorScheme];
  const resolvedHeight = height ?? DEFAULT_HEIGHTS[variant];

  return (
    <Logo
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      height={resolvedHeight}
      testID={testID ?? `puriki-logo-${variant}-${colorScheme}`}
      width={resolvedHeight * ASPECT_RATIOS[variant][colorScheme]}
      {...props}
    />
  );
}
