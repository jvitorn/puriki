import 'react-native-gesture-handler/jestSetup';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Stack = Object.assign(
    ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
    {
      Protected: ({
        children,
        guard,
      }: {
        children?: React.ReactNode;
        guard: boolean;
      }) =>
        guard ? React.createElement(React.Fragment, null, children) : null,
      Screen: ({ name }: { name: string }) =>
        React.createElement(View, { testID: `stack-screen-${name}` }),
    },
  );
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => ({ id: '1' }),
    Stack,
    Tabs: Object.assign(() => null, { Screen: () => null }),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const animationBuilder = {
    delay: () => animationBuilder,
    duration: () => animationBuilder,
    reduceMotion: () => animationBuilder,
  };
  return {
    __esModule: true,
    default: { View },
    FadeInDown: animationBuilder,
    ReduceMotion: { System: 'system' },
    useReducedMotion: () => true,
  };
});
