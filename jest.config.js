module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-.*|@expo/.*|@react-navigation/.*|react-native-svg|nativewind|react-native-css-interop|@faker-js/faker)/)',
  ],
  collectCoverageFrom: [
    'src/domain/rules/**/*.ts',
    'src/infrastructure/api/jikan/**/*.ts',
    'src/infrastructure/api/mal/**/*.ts',
    'src/infrastructure/repositories/mock/**/*.ts',
    'src/infrastructure/repositories/jikan/**/*.ts',
    'src/infrastructure/repositories/mal/**/*.ts',
    'src/infrastructure/repositories/resilient/**/*.ts',
    'src/infrastructure/repositories/session/**/*.ts',
    'src/mocks/factories/**/*.ts',
    'src/shared/utils/**/*.ts',
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
  },
};
