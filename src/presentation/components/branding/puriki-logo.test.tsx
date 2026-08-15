import { render, screen } from '@testing-library/react-native';

import { PurikiLogo } from '@/presentation/components/branding/puriki-logo';

describe('PurikiLogo', () => {
  it('renders the official horizontal dark lockup at a proportional size', async () => {
    await render(<PurikiLogo />);

    const logo = screen.getByTestId('puriki-logo-horizontal-dark');
    expect(logo).toHaveProp('accessibilityLabel', 'Puriki');
    expect(logo).toHaveProp('accessibilityRole', 'image');
    expect(logo).toHaveProp('height', 32);
    expect(logo.props.width).toBeCloseTo(116.83, 1);
  });

  it.each([
    ['horizontal', 'light'],
    ['mark', 'dark'],
    ['stacked', 'light'],
  ] as const)(
    'selects the %s %s official asset',
    async (variant, colorScheme) => {
      await render(<PurikiLogo variant={variant} colorScheme={colorScheme} />);

      expect(
        screen.getByTestId(`puriki-logo-${variant}-${colorScheme}`),
      ).toBeVisible();
    },
  );
});
