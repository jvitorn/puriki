module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.svg$': '<rootDir>/src/tests/mocks/svg-mock.tsx',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@rn-primitives/.*|expo(nent)?|@expo(nent)?/.*|expo-.*|@expo/.*|@react-navigation/.*|react-native-svg|nativewind|react-native-css-interop)/)',
  ],
  collectCoverageFrom: [
    'src/application/auth/**/*.ts',
    'src/application/user-list/**/*.ts',
    'src/domain/rules/**/*.ts',
    'src/infrastructure/auth/**/*.ts',
    'src/infrastructure/api/mal/**/*.ts',
    'src/infrastructure/api/anilist/**/*.ts',
    'src/infrastructure/repositories/anilist/**/*.ts',
    'src/infrastructure/repositories/catalog/**/*.ts',
    'src/infrastructure/repositories/guest/**/*.ts',
    'src/infrastructure/repositories/mal/**/*.ts',
    'src/infrastructure/repositories/resilient/**/*.ts',
    'src/infrastructure/sync/**/*.ts',
    'src/shared/utils/**/*.ts',
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
  },
};
