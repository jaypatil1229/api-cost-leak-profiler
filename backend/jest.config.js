/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  rootDir: '.',
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testRegex: '.*\\.spec\\.ts$',
      testPathIgnorePatterns: ['\\.int-spec\\.ts$', '/node_modules/', '/dist/'],
      moduleFileExtensions: ['js', 'json', 'ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }],
      },
      setupFilesAfterEnv: ['<rootDir>/test/setup-unit.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testRegex: '.*\\.int-spec\\.ts$',
      testPathIgnorePatterns: ['/node_modules/', '/dist/'],
      moduleFileExtensions: ['js', 'json', 'ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }],
      },
      setupFilesAfterEnv: ['<rootDir>/test/setup-integration.ts'],
      testTimeout: 30000,
    },
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/**/*.dto.ts'],
  coverageDirectory: './coverage',
};
