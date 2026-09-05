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
    useRouter: () => ({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: () => false,
    }),
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
    withInitialValues: () => animationBuilder,
  };
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (component: unknown) => component,
    },
    Easing: {
      cubic: jest.fn(),
      quad: jest.fn(),
      out: (easing: unknown) => easing,
    },
    FadeIn: animationBuilder,
    FadeInDown: animationBuilder,
    FadeOut: animationBuilder,
    LinearTransition: animationBuilder,
    ReduceMotion: { System: 'system' },
    ZoomIn: animationBuilder,
    interpolate: (
      value: number,
      input: [number, number],
      output: [number, number],
    ) =>
      output[0] +
      ((value - input[0]) / (input[1] - input[0])) * (output[1] - output[0]),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: jest.fn(() => true),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: jest.fn(
      (
        value: unknown,
        _config?: unknown,
        callback?: (finished: boolean) => void,
      ) => {
        callback?.(true);
        return value;
      },
    ),
  };
});
