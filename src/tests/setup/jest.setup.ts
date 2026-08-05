import 'react-native-gesture-handler/jestSetup';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: '1' }),
  Stack: Object.assign(() => null, { Screen: () => null }),
  Tabs: Object.assign(() => null, { Screen: () => null }),
}));
