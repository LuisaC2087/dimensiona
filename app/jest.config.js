/** Pruebas de la lógica pura (src/lib). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/lib'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: true, esModuleInterop: true, isolatedModules: true, rootDir: '.', types: ['jest'] } }],
  },
};
