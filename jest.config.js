/** Solo se prueba lógica pura (motor quincenal y parsers), sin runtime nativo. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          target: 'es2020',
          lib: ['es2020'],
          esModuleInterop: true,
          types: ['jest', 'node'],
        },
      },
    ],
  },
};
