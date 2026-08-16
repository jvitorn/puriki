import { fireEvent, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Text as NativeText } from 'react-native';
import { withTiming } from 'react-native-reanimated';

import { PurikiTabBar } from '@/presentation/components/navigation/puriki-tab-bar';
import { renderWithProviders } from '@/tests/render/test-render';

function tabBarProps(index = 0) {
  const routes = ['index', 'search', 'my-list', 'settings'].map((name) => ({
    key: `${name}-key`,
    name,
    params: undefined,
  }));
  const labels = ['Home', 'Search', 'My List', 'Settings'];
  const descriptors = Object.fromEntries(
    routes.map((route, routeIndex) => [
      route.key,
      {
        options: {
          title: labels[routeIndex],
          tabBarAccessibilityLabel: labels[routeIndex],
          tabBarIcon: () => (
            <NativeText testID={`icon-${route.name}`}>icon</NativeText>
          ),
        },
      },
    ]),
  );
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  return {
    props: {
      state: {
        stale: false,
        type: 'tab',
        key: 'tabs',
        index,
        routeNames: routes.map((route) => route.name),
        routes,
        history: [],
        preloadedRouteKeys: [],
      },
      descriptors,
      navigation,
      insets: { top: 0, right: 0, bottom: 24, left: 0 },
    } as unknown as BottomTabBarProps,
    navigation,
  };
}

describe('PurikiTabBar', () => {
  it('keeps four accessible slots and shows a label only for the active tab', async () => {
    const { props } = tabBarProps();
    await renderWithProviders(<PurikiTabBar {...props} />);

    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByTestId('puriki-tab-bar')).toHaveStyle({
      paddingBottom: 24,
    });
    expect(screen.getByText('Home')).toBeVisible();
    expect(screen.queryByText('Search')).not.toBeOnTheScreen();
    expect(screen.queryByText('My List')).not.toBeOnTheScreen();
    expect(screen.queryByText('Settings')).not.toBeOnTheScreen();
    expect(
      screen.getByLabelText('Home').props.accessibilityState,
    ).toMatchObject({ selected: true });
  });

  it('preserves tab press and long-press navigation events', async () => {
    const { props, navigation } = tabBarProps();
    await renderWithProviders(<PurikiTabBar {...props} />);

    await fireEvent.press(screen.getByLabelText('Search'));
    expect(navigation.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'search-key',
      canPreventDefault: true,
    });
    expect(navigation.navigate).toHaveBeenCalledWith('search', undefined);

    await fireEvent(screen.getByLabelText('Settings'), 'longPress');
    expect(navigation.emit).toHaveBeenCalledWith({
      type: 'tabLongPress',
      target: 'settings-key',
    });
  });

  it('uses zero-duration timing when reduced motion is enabled', async () => {
    const { props } = tabBarProps();
    await renderWithProviders(<PurikiTabBar {...props} />);

    expect(jest.mocked(withTiming)).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ duration: 0 }),
    );
  });
});
